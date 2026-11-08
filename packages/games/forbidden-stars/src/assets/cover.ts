/**
 * Original abstract cover (16:9, viewBox 0 0 640 360), ux-decisions D-CAT-4: dark purple-crimson background,
 * a hex grid of four sectors, each with a planet circle of its own hue and dashed rings.
 * Geometry only: no text, logos, ships, characters, fonts or raster images. Content owned by FE after W0-R.
 */
export const forbiddenStarsCoverSvg = [
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 360" width="640" height="360">',
  '<defs><linearGradient id="fs-bg" x1="0" y1="0" x2="1" y2="1">',
  '<stop offset="0" stop-color="#2A0F2E"/><stop offset="1" stop-color="#12060F"/>',
  '</linearGradient></defs>',
  '<rect width="640" height="360" fill="url(#fs-bg)"/>',
  '<g fill="none" stroke="#C9A0C8" stroke-width="1.5" opacity="0.45">',
  '<polygon points="240,40 300,75 300,145 240,180 180,145 180,75"/>',
  '<polygon points="400,40 460,75 460,145 400,180 340,145 340,75"/>',
  '<polygon points="240,180 300,215 300,285 240,320 180,285 180,215"/>',
  '<polygon points="400,180 460,215 460,285 400,320 340,285 340,215"/>',
  '</g>',
  '<g fill="none" stroke-width="1.5" stroke-dasharray="5 6" opacity="0.6">',
  '<circle cx="240" cy="110" r="44" stroke="#E0607E"/><circle cx="400" cy="110" r="44" stroke="#8FA8FF"/>',
  '<circle cx="240" cy="250" r="44" stroke="#E8B04B"/><circle cx="400" cy="250" r="44" stroke="#6FD3A8"/>',
  '</g>',
  '<circle cx="240" cy="110" r="22" fill="#B83A5E"/><circle cx="400" cy="110" r="22" fill="#5468C8"/>',
  '<circle cx="240" cy="250" r="22" fill="#C2862C"/><circle cx="400" cy="250" r="22" fill="#3E9C78"/>',
  '</svg>',
].join('');
