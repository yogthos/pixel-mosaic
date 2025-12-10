/**
 * Pixel Mosaic - Main Entry Point
 *
 * Re-exports all public functions from the library modules.
 */

export { pixelateImage, loadImage } from './src/pixelate.js';
export {
  applyProjection,
  identityMatrix,
  rotationMatrix,
  scaleMatrix
} from './src/projection.js';

