// Recognisable vessel silhouettes for the fleet UI. The grid-footprint
// preview still shows exactly which cells a ship occupies; these icons
// exist so the player can tell a submarine from a carrier at a glance,
// which a grid of identical squares never conveyed.
//
// All icons share a 48x24 viewBox and use `currentColor`, so they
// inherit size and colour from CSS like a font glyph would.

const icons = {
  // flagship: tall superstructure + command mast
  admiral: `
    <path d="M2 16 L46 16 L42 21 L6 21 Z"/>
    <rect x="16" y="9" width="14" height="6" rx="1"/>
    <rect x="21" y="3" width="3" height="6"/>
    <path d="M24 3 L32 5 L24 7 Z"/>`,

  // hospital ship: low hull with a red-cross block
  hospital: `
    <path d="M2 16 L46 16 L42 21 L6 21 Z"/>
    <rect x="17" y="8" width="13" height="8" rx="1"/>
    <rect x="22" y="10" width="3" height="4"/>
    <rect x="21" y="11" width="5" height="2"/>`,

  // carrier: flat flight deck + island tower
  aircraft: `
    <path d="M1 14 L47 14 L44 20 L5 20 Z"/>
    <rect x="1" y="11" width="46" height="3"/>
    <rect x="30" y="5" width="5" height="6" rx="1"/>
    <rect x="31" y="1" width="1.5" height="4"/>`,

  // destroyer: sleek hull, gun turret and radar mast
  destroyer: `
    <path d="M3 16 L45 16 L41 21 L7 21 Z"/>
    <rect x="19" y="11" width="11" height="5" rx="1"/>
    <rect x="12" y="13" width="5" height="3" rx="1"/>
    <rect x="23" y="5" width="2" height="6"/>
    <path d="M25 5 L31 7 L25 9 Z"/>`,

  // torpedo boat: small fast craft
  torpedo: `
    <path d="M8 16 L40 16 L36 20 L12 20 Z"/>
    <rect x="20" y="12" width="9" height="4" rx="1"/>
    <rect x="24" y="8" width="1.5" height="4"/>`,

  // supply carrier: broad hull with cargo containers
  carrier: `
    <path d="M2 16 L46 16 L42 21 L6 21 Z"/>
    <rect x="8" y="11" width="7" height="5"/>
    <rect x="17" y="11" width="7" height="5"/>
    <rect x="26" y="11" width="7" height="5"/>
    <rect x="35" y="9" width="6" height="7" rx="1"/>`,

  // submarine: submerged hull + conning tower and periscope
  submarine: `
    <ellipse cx="24" cy="17" rx="21" ry="4"/>
    <rect x="20" y="10" width="8" height="5" rx="1.5"/>
    <rect x="23.2" y="6" width="1.6" height="4"/>`,
};

export function getShipIconSvg(type) {
  const body = icons[type] || icons.torpedo;
  return `<svg class="ship-icon" viewBox="0 0 48 24" fill="currentColor" aria-hidden="true">${body}</svg>`;
}
