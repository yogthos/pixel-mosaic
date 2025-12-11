/**
 * Pixel Mosaic - Main Pixelation Module
 *
 * Provides functions to pixelate images using canvas-based techniques.
 */

import { calculateEdgeMap } from './edgeDetection.js';
import { calculateEdgeMapWebGL } from './webglEdgeDetection.js';
import { createInitialGrid, optimizeGridCorners, renderGrid } from './gridOptimization.js';
import {
  edgeMapToCanvas,
  createGrayscaleCanvas,
  drawGridOverlay,
  imageDataToCanvas,
  cloneGridCorners
} from './visualization.js';

/**
 * Pixelates an image by scaling it down and then back up with nearest-neighbor interpolation.
 *
 * @param {HTMLImageElement|HTMLCanvasElement|ImageData} image - Source image to pixelate
 * @param {number} pixelSize - Size of each pixel block (e.g., 3 = 3x3 pixel blocks)
 * @param {Object} options - Optional configuration
 * @param {boolean} options.returnCanvas - If true, returns canvas element; otherwise returns ImageData
 * @param {number} options.colorLimit - Limit the number of colors (optional, for color quantization)
 * @param {number} options.contrast - Contrast adjustment (0-2, where 1 is no change, default: 1)
 * @returns {HTMLCanvasElement|ImageData} Pixelated image
 */
export function pixelateImage(image, pixelSize, options = {}) {
  const {
    returnCanvas = false,
    colorLimit = null,
    contrast = 1.0
  } = options;

  // Get image dimensions
  let sourceWidth, sourceHeight;
  if (image instanceof ImageData) {
    sourceWidth = image.width;
    sourceHeight = image.height;
  } else if (image instanceof HTMLCanvasElement) {
    sourceWidth = image.width;
    sourceHeight = image.height;
  } else if (image instanceof HTMLImageElement) {
    sourceWidth = image.naturalWidth || image.width;
    sourceHeight = image.naturalHeight || image.height;
  } else {
    throw new Error('Unsupported image type. Use Image, Canvas, or ImageData.');
  }

  // Calculate scaled dimensions
  const scaledWidth = Math.max(1, Math.floor(sourceWidth / pixelSize));
  const scaledHeight = Math.max(1, Math.floor(sourceHeight / pixelSize));

  // Create temporary canvas for downscaling
  const tempCanvas = document.createElement('canvas');
  tempCanvas.width = scaledWidth;
  tempCanvas.height = scaledHeight;
  const tempCtx = tempCanvas.getContext('2d');

  // Disable image smoothing for pixelated effect
  tempCtx.imageSmoothingEnabled = false;

  // Draw source image scaled down
  if (image instanceof ImageData) {
    // Create a temporary canvas to draw ImageData
    const sourceCanvas = document.createElement('canvas');
    sourceCanvas.width = sourceWidth;
    sourceCanvas.height = sourceHeight;
    const sourceCtx = sourceCanvas.getContext('2d');
    sourceCtx.putImageData(image, 0, 0);
    tempCtx.drawImage(sourceCanvas, 0, 0, scaledWidth, scaledHeight);
  } else {
    tempCtx.drawImage(image, 0, 0, scaledWidth, scaledHeight);
  }

  // Apply color quantization if requested
  let imageData = tempCtx.getImageData(0, 0, scaledWidth, scaledHeight);
  if (colorLimit && colorLimit > 0) {
    imageData = quantizeColors(imageData, colorLimit);
    // Put quantized imageData back onto tempCanvas so it's used when upscaling
    tempCtx.putImageData(imageData, 0, 0);
  }

  // Create output canvas for upscaling
  const outputCanvas = document.createElement('canvas');
  outputCanvas.width = sourceWidth;
  outputCanvas.height = sourceHeight;
  const outputCtx = outputCanvas.getContext('2d');

  // Disable smoothing for crisp pixel edges
  outputCtx.imageSmoothingEnabled = false;

  // Draw scaled (and optionally quantized) image back up to original size
  outputCtx.drawImage(tempCanvas, 0, 0, sourceWidth, sourceHeight);

  // Apply contrast adjustment if requested
  if (contrast !== 1.0) {
    let finalImageData = outputCtx.getImageData(0, 0, sourceWidth, sourceHeight);
    finalImageData = adjustContrast(finalImageData, contrast);
    outputCtx.putImageData(finalImageData, 0, 0);
  }

  if (returnCanvas) {
    return outputCanvas;
  } else {
    return outputCtx.getImageData(0, 0, sourceWidth, sourceHeight);
  }
}

/**
 * Quantizes colors in an image to reduce the color palette.
 * Uses an improved algorithm that ensures color diversity.
 *
 * @param {ImageData} imageData - Image data to quantize
 * @param {number} maxColors - Maximum number of colors to use
 * @returns {ImageData} Quantized image data
 */
function quantizeColors(imageData, maxColors) {
  const data = new Uint8ClampedArray(imageData.data);
  const width = imageData.width;
  const height = imageData.height;

  // Sample colors from the image (use every Nth pixel for performance)
  const sampleStep = Math.max(1, Math.floor(Math.sqrt(width * height) / 100));
  const colorSamples = [];

  for (let i = 0; i < data.length; i += 4 * sampleStep) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    colorSamples.push({ r, g, b });
  }

  // Use k-means-like approach: initialize with diverse colors
  const palette = [];

  if (colorSamples.length <= maxColors) {
    // Not enough unique colors, use all samples
    const uniqueColors = new Map();
    for (const color of colorSamples) {
      const key = `${color.r},${color.g},${color.b}`;
      if (!uniqueColors.has(key)) {
        uniqueColors.set(key, color);
        if (uniqueColors.size >= maxColors) break;
      }
    }
    palette.push(...Array.from(uniqueColors.values()));
  } else {
    // Initialize palette with diverse colors using a simple approach
    // First, add the most common color
    const colorFreq = new Map();
    for (const color of colorSamples) {
      const key = `${color.r},${color.g},${color.b}`;
      colorFreq.set(key, (colorFreq.get(key) || 0) + 1);
    }

    const sortedByFreq = Array.from(colorFreq.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([key]) => {
        const [r, g, b] = key.split(',').map(Number);
        return { r, g, b };
      });

    // Add first color (most common)
    palette.push(sortedByFreq[0]);

    // Add remaining colors that are most different from existing palette
    while (palette.length < maxColors && palette.length < sortedByFreq.length) {
      let maxMinDist = -1;
      let bestColor = null;

      for (const candidate of sortedByFreq) {
        // Skip if already in palette
        if (palette.some(c => c.r === candidate.r && c.g === candidate.g && c.b === candidate.b)) {
          continue;
        }

        // Find minimum distance to any color in current palette
        let minDist = Infinity;
        for (const paletteColor of palette) {
          const dist = Math.sqrt(
            Math.pow(candidate.r - paletteColor.r, 2) +
            Math.pow(candidate.g - paletteColor.g, 2) +
            Math.pow(candidate.b - paletteColor.b, 2)
          );
          if (dist < minDist) {
            minDist = dist;
          }
        }

        // Prefer colors that are most different from existing palette
        if (minDist > maxMinDist) {
          maxMinDist = minDist;
          bestColor = candidate;
        }
      }

      if (bestColor) {
        palette.push(bestColor);
      } else {
        // If no more diverse colors, add remaining most common ones
        for (const color of sortedByFreq) {
          if (palette.length >= maxColors) break;
          if (!palette.some(c => c.r === color.r && c.g === color.g && c.b === color.b)) {
            palette.push(color);
          }
        }
        break;
      }
    }
  }

  // Ensure we have at least one color
  if (palette.length === 0) {
    palette.push({ r: 128, g: 128, b: 128 });
  }

  // Create output image data
  const output = new ImageData(width, height);
  const outputData = output.data;

  // Map each pixel to nearest color in palette
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const a = data[i + 3];

    // Find nearest color in palette
    let minDist = Infinity;
    let nearestColor = palette[0];
    for (const color of palette) {
      const dist = Math.sqrt(
        Math.pow(r - color.r, 2) +
        Math.pow(g - color.g, 2) +
        Math.pow(b - color.b, 2)
      );
      if (dist < minDist) {
        minDist = dist;
        nearestColor = color;
      }
    }

    outputData[i] = nearestColor.r;
    outputData[i + 1] = nearestColor.g;
    outputData[i + 2] = nearestColor.b;
    outputData[i + 3] = a;
  }

  return output;
}

/**
 * Adjusts contrast of an image.
 * Uses a simple linear contrast formula: output = (input - 128) * contrast + 128
 *
 * @param {ImageData} imageData - Image data to adjust
 * @param {number} contrast - Contrast factor (0-2, where 1 is no change)
 * @returns {ImageData} Adjusted image data
 */
function adjustContrast(imageData, contrast) {
  const data = imageData.data;
  const output = new ImageData(imageData.width, imageData.height);
  const outputData = output.data;

  for (let i = 0; i < data.length; i += 4) {
    // Apply contrast adjustment to RGB channels
    outputData[i] = Math.max(0, Math.min(255, Math.round((data[i] - 128) * contrast + 128)));
    outputData[i + 1] = Math.max(0, Math.min(255, Math.round((data[i + 1] - 128) * contrast + 128)));
    outputData[i + 2] = Math.max(0, Math.min(255, Math.round((data[i + 2] - 128) * contrast + 128)));
    // Keep alpha unchanged
    outputData[i + 3] = data[i + 3];
  }

  return output;
}

/**
 * Loads an image from a URL or file and returns a promise that resolves with the image element.
 *
 * @param {string|File} source - URL string or File object
 * @returns {Promise<HTMLImageElement>} Promise that resolves with the loaded image
 */
/**
 * Edge-aware pixelation using adaptive grid optimization.
 *
 * @param {HTMLImageElement|HTMLCanvasElement|ImageData} image - Source image to pixelate
 * @param {number} pixelizationFactor - Approximate size of each grid cell
 * @param {Object} options - Optional configuration
 * @param {boolean} options.returnCanvas - If true, returns canvas element; otherwise returns ImageData
 * @param {number} options.searchSteps - Number of search steps per corner (default: 9)
 * @param {number} options.numIterations - Number of optimization iterations (default: 2)
 * @param {number} options.contrast - Contrast adjustment (0-2, where 1 is no change, default: 1)
 * @param {number} options.edgeSharpness - Edge sharpness level (0-1, default: 0.8). Higher values create sharper, cleaner edges
 * @param {boolean} options.captureIntermediates - If true, returns object with intermediates for visualization
 * @returns {HTMLCanvasElement|ImageData|Object} Pixelated image, or object with canvas and intermediates if captureIntermediates is true
 */
export async function pixelateImageEdgeAware(image, pixelizationFactor, options = {}) {
  const {
    returnCanvas = false,
    searchSteps = 9,
    numIterations = 2,
    onProgress = null,
    colorLimit = null,
    contrast = 1.0,
    edgeSharpness = 0.8,
    captureIntermediates = false
  } = options;

  // Intermediates array to collect visualization steps
  const intermediates = captureIntermediates ? [] : null;

  // Get image dimensions
  let sourceWidth, sourceHeight, imageData;

  if (image instanceof ImageData) {
    sourceWidth = image.width;
    sourceHeight = image.height;
    imageData = image;
  } else {
    // Convert to ImageData
    const canvas = document.createElement('canvas');
    if (image instanceof HTMLCanvasElement) {
      canvas.width = image.width;
      canvas.height = image.height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(image, 0, 0);
    } else if (image instanceof HTMLImageElement) {
      sourceWidth = image.naturalWidth || image.width;
      sourceHeight = image.naturalHeight || image.height;
      canvas.width = sourceWidth;
      canvas.height = sourceHeight;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(image, 0, 0);
    } else {
      throw new Error('Unsupported image type. Use Image, Canvas, or ImageData.');
    }
    imageData = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height);
    sourceWidth = canvas.width;
    sourceHeight = canvas.height;
  }

  // Capture original image
  if (captureIntermediates) {
    intermediates.push({
      name: 'Original',
      canvas: imageDataToCanvas(imageData)
    });
  }

  // Calculate edge map - always try WebGL first for performance
  let edgeMap = calculateEdgeMapWebGL(imageData, { edgeSharpness });
  let usingGPU = edgeMap !== null;

  if (!edgeMap) {
    // WebGL not available, use CPU implementation
    edgeMap = calculateEdgeMap(imageData, { edgeSharpness });
  }

  // Generate visualization intermediates separately
  if (captureIntermediates) {
    // Add grayscale step
    intermediates.push({
      name: 'Grayscale',
      canvas: createGrayscaleCanvas(imageData)
    });

    // For visualization, use downscaled image for speed
    // Scale down to max 400px on longest side
    const maxVizSize = 400;
    const scale = Math.min(1, maxVizSize / Math.max(sourceWidth, sourceHeight));
    const vizWidth = Math.round(sourceWidth * scale);
    const vizHeight = Math.round(sourceHeight * scale);

    let vizImageData = imageData;
    if (scale < 1) {
      // Downscale for visualization
      const vizCanvas = document.createElement('canvas');
      vizCanvas.width = vizWidth;
      vizCanvas.height = vizHeight;
      const vizCtx = vizCanvas.getContext('2d');
      const srcCanvas = imageDataToCanvas(imageData);
      vizCtx.drawImage(srcCanvas, 0, 0, vizWidth, vizHeight);
      vizImageData = vizCtx.getImageData(0, 0, vizWidth, vizHeight);
    }

    // Generate edge detection steps on downscaled image (fast)
    const vizResult = calculateEdgeMap(vizImageData, {
      edgeSharpness,
      captureIntermediates: true
    });

    // Upscale visualization results back to original size
    function upscaleEdgeMap(edgeMapData, w, h, targetW, targetH) {
      const canvas = edgeMapToCanvas(edgeMapData, w, h);
      const upscaled = document.createElement('canvas');
      upscaled.width = targetW;
      upscaled.height = targetH;
      const ctx = upscaled.getContext('2d');
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(canvas, 0, 0, targetW, targetH);
      return upscaled;
    }

    // Add gradient magnitude step
    intermediates.push({
      name: 'Gradient Magnitude',
      canvas: upscaleEdgeMap(vizResult.intermediates.magnitude, vizWidth, vizHeight, sourceWidth, sourceHeight)
    });

    // Add after NMS step
    intermediates.push({
      name: 'After NMS',
      canvas: upscaleEdgeMap(vizResult.intermediates.afterNMS, vizWidth, vizHeight, sourceWidth, sourceHeight)
    });

    // Add edge map step (use actual full-res edge map)
    intermediates.push({
      name: 'Edge Map',
      canvas: edgeMapToCanvas(edgeMap, sourceWidth, sourceHeight)
    });
  }

  // Create initial grid
  const grid = createInitialGrid(sourceWidth, sourceHeight, pixelizationFactor);

  // Capture initial grid overlay
  if (captureIntermediates) {
    const originalCanvas = imageDataToCanvas(imageData);
    intermediates.push({
      name: 'Initial Grid',
      canvas: drawGridOverlay(originalCanvas, grid, 'rgba(255, 0, 0, 0.8)', 1)
    });
  }

  // Optimize grid corners to align with edges
  // Scale search parameters based on edgeSharpness for crisper results at higher settings
  // Higher sharpness = larger search radius and more aggressive snapping
  const sharpnessScale = 0.5 + edgeSharpness * 1.5; // Range: 0.5 to 2.0
  const effectiveStepSize = Math.max(1, pixelizationFactor * 0.3 * sharpnessScale);
  const effectiveSearchSteps = Math.max(searchSteps, Math.floor(9 + edgeSharpness * 16)); // 9 to 25
  const effectiveIterations = Math.max(numIterations, Math.floor(2 + edgeSharpness * 3)); // 2 to 5

  optimizeGridCorners(grid, edgeMap, sourceWidth, sourceHeight, {
    searchSteps: effectiveSearchSteps,
    numIterations: effectiveIterations,
    stepSize: effectiveStepSize,
    edgeSharpness // Pass sharpness to control damping
  });

  // Capture optimized grid overlay
  if (captureIntermediates) {
    const originalCanvas = imageDataToCanvas(imageData);
    intermediates.push({
      name: 'Optimized Grid',
      canvas: drawGridOverlay(originalCanvas, grid, 'rgba(0, 255, 0, 0.8)', 1)
    });
  }

  // Report GPU usage if callback provided
  if (onProgress) {
    onProgress({ usingGPU });
  }

  // Render optimized grid with edge-aware color sampling
  // Pass edgeSharpness to control color sampling method
  let outputImageData = renderGrid(grid, imageData, edgeMap, edgeSharpness);

  // Apply contrast adjustment if requested
  if (contrast !== 1.0) {
    outputImageData = adjustContrast(outputImageData, contrast);
  }

  // Apply color quantization if requested
  if (colorLimit && colorLimit > 0) {
    outputImageData = quantizeColors(outputImageData, colorLimit);
  }

  // Create output canvas
  const outputCanvas = document.createElement('canvas');
  outputCanvas.width = sourceWidth;
  outputCanvas.height = sourceHeight;
  const ctx = outputCanvas.getContext('2d');
  ctx.putImageData(outputImageData, 0, 0);

  // Attach metadata to canvas
  outputCanvas._usingGPU = usingGPU;

  // Capture final result
  if (captureIntermediates) {
    intermediates.push({
      name: 'Final Result',
      canvas: outputCanvas
    });

    return {
      canvas: outputCanvas,
      intermediates,
      usingGPU
    };
  }

  if (returnCanvas) {
    return outputCanvas;
  } else {
    return outputImageData;
  }
}

/**
 * Loads an image from a URL or file and returns a promise that resolves with the image element.
 *
 * @param {string|File} source - URL string or File object
 * @returns {Promise<HTMLImageElement>} Promise that resolves with the loaded image
 */
export function loadImage(source) {
  return new Promise((resolve, reject) => {
    const img = new Image();

    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to load image'));

    if (source instanceof File) {
      const reader = new FileReader();
      reader.onload = (e) => {
        img.src = e.target.result;
      };
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsDataURL(source);
    } else {
      img.src = source;
    }
  });
}
