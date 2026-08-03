import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from './firebase-config.js';
import { dom } from './dom.js';
import { state } from './state.js';
import { GRID_SIZE } from './utils.js';
import { fleetBlueprints, getBlueprint, getShipLabel, getShipShortLabel } from './fleetBlueprints.js';
import { coordsForPlacement } from './shipGeometry.js';
import { fleetCanPlace, buildPlayerFleetFromPlacement } from './fleet.js';
import { displayError } from './ui.js';

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

export function renderFleetGrid() {
  if (!dom.fleetGrid) return;
  dom.fleetGrid.innerHTML = '';
  for (let i = 1; i <= GRID_SIZE * GRID_SIZE; i += 1) {
    const cell = document.createElement('div');
    cell.className = 'fleet-cell';
    cell.dataset.cell = String(i);
    cell.addEventListener('dragover', (e) => e.preventDefault());
    cell.addEventListener('drop', (e) => {
      e.preventDefault();
      const shipId = e.dataTransfer.getData('text/plain');
      handlePlaceShipAtCell(shipId, cell.dataset.cell);
    });
    dom.fleetGrid.appendChild(cell);
  }
}

export function renderInventory() {
  if (!dom.fleetInventory) return;
  dom.fleetInventory.innerHTML = '';
  state.placement.ships.forEach((ship) => {
    const label = getShipLabel(ship);
    const el = document.createElement('div');
    el.className = `fleet-ship fleet-ship-${ship.type}`;
    el.draggable = true;
    el.dataset.shipId = ship.id;
    el.innerHTML = `<strong>${label}</strong><span class="ship-size">${getBlueprint(ship.type)?.pattern.length || 0} peças</span>`;
    el.addEventListener('dragstart', (ev) => {
      ev.dataTransfer.setData('text/plain', ship.id);
    });
    dom.fleetInventory.appendChild(el);
  });
}

export function renderPlacementToDOM() {
  const cells = dom.fleetGrid?.querySelectorAll('.fleet-cell') || [];
  cells.forEach((cell) => {
    const id = Number(cell.dataset.cell);
    const row = Math.floor((id - 1) / GRID_SIZE);
    const col = (id - 1) % GRID_SIZE;
    const occupant = state.placement.grid[row][col];
    if (occupant) {
      const ship = state.placement.ships.find((s) => s.id === occupant);
      cell.classList.add('occupied');
      cell.textContent = ship ? getShipShortLabel(ship) : 'X';
    } else {
      cell.classList.remove('occupied');
      cell.textContent = '';
    }
  });
}

function placeShip(shipId, coords, orientation) {
  const ship = state.placement.ships.find((s) => s.id === shipId);
  if (!ship) return false;

  ship.coords.forEach(({ row, col }) => {
    state.placement.grid[row][col] = null;
  });
  ship.coords = coords;
  ship.orientation = orientation;
  coords.forEach(({ row, col }) => {
    state.placement.grid[row][col] = shipId;
  });
  renderPlacementToDOM();
  return true;
}

function handlePlaceShipAtCell(shipId, startCellId) {
  const ship = state.placement.ships.find((s) => s.id === shipId);
  if (!ship) return;

  const coords = coordsForPlacement(startCellId, ship, state.placingOrientation, state.placingDir);
  if (!coords) {
    displayError('Posição inválida (fora da grade)');
    return;
  }
  if (!canPlace(coords)) {
    displayError('Sobreposição detectada. Escolha outra posição.');
    return;
  }

  ship.coords = coords;
  ship.orientation = state.placingOrientation;
  ship.dir = state.placingDir;
  placeShip(shipId, coords, state.placingOrientation);
}

export function clearPlacement() {
  state.placement.ships.forEach((s) => {
    s.coords = [];
  });
  state.placement.grid.forEach((row) => row.fill(null));
  renderPlacementToDOM();
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
}

export function openFleetModal() {
  if (!dom.fleetModal) return;
  dom.fleetModal.classList.remove('hidden');
  initPlacement();
  renderFleetGrid();
  renderInventory();
  renderPlacementToDOM();
}

export function closeFleetModal() {
  dom.fleetModal?.classList.add('hidden');
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

  if (state.currentPlayerId) {
    setDoc(doc(db, 'users', state.currentPlayerId), { fleet: state.placement.ships }, { merge: true })
      .catch(() => {
        displayError('Não foi possível salvar a frota remotamente. Salvando localmente.');
      })
      .finally(() => closeFleetModal());
  } else {
    closeFleetModal();
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

    renderPlacementToDOM();
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

export function wireFleetModalControls() {
  dom.rotateShipButton?.addEventListener('click', () => {
    state.placingOrientation = state.placingOrientation === 'horizontal' ? 'vertical' : 'horizontal';
  });

  dom.flipShipButton?.addEventListener('click', () => {
    state.placingDir = state.placingDir === 1 ? -1 : 1;
  });

  dom.clearGridButton?.addEventListener('click', () => clearPlacement());
  dom.randomizeGridButton?.addEventListener('click', () => randomizePlacement());
  dom.saveFleetButton?.addEventListener('click', () => saveFleet());
  dom.closeFleetButton?.addEventListener('click', () => closeFleetModal());
  dom.fleetConfigButton?.addEventListener('click', () => openFleetModal());
}
