/**
 * Original abstract cover (16:9, viewBox 0 0 640 360), ux-decisions D-CAT-4: dark-blue gradient, star dots,
 * two "systems" on a diagonal — a filled cold-blue circle and an outlined amber one — joined by a dashed
 * link, with thin orbits. Geometry only: no text, logos, ships, characters, fonts or raster images.
 * Content is owned by FE after W0-R (design); the export name is a frozen contract.
 */
export const rebellionCoverSvg = [
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 360" width="640" height="360">',
  '<defs><linearGradient id="rb-bg" x1="0" y1="0" x2="1" y2="1">',
  '<stop offset="0" stop-color="#0B1630"/><stop offset="1" stop-color="#05070D"/>',
  '</linearGradient></defs>',
  '<rect width="640" height="360" fill="url(#rb-bg)"/>',
  '<g fill="#E6EAF2" opacity="0.55">',
  '<circle cx="42" cy="38" r="1.4"/><circle cx="118" cy="92" r="1"/><circle cx="196" cy="24" r="1.2"/>',
  '<circle cx="268" cy="74" r="0.9"/><circle cx="352" cy="30" r="1.3"/><circle cx="430" cy="64" r="1"/>',
  '<circle cx="512" cy="22" r="1.5"/><circle cx="598" cy="58" r="1"/><circle cx="62" cy="178" r="1"/>',
  '<circle cx="144" cy="244" r="1.3"/><circle cx="88" cy="318" r="1"/><circle cx="236" cy="336" r="1.2"/>',
  '<circle cx="318" cy="276" r="0.9"/><circle cx="404" cy="330" r="1.4"/><circle cx="476" cy="286" r="1"/>',
  '<circle cx="566" cy="318" r="1.2"/><circle cx="612" cy="196" r="1"/><circle cx="548" cy="146" r="0.9"/>',
  '</g>',
  '<g fill="none" stroke="#9AA4B5" stroke-width="1" opacity="0.35">',
  '<circle cx="210" cy="230" r="78"/><circle cx="210" cy="230" r="112"/>',
  '<circle cx="440" cy="128" r="66"/><circle cx="440" cy="128" r="98"/>',
  '</g>',
  '<line x1="238" y1="216" x2="414" y2="142" stroke="#C9D1DE" stroke-width="2" stroke-dasharray="8 8" opacity="0.7"/>',
  '<circle cx="210" cy="230" r="34" fill="#7C9CFF"/>',
  '<circle cx="440" cy="128" r="28" fill="none" stroke="#F5A524" stroke-width="4"/>',
  '</svg>',
].join('');
