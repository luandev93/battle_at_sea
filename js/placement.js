import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from './firebase-config.js';
import { dom } from './dom.js';
import { state } from './state.js';
import { GRID_SIZE, coordToCellId, cellIdToCoord } from './utils.js';
import { fleetBlueprints, getBlueprint, getShipLabel } from './fleetBlueprints.js';
import { getShipIconSvg } from './shipIcons.js';
import { coordsForPlacement, coordsForPlacementClamped, getPatternBounds, rotateAndFlipPattern } from './shipGeometry.js';
import { canPlaceWithSpacing, buildPlayerFleetFromPlacement } from './fleet.js';
import { getCellElement } from './board.js';
import { setBattleStatus, showLobbyScreen } from './ui.js';


const DEFAULT_HINT = 'Toque numa casa para posicionar o navio. Arraste para ajustar antes de soltar.';

// Setup feedback has to land in the setup panel: the global error box
// lives on the login screen and is invisible from here.
function setSetupMessage(text, isError = false) {
  if (!dom.setupMessage) return;
  dom.setupMessage.textContent = text || DEFAULT_HINT;
  dom.setupMessage.classList.toggle('setup-message-error', Boolean(isError));
}

let ghostEl = null;
let dragShipId = null;
let dragIsReposition = false;
let dragOriginalCoords = null;
let dragOriginalOrientation = null;
let dragOriginalDir = null;

// Ships may never touch, not even diagonally, so the check has to look
// at the ring around each cell. `selfId` lets a ship ignore its own
// footprint while it is being nudged or rotated in place.
function canPlace(coords, selfId = null) {
  return canPlaceWithSpacing(state.placement.grid, coords, selfId);
}

// One default colour per hull type, so the fleet reads as distinct
// vessels at a glance; the player can override any of them.
// Fixed identity per hull type. Chosen to stay legible against the light
// blue sea and to be distinguishable from each other and from the red of
// damage markers.
const COLOR_BY_TYPE = {
  admiral: '#e0a938',    // gold — flagship
  hospital: '#e35d6a',   // red cross
  aircraft: '#3fb98f',   // green — air wing
  destroyer: '#4a90d9',  // navy blue
  torpedo: '#e0854a',    // orange — fast attack
  carrier: '#9b7fd4',    // purple — supply
  submarine: '#5fb3c9',  // cyan — submerged
};

export function initPlacement() {
  const grid = Array.from({ length: GRID_SIZE }, () => Array(GRID_SIZE).fill(null));
  const ships = [];

  fleetBlueprints.forEach((blueprint) => {
    const count = blueprint.count || 1;
    for (let i = 0; i < count; i += 1) {
      ships.push({
        id: `s${ships.length}`,
        type: blueprint.type,
        coords: [],
        orientation: 'horizontal',
        dir: 1,
        color: COLOR_BY_TYPE[blueprint.type] || '#4a90d9',
      });
    }
  });

  state.placement = { grid, ships };
  state.activeShipId = null;
}

// --- rendering ---------------------------------------------------------

// Builds a small grid of filled/empty squares that traces a ship's
// actual silhouette (rotated to match the current placing orientation)
// instead of showing a plain text label.
function buildSilhouette(ship) {
  const blueprint = getBlueprint(ship.type);
  if (!blueprint) return document.createElement('div');

  const pattern = rotateAndFlipPattern(blueprint.pattern, state.placingOrientation, state.placingDir);
  const { rows, cols } = getPatternBounds(pattern);
  const filled = new Set(pattern.map((c) => `${c.row},${c.col}`));

  const el = document.createElement('div');
  el.className = 'ship-silhouette';
  el.style.gridTemplateRows = `repeat(${rows}, 1fr)`;
  el.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;

  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      const cell = document.createElement('span');
      cell.className = filled.has(`${r},${c}`) ? 'hull-cell' : 'hull-cell hull-cell-empty';
      el.appendChild(cell);
    }
  }
  return el;
}

// The old inventory listed all 13 ships as cards, which on a phone
// pushed the board completely off-screen: you could see the fleet or the
// grid, never both. Instead we show one ship at a time with < > arrows,
// so the whole setup UI fits in a single compact strip under the board.

function unplacedShips() {
  return state.placement.ships.filter((s) => s.coords.length === 0);
}

// Selection always points at the next unplaced ship, in fleet order.
function normalizeSelection() {
  const pending = unplacedShips();
  state.selectedShipId = pending.length ? pending[0].id : null;
}

export function renderInventory() {
  if (!dom.shipSelector) return;
  normalizeSelection();

  const pending = unplacedShips();
  const total = state.placement.ships.length;
  const placed = total - pending.length;

  renderFleetRoster();

  if (pending.length === 0) {
    dom.shipSelector.innerHTML = `
      <div class="selector-done">
        <strong>Frota completa</strong>
        <span>${total}/${total} navios na grade — toque em Salvar</span>
      </div>`;
    return;
  }

  // The order is fixed: the player always deploys whatever comes next,
  // so there is nothing to choose and no arrows to get lost in.
  const ship = pending[0];
  const sameType = pending.filter((s) => s.type === ship.type).length;

  dom.shipSelector.innerHTML = `
    <div class="selector-body">
      <div class="selector-icon" style="color:${ship.color}">${getShipIconSvg(ship.type)}</div>
      <div class="selector-meta">
        <span class="selector-name">${getShipLabel(ship)}</span>
        <span class="selector-count">${sameType > 1 ? `${sameType} deste tipo · ` : ''}${placed}/${total} na grade</span>
      </div>
    </div>
    <button type="button" class="selector-add" id="add-to-grid">Adicionar</button>`;

  dom.shipSelector.querySelector('#add-to-grid')?.addEventListener('click', addSelectedToGrid);
}

// Roster of the whole fleet grouped by type, showing how many of each
// still have to go on the board.
function renderFleetRoster() {
  if (!dom.fleetRoster) return;

  const byType = new Map();
  state.placement.ships.forEach((ship) => {
    const entry = byType.get(ship.type) || { type: ship.type, total: 0, left: 0, color: ship.color, label: getShipLabel(ship) };
    entry.total += 1;
    if (ship.coords.length === 0) entry.left += 1;
    byType.set(ship.type, entry);
  });

  dom.fleetRoster.innerHTML = [...byType.values()]
    .map(
      (e) => `
      <div class="roster-item${e.left === 0 ? ' roster-item-done' : ''}" title="${e.label}">
        <span class="roster-icon" style="color:${e.color}">${getShipIconSvg(e.type)}</span>
        <span class="roster-count">${e.left}/${e.total}</span>
      </div>`
    )
    .join('');
}

// --- Add-to-grid then nudge into position -------------------------------

export function getActiveShip() {
  return state.placement?.ships.find((s) => s.id === state.activeShipId) || null;
}

function occupy(ship, coords) {
  ship.coords = coords;
  coords.forEach(({ row, col }) => {
    state.placement.grid[row][col] = ship.id;
  });
}

function vacate(ship) {
  ship.coords.forEach(({ row, col }) => {
    state.placement.grid[row][col] = null;
  });
  ship.coords = [];
}

// Drops the selected ship onto the first spot that satisfies the spacing
// rule, scanning from the top-left, then makes it the active piece so the
// movement controls take over.
export function addSelectedToGrid() {
  normalizeSelection();
  const ship = state.placement.ships.find((s) => s.id === state.selectedShipId);
  if (!ship) {
    setSetupMessage('Todos os navios já estão na grade.', true);
    return;
  }

  for (let cellId = 1; cellId <= GRID_SIZE * GRID_SIZE; cellId += 1) {
    const coords = coordsForPlacementClamped(cellId, ship, state.placingOrientation, state.placingDir);
    if (coords && canPlace(coords, ship.id)) {
      ship.orientation = state.placingOrientation;
      ship.dir = state.placingDir;
      occupy(ship, coords);
      state.activeShipId = ship.id;
      renderPlacementToDOM();
      renderInventory();
      setSetupMessage(`${getShipLabel(ship)} na grade. Use as setas para posicionar.`);
      return;
    }
  }
  setSetupMessage('Sem espaço livre para este navio. Remova ou reposicione outro.', true);
}

// Shifts the active ship by one cell, if the destination is legal.
export function moveActiveShip(dRow, dCol) {
  const ship = getActiveShip();
  if (!ship || ship.coords.length === 0) {
    setSetupMessage('Adicione um navio à grade antes de movê-lo.', true);
    return;
  }

  const target = ship.coords.map(({ row, col }) => ({ row: row + dRow, col: col + dCol }));
  if (target.some(({ row, col }) => row < 0 || row >= GRID_SIZE || col < 0 || col >= GRID_SIZE)) {
    setSetupMessage('O navio chegou à borda do tabuleiro.', true);
    return;
  }

  const previous = ship.coords;
  vacate(ship);
  if (canPlace(target, ship.id)) {
    occupy(ship, target);
    setSetupMessage('');
  } else {
    occupy(ship, previous);
    setSetupMessage('Movimento bloqueado: navios não podem se encostar.', true);
  }
  renderPlacementToDOM();
}

// Re-orients the active ship around its current anchor. Falls back to
// the global orientation for the *next* ship when nothing is active.
function reorientActive(nextOrientation, nextDir) {
  const ship = getActiveShip();
  state.placingOrientation = nextOrientation;
  state.placingDir = nextDir;

  if (!ship || ship.coords.length === 0) {
    renderInventory();
    return;
  }

  const anchor = ship.coords.reduce(
    (acc, c) => ({ row: Math.min(acc.row, c.row), col: Math.min(acc.col, c.col) }),
    { row: GRID_SIZE, col: GRID_SIZE }
  );
  const anchorCell = coordToCellId(anchor.row, anchor.col);
  const target = coordsForPlacementClamped(anchorCell, ship, nextOrientation, nextDir);

  const previous = ship.coords;
  vacate(ship);
  if (target && canPlace(target, ship.id)) {
    ship.orientation = nextOrientation;
    ship.dir = nextDir;
    occupy(ship, target);
    setSetupMessage('');
  } else {
    occupy(ship, previous);
    setSetupMessage('Não há espaço para girar aqui. Mova o navio e tente de novo.', true);
  }
  renderPlacementToDOM();
  renderInventory();
}

export function rotateActive() {
  reorientActive(state.placingOrientation === 'horizontal' ? 'vertical' : 'horizontal', state.placingDir);
}

export function flipActive() {
  reorientActive(state.placingOrientation, state.placingDir === 1 ? -1 : 1);
}

export function renderPlacementToDOM() {
  if (!dom.myGrid) return;
  const cells = dom.myGrid.querySelectorAll('.board-cell');
  cells.forEach((cell) => {
    cell.classList.remove(
      'board-cell-fleet',
      'board-cell-fleet-active',
      'board-cell-fleet-preview',
      'board-cell-fleet-invalid'
    );
    cell.style.removeProperty('--ship-color');
  });

  state.placement.ships.forEach((ship) => {
    const isActive = ship.id === state.activeShipId;
    ship.coords.forEach(({ row, col }) => {
      const cell = getCellElement(dom.myGrid, coordToCellId(row, col));
      if (!cell) return;
      cell.classList.add('board-cell-fleet');
      if (isActive) cell.classList.add('board-cell-fleet-active');
      cell.style.setProperty('--ship-color', ship.color);
    });
  });
}

// --- drag preview -------------------------------------------------------

function createGhost() {
  const el = document.createElement('div');
  el.className = 'drag-ghost';
  document.body.appendChild(el);
  return el;
}

function positionGhost(clientX, clientY) {
  if (!ghostEl) return;
  ghostEl.style.left = `${clientX}px`;
  ghostEl.style.top = `${clientY}px`;
}

function clearPreview() {
  dom.myGrid?.querySelectorAll('.board-cell-fleet-preview, .board-cell-fleet-invalid').forEach((cell) => {
    cell.classList.remove('board-cell-fleet-preview', 'board-cell-fleet-invalid');
  });
}

function showPreview(coords, valid) {
  clearPreview();
  coords.forEach(({ row, col }) => {
    const cell = getCellElement(dom.myGrid, coordToCellId(row, col));
    cell?.classList.add(valid ? 'board-cell-fleet-preview' : 'board-cell-fleet-invalid');
  });
}

function findGridCellUnderPointer(clientX, clientY) {
  const el = document.elementFromPoint(clientX, clientY);
  const cell = el?.closest('.board-cell');
  return cell && dom.myGrid?.contains(cell) ? cell : null;
}

// --- drag lifecycle -------------------------------------------------------

function startDrag(shipId, clientX, clientY) {
  dragShipId = shipId;
  ghostEl = createGhost();
  ghostEl.appendChild(buildSilhouette(state.placement.ships.find((s) => s.id === shipId)));
  positionGhost(clientX, clientY);

  window.addEventListener('pointermove', handleDragMove);
  window.addEventListener('pointerup', handleDragEnd, { once: true });
  window.addEventListener('pointercancel', handleDragCancel, { once: true });
}

function startDragFromGrid(event, shipId) {
  event.preventDefault();
  const ship = state.placement.ships.find((s) => s.id === shipId);
  if (!ship) return;

  dragIsReposition = true;
  dragOriginalCoords = ship.coords.slice();
  dragOriginalOrientation = ship.orientation;
  dragOriginalDir = ship.dir;

  // temporarily lift the ship off the grid so overlap checks against
  // itself don't false-positive while previewing the new spot
  ship.coords.forEach(({ row, col }) => {
    state.placement.grid[row][col] = null;
  });
  ship.coords = [];
  renderPlacementToDOM();

  startDrag(shipId, event.clientX, event.clientY);
}

function handleDragMove(event) {
  positionGhost(event.clientX, event.clientY);
  const cell = findGridCellUnderPointer(event.clientX, event.clientY);
  if (!cell) {
    clearPreview();
    return;
  }

  const ship = state.placement.ships.find((s) => s.id === dragShipId);
  const coords = coordsForPlacementClamped(cell.dataset.cell, ship, state.placingOrientation, state.placingDir);
  if (!coords) {
    clearPreview();
    return;
  }
  showPreview(coords, canPlace(coords, ship.id));
}

function commitPlacement(ship, coords) {
  state.activeShipId = ship.id;
  ship.coords = coords;
  ship.orientation = state.placingOrientation;
  ship.dir = state.placingDir;
  coords.forEach(({ row, col }) => {
    state.placement.grid[row][col] = ship.id;
  });
}

function restoreOriginalPosition(ship) {
  if (!dragOriginalCoords) return;
  ship.coords = dragOriginalCoords;
  ship.orientation = dragOriginalOrientation;
  ship.dir = dragOriginalDir;
  ship.coords.forEach(({ row, col }) => {
    state.placement.grid[row][col] = ship.id;
  });
}

function stopDragListeners() {
  window.removeEventListener('pointermove', handleDragMove);
  window.removeEventListener('pointerup', handleDragEnd);
  window.removeEventListener('pointercancel', handleDragCancel);
}

function handleDragEnd(event) {
  stopDragListeners();
  ghostEl?.remove();
  ghostEl = null;
  clearPreview();

  const ship = state.placement.ships.find((s) => s.id === dragShipId);
  const cell = findGridCellUnderPointer(event.clientX, event.clientY);

  if (ship && cell) {
    const coords = coordsForPlacementClamped(cell.dataset.cell, ship, state.placingOrientation, state.placingDir);
    if (coords && canPlace(coords, ship.id)) {
      commitPlacement(ship, coords);
      setSetupMessage('');
    } else if (dragIsReposition) {
      restoreOriginalPosition(ship);
      setSetupMessage('Posição inválida. O navio voltou ao lugar anterior.', true);
    } else {
      // Placing a newly selected ship on top of another one: say so,
      // otherwise the ship just fails to appear with no explanation.
      setSetupMessage('Espaço ocupado. Escolha outro ponto ou gire o navio.', true);
    }
  } else if (ship && dragIsReposition) {
    // dropped outside the grid: remove the ship (send back to inventory)
    ship.coords = [];
  }

  dragShipId = null;
  dragIsReposition = false;
  dragOriginalCoords = null;
  renderPlacementToDOM();
  renderInventory();
}

// A gesture can be interrupted by the OS/browser (e.g. an incoming
// notification) instead of ending in a clean pointerup. Treat that the
// same as an invalid drop: put a repositioned ship back where it was.
function handleDragCancel() {
  stopDragListeners();
  ghostEl?.remove();
  ghostEl = null;
  clearPreview();

  const ship = state.placement.ships.find((s) => s.id === dragShipId);
  if (ship && dragIsReposition) {
    restoreOriginalPosition(ship);
  }

  dragShipId = null;
  dragIsReposition = false;
  dragOriginalCoords = null;
  renderPlacementToDOM();
  renderInventory();
}

// pointerdown on an already-placed ship's cell picks it up for repositioning.
// Guarded so this only ever fires during fleet setup, never mid-battle
// (the same #my-grid element is reused to show battle damage later).
// A single pointer path handles both gestures, because a tap is simply a
// drag that never moved: press an occupied cell to pick that ship up,
// press an empty cell to bring in the currently selected one. Release
// commits wherever the preview is. This is what makes placement workable
// on a phone, where there is no hover to preview with.
function handleGridPointerDown(event) {
  if (dom.tacticalBoard?.dataset.mode !== 'setup') return;

  const cell = event.target.closest('.board-cell');
  if (!cell) return;

  const { row, col } = cellIdToCoord(cell.dataset.cell);
  const shipId = state.placement.grid[row][col];

  if (shipId) {
    state.activeShipId = shipId;
    startDragFromGrid(event, shipId);
    return;
  }

  normalizeSelection();
  if (!state.selectedShipId) return;

  dragIsReposition = false;
  dragOriginalCoords = null;
  startDrag(state.selectedShipId, event.clientX, event.clientY);

  // Show the footprint immediately so a plain tap still previews before
  // the finger lifts, instead of only reacting once it moves.
  const ship = state.placement.ships.find((s) => s.id === state.selectedShipId);
  const coords = coordsForPlacementClamped(cell.dataset.cell, ship, state.placingOrientation, state.placingDir);
  if (coords) showPreview(coords, canPlace(coords, ship.id));
}

// --- bulk actions -------------------------------------------------------

export function clearPlacement() {
  state.placement.ships.forEach((s) => {
    s.coords = [];
  });
  state.placement.grid.forEach((row) => row.fill(null));
  state.activeShipId = null;
  renderPlacementToDOM();
  renderInventory();
}

export function randomizePlacement() {
  state.placement.grid.forEach((row) => row.fill(null));
  state.placement.ships.forEach((s) => {
    s.coords = [];
    s.orientation = 'horizontal';
    s.dir = 1;
  });

  const shipsToPlace = [...state.placement.ships].sort(
    (a, b) => (getBlueprint(b.type)?.pattern.length || 0) - (getBlueprint(a.type)?.pattern.length || 0)
  );

  state.activeShipId = null;
  shipsToPlace.forEach((ship) => {
    let placed = false;
    let attempts = 0;
    while (!placed && attempts < 400) {
      attempts += 1;
      const row = Math.floor(Math.random() * GRID_SIZE);
      const col = Math.floor(Math.random() * GRID_SIZE);
      const orientation = Math.random() < 0.5 ? 'horizontal' : 'vertical';
      const dir = Math.random() < 0.5 ? 1 : -1;
      const cellId = row * GRID_SIZE + col + 1;
      const coords = coordsForPlacement(cellId, ship, orientation, dir);
      if (!coords || !canPlace(coords, ship.id)) continue;

      ship.coords = coords;
      ship.orientation = orientation;
      ship.dir = dir;
      coords.forEach(({ row: r, col: c }) => {
        state.placement.grid[r][c] = ship.id;
      });
      placed = true;
    }
  });
  renderPlacementToDOM();
  renderInventory();
}

// --- entering / leaving the setup screen ----------------------------------

export function enterFleetSetup() {
  // preserve an already-saved/loaded fleet if the player is just
  // reviewing or tweaking it; only start from a blank grid the first time
  if (!state.placement) {
    initPlacement();
  }
  renderPlacementToDOM();
  renderInventory();
  setBattleStatus('Configure sua frota antes de entrar em combate.');
}

// Validates every ship has been placed, builds the runtime fleet used
// during battle, and persists the layout to Firestore when possible.
export function saveFleet() {
  const allPlaced = state.placement.ships.every((s) => {
    const blueprint = getBlueprint(s.type);
    return s.coords && blueprint && s.coords.length === blueprint.pattern.length;
  });

  if (!allPlaced) {
    const missing = state.placement.ships.filter((s) => s.coords.length === 0).length;
    setSetupMessage(
      `Faltam ${missing} ${missing === 1 ? 'navio' : 'navios'} para posicionar antes de salvar.`,
      true
    );
    return;
  }

  state.playerFleet = buildPlayerFleetFromPlacement(state.placement);
  state.fleetSaved = true;
  if (dom.fleetConfigStatus) {
    dom.fleetConfigStatus.textContent = 'Frota salva.';
  }

  const goBack = () => showLobbyScreen();

  if (state.currentPlayerId) {
    setDoc(doc(db, 'users', state.currentPlayerId), { fleet: state.placement.ships }, { merge: true })
      .catch(() => {
        setSetupMessage('Frota salva neste dispositivo (sem conexão com o servidor).', true);
      })
      .finally(goBack);
  } else {
    goBack();
  }
}

export async function loadFleetFromFirestore(id) {
  if (!id) return null;
  try {
    const snap = await getDoc(doc(db, 'users', id));
    if (!snap.exists()) return null;

    const data = snap.data();
    if (!data.fleet || !Array.isArray(data.fleet)) return null;

    initPlacement();
    data.fleet.forEach((s, idx) => {
      const ship = state.placement.ships[idx];
      if (!ship) return;
      ship.coords = s.coords || [];
      ship.orientation = s.orientation || ship.orientation;
      ship.dir = s.dir || ship.dir;
      ship.type = s.type || ship.type;
      ship.coords.forEach(({ row, col }) => {
        if (state.placement.grid[row] && state.placement.grid[row][col] === null) {
          state.placement.grid[row][col] = ship.id;
        }
      });
    });

    state.fleetSaved = true;
    state.playerFleet = buildPlayerFleetFromPlacement(state.placement);
    if (dom.fleetConfigStatus) {
      dom.fleetConfigStatus.textContent = 'Frota carregada.';
    }
    return state.placement;
  } catch (e) {
    console.warn('Erro ao carregar frota', e);
    return null;
  }
}

export function wireFleetSetupControls() {
  dom.rotateShipButton?.addEventListener('click', rotateActive);
  dom.flipShipButton?.addEventListener('click', flipActive);

  dom.moveButtons?.forEach((btn) => {
    btn.addEventListener('click', () => {
      moveActiveShip(Number(btn.dataset.dr), Number(btn.dataset.dc));
    });
  });

  dom.clearGridButton?.addEventListener('click', () => clearPlacement());
  dom.randomizeGridButton?.addEventListener('click', () => randomizePlacement());
  dom.saveFleetButton?.addEventListener('click', () => saveFleet());

  if (dom.myGrid) {
    dom.myGrid.addEventListener('pointerdown', handleGridPointerDown);
  }
}
