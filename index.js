/**
 * Pixel Mosaic - Main Entry Point
 *
 * Re-exports all public functions from the library modules.
 */

export { pixelateImage, pixelateImageEdgeAware, loadImage } from './src/pixelate.js';
export { calculateEdgeMap, getEdgeStrength, getEdgeStrengthInterpolated } from './src/edgeDetection.js';
export { calculateEdgeMapWebGL } from './src/webglEdgeDetection.js';
export { createInitialGrid, optimizeGridCorners, renderGrid } from './src/gridOptimization.js';
export {
  applyProjection,
  identityMatrix,
  rotationMatrix,
  scaleMatrix
} from './src/projection.js';

