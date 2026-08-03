import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from './firebase-config.js';
import { dom } from './dom.js';
import { state } from './state.js';
import { GRID_SIZE, coordToCellId, cellIdToCoord } from './utils.js';
import { fleetBlueprints, getBlueprint, getShipLabel } from './fleetBlueprints.js';
import { coordsForPlacement, coordsForPlacementClamped, getPatternBounds, rotateAndFlipPattern } from './shipGeometry.js';
import { fleetCanPlace, buildPlayerFleetFromPlacement } from './fleet.js';
import { getCellElement } from './board.js';
import { displayError, setBattleStatus, showLobbyScreen } from './ui.js';

let ghostEl = null;
let dragShipId = null;
let dragIsReposition = false;
let dragOriginalCoords = null;
let dragOriginalOrientation = null;
let dragOriginalDir = null;

function canPlace(coords) {
  return fleetCanPlace(state.placement, coords);
}

export function initPlacement() {
  const grid = Array.from({ length: GRID_SIZE }, () => Array(GRID_SIZE).fill(null));
  const ships = [];

  fleetBlueprints.forEach((blueprint) => {
    const count = blueprint.count || 1;
    for (let i = 0; i < count; i += 1) {
      ships.push({ id: `s${ships.length}`, type: blueprint.type, coords: [], orientation: 'horizontal', dir: 1 });
    }
  });

  state.placement = { grid, ships };
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

export function renderInventory() {
  if (!dom.shipInventory) return;
  dom.shipInventory.innerHTML = '';

  state.placement.ships.forEach((ship) => {
    const placed = ship.coords && ship.coords.length > 0;
    const card = document.createElement('div');
    card.className = `ship-card${placed ? ' ship-card-placed' : ''}`;
    card.dataset.shipId = ship.id;

    const silhouette = buildSilhouette(ship);
    const label = document.createElement('span');
    label.className = 'ship-card-label';
    label.textContent = placed ? `${getShipLabel(ship)} ✓` : getShipLabel(ship);

    card.appendChild(silhouette);
    card.appendChild(label);
    card.addEventListener('pointerdown', (event) => startDragFromInventory(event, ship.id));
    dom.shipInventory.appendChild(card);
  });
}

export function renderPlacementToDOM() {
  if (!dom.myGrid) return;
  const cells = dom.myGrid.querySelectorAll('.board-cell');
  cells.forEach((cell) => {
    cell.classList.remove('board-cell-fleet', 'board-cell-fleet-preview', 'board-cell-fleet-invalid');
  });

  state.placement.ships.forEach((ship) => {
    ship.coords.forEach(({ row, col }) => {
      getCellElement(dom.myGrid, coordToCellId(row, col))?.classList.add('board-cell-fleet');
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

function startDragFromInventory(event, shipId) {
  event.preventDefault();
  const ship = state.placement.ships.find((s) => s.id === shipId);
  if (!ship) return;

  // The inventory keeps showing ships that are already on the board (as
  // dimmed cards), so a card drag can be a *re-placement*. If we treated
  // it as a fresh drop, the ship's previous cells would stay marked as
  // occupied forever — a phantom hull that blocks placement and can never
  // be cleared. So lift it off the grid first, exactly like a grid drag.
  if (ship.coords.length > 0) {
    startDragFromGrid(event, shipId);
    return;
  }

  dragIsReposition = false;
  dragOriginalCoords = null;
  startDrag(shipId, event.clientX, event.clientY);
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
  showPreview(coords, canPlace(coords));
}

function commitPlacement(ship, coords) {
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
    if (coords && canPlace(coords)) {
      commitPlacement(ship, coords);
    } else if (dragIsReposition) {
      restoreOriginalPosition(ship);
      displayError('Posição inválida. O navio voltou ao lugar anterior.');
    }
    // invalid drop of a fresh inventory ship: simply stays unplaced
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
function handleGridPointerDown(event) {
  if (dom.tacticalBoard?.dataset.mode !== 'setup') return;

  const cell = event.target.closest('.board-cell');
  if (!cell) return;
  const { row, col } = cellIdToCoord(cell.dataset.cell);
  const shipId = state.placement.grid[row][col];
  if (!shipId) return;
  startDragFromGrid(event, shipId);
}

// --- bulk actions -------------------------------------------------------

export function clearPlacement() {
  state.placement.ships.forEach((s) => {
    s.coords = [];
  });
  state.placement.grid.forEach((row) => row.fill(null));
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
      if (!coords || !canPlace(coords)) continue;

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
    displayError('Você deve posicionar todos os navios antes de salvar.');
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
        displayError('Não foi possível salvar a frota remotamente. Salvando localmente.');
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
  dom.rotateShipButton?.addEventListener('click', () => {
    state.placingOrientation = state.placingOrientation === 'horizontal' ? 'vertical' : 'horizontal';
    renderInventory();
  });

  dom.flipShipButton?.addEventListener('click', () => {
    state.placingDir = state.placingDir === 1 ? -1 : 1;
    renderInventory();
  });

  dom.clearGridButton?.addEventListener('click', () => clearPlacement());
  dom.randomizeGridButton?.addEventListener('click', () => randomizePlacement());
  dom.saveFleetButton?.addEventListener('click', () => saveFleet());

  if (dom.myGrid) {
    dom.myGrid.addEventListener('pointerdown', handleGridPointerDown);
  }
}
