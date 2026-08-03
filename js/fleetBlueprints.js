// Ship blueprints: each entry describes a ship's shape as a set of
// {row, col} offsets in its default (horizontal, dir=1) orientation.

export const fleetBlueprints = [
  {
    type: 'admiral',
    label: 'Navio Almirante',
    count: 1,
    pattern: [
      { row: 0, col: 1 },
      { row: 0, col: 3 },
      { row: 1, col: 0 },
      { row: 1, col: 1 },
      { row: 1, col: 2 },
      { row: 1, col: 3 },
      { row: 1, col: 4 },
    ],
  },
  {
    type: 'hospital',
    label: 'Navio Hospital',
    count: 1,
    pattern: [
      { row: 0, col: 2 },
      { row: 1, col: 0 },
      { row: 1, col: 1 },
      { row: 1, col: 2 },
      { row: 1, col: 3 },
      { row: 1, col: 4 },
    ],
  },
  {
    type: 'aircraft',
    label: 'Avião',
    count: 1,
    pattern: [
      { row: 0, col: 1 },
      { row: 1, col: 0 },
      { row: 1, col: 1 },
      { row: 1, col: 2 },
      { row: 1, col: 3 },
      { row: 1, col: 4 },
      { row: 2, col: 1 },
      { row: 3, col: 1 },
    ],
  },
  {
    type: 'destroyer',
    label: 'Destroyer',
    count: 2,
    pattern: [
      { row: 0, col: 1 },
      { row: 1, col: 0 },
      { row: 1, col: 1 },
      { row: 1, col: 2 },
    ],
  },
  {
    type: 'torpedo',
    label: 'Torpedoeiro',
    count: 3,
    pattern: [
      { row: 0, col: 0 },
      { row: 0, col: 1 },
    ],
  },
  {
    type: 'carrier',
    label: 'Porta-Aviões',
    count: 1,
    pattern: [
      { row: 0, col: 1 },
      { row: 0, col: 2 },
      { row: 0, col: 3 },
      { row: 1, col: 0 },
      { row: 1, col: 1 },
      { row: 1, col: 2 },
      { row: 1, col: 3 },
      { row: 1, col: 4 },
      { row: 2, col: 2 },
    ],
  },
  {
    type: 'submarine',
    label: 'Submarino',
    count: 4,
    pattern: [{ row: 0, col: 0 }],
  },
];

const shortLabels = {
  admiral: 'A',
  hospital: 'H',
  aircraft: 'V',
  destroyer: 'D',
  torpedo: 'T',
  carrier: 'P',
  submarine: 'S',
};

export function getBlueprint(type) {
  return fleetBlueprints.find((bp) => bp.type === type);
}

export function getShipLabel(ship) {
  return getBlueprint(ship.type)?.label || 'Navio';
}

export function getShipShortLabel(ship) {
  return shortLabels[ship.type] || ship.id;
}
