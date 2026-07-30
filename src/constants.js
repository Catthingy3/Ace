/**
 * Global render constants.
 *
 * The game is authored at BASE_WIDTH x BASE_HEIGHT *logical* pixels, but the
 * canvas is rendered at RES times that many *real* pixels so it stays sharp on
 * high-density (Retina) displays instead of being upscaled and blurred by the
 * Scale.FIT stretch. To keep the exact same on-screen layout, the gameplay
 * camera zooms by RES and screen-space text scales its font size by RES.
 */
export const BASE_WIDTH = 800;
export const BASE_HEIGHT = 600;
// Match the display's pixel density; cap at 2x so we don't over-render on 3x+ phones.
export const RES = Math.min(window.devicePixelRatio || 1, 2);
