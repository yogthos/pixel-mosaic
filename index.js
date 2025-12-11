/**
 * Pixel Mosaic - Main Entry Point
 *
 * Re-exports all public functions from the library modules.
 */

// Main transformation functions
export { pixelateImage, pixelateImageEdgeAware, loadImage } from './src/pixelate.js';

// Step functions for functional pipeline composition
export {
  convertToImageData,
  calculateEdgeMapStep,
  createGridStep,
  optimizeGridStep,
  renderEdgeAwarePixelsStep,
  adjustContrastStep,
  quantizeColorsStep,
  convertToCanvasStep,
  downscaleImageStep,
  upscaleImageStep
} from './src/pixelate.js';

// Edge detection functions
export { calculateEdgeMap, getEdgeStrength, getEdgeStrengthInterpolated } from './src/edgeDetection.js';
export { calculateEdgeMapWebGL } from './src/webglEdgeDetection.js';

// Grid optimization functions
export { createInitialGrid, optimizeGridCorners, renderGrid } from './src/gridOptimization.js';

// Projection functions
export {
  applyProjection,
  identityMatrix,
  rotationMatrix,
  scaleMatrix
} from './src/projection.js';

// Pipeline utilities
export { pipe, createPipeline } from './src/pipeline.js';

