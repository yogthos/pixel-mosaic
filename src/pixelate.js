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
import { pipe } from './pipeline.js';

/**
 * Pixelates an image by scaling it down and then back up with nearest-neighbor interpolation.
 * Uses a functional pipeline internally for composability.
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

  // Convert to ImageData if needed
  let imageData = image instanceof ImageData ? image : convertToImageData(image);

  // Downscale the image
  const downscaleContext = downscaleImageStep(image, pixelSize);
  let scaledImageData = downscaleContext.scaledImageData;

  // Apply color quantization if requested
  if (colorLimit && colorLimit > 0) {
    scaledImageData = quantizeColorsStep(scaledImageData, colorLimit);
    // Put quantized imageData back onto tempCanvas so it's used when upscaling
    const tempCtx = downscaleContext.scaledCanvas.getContext('2d');
    tempCtx.putImageData(scaledImageData, 0, 0);
    downscaleContext.scaledImageData = scaledImageData;
  }

  // Upscale the image
  const outputCanvas = upscaleImageStep(downscaleContext);

  // Apply contrast adjustment if requested
  if (contrast !== 1.0) {
    let finalImageData = outputCanvas.getContext('2d').getImageData(0, 0, outputCanvas.width, outputCanvas.height);
    finalImageData = adjustContrastStep(finalImageData, contrast);
    outputCanvas.getContext('2d').putImageData(finalImageData, 0, 0);
  }

  // Convert to ImageData if needed
  if (!returnCanvas) {
    return outputCanvas.getContext('2d').getImageData(0, 0, outputCanvas.width, outputCanvas.height);
  }

  return outputCanvas;
}

/**
 * Renders edge-aware pixelation with rectangular pixels.
 * Uses median color sampling near edges for crispness, average elsewhere.
 *
 * @param {ImageData} imageData - Source image data
 * @param {Float32Array} edgeMap - Edge strength map
 * @param {number} pixelSize - Size of each pixel block
 * @param {number} edgeSharpness - Edge sharpness (0-1), controls blend between average and median
 * @returns {ImageData} Pixelated image data
 */
function renderEdgeAwarePixels(imageData, edgeMap, pixelSize, edgeSharpness) {
  const { width, height, data } = imageData;
  const output = new ImageData(width, height);
  const outputData = output.data;

  // Process each pixel block
  for (let blockY = 0; blockY < height; blockY += pixelSize) {
    for (let blockX = 0; blockX < width; blockX += pixelSize) {
      // Determine block boundaries
      const blockEndX = Math.min(blockX + pixelSize, width);
      const blockEndY = Math.min(blockY + pixelSize, height);

      // Collect colors and check for edges in this block
      const colors = [];
      let hasEdge = false;
      let edgeStrength = 0;

      for (let y = blockY; y < blockEndY; y++) {
        for (let x = blockX; x < blockEndX; x++) {
          const idx = (y * width + x) * 4;
          colors.push({
            r: data[idx],
            g: data[idx + 1],
            b: data[idx + 2],
            a: data[idx + 3]
          });

          // Check edge map
          const edgeIdx = y * width + x;
          if (edgeMap[edgeIdx] > 0) {
            hasEdge = true;
            edgeStrength = Math.max(edgeStrength, edgeMap[edgeIdx]);
          }
        }
      }

      // Calculate block color based on edge presence and sharpness
      let blockColor;
      if (hasEdge && edgeSharpness > 0) {
        // Use median color for blocks with edges (crisper)
        const medianColor = getMedianColor(colors);

        if (edgeSharpness >= 1) {
          blockColor = medianColor;
        } else {
          // Blend between average and median based on sharpness
          const avgColor = getAverageColor(colors);
          const blend = edgeSharpness * edgeStrength;
          blockColor = {
            r: Math.round(avgColor.r * (1 - blend) + medianColor.r * blend),
            g: Math.round(avgColor.g * (1 - blend) + medianColor.g * blend),
            b: Math.round(avgColor.b * (1 - blend) + medianColor.b * blend),
            a: Math.round(avgColor.a * (1 - blend) + medianColor.a * blend)
          };
        }
      } else {
        // Use average color for blocks without edges (smoother)
        blockColor = getAverageColor(colors);
      }

      // Fill the block with the calculated color
      for (let y = blockY; y < blockEndY; y++) {
        for (let x = blockX; x < blockEndX; x++) {
          const idx = (y * width + x) * 4;
          outputData[idx] = blockColor.r;
          outputData[idx + 1] = blockColor.g;
          outputData[idx + 2] = blockColor.b;
          outputData[idx + 3] = blockColor.a;
        }
      }
    }
  }

  return output;
}

/**
 * Calculates average color from an array of colors.
 */
function getAverageColor(colors) {
  let r = 0, g = 0, b = 0, a = 0;
  for (const c of colors) {
    r += c.r;
    g += c.g;
    b += c.b;
    a += c.a;
  }
  const n = colors.length;
  return {
    r: Math.round(r / n),
    g: Math.round(g / n),
    b: Math.round(b / n),
    a: Math.round(a / n)
  };
}

/**
 * Calculates median color from an array of colors.
 * Uses luminance-sorted median for better edge preservation.
 */
function getMedianColor(colors) {
  if (colors.length === 0) return { r: 0, g: 0, b: 0, a: 255 };
  if (colors.length === 1) return colors[0];

  // Sort by luminance
  const sorted = [...colors].sort((a, b) => {
    const lumA = 0.299 * a.r + 0.587 * a.g + 0.114 * a.b;
    const lumB = 0.299 * b.r + 0.587 * b.g + 0.114 * b.b;
    return lumA - lumB;
  });

  return sorted[Math.floor(sorted.length / 2)];
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
 * STEP FUNCTIONS - Independent transformation steps that can be composed into pipelines
 */

/**
 * Converts various image types to ImageData.
 * Can be used independently or as part of a pipeline.
 *
 * @param {HTMLImageElement|HTMLCanvasElement|ImageData} image - Source image
 * @returns {ImageData} ImageData representation of the image
 */
export function convertToImageData(image) {
  if (image instanceof ImageData) {
    return image;
  }

  const canvas = document.createElement('canvas');
  if (image instanceof HTMLCanvasElement) {
    canvas.width = image.width;
    canvas.height = image.height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(image, 0, 0);
  } else if (image instanceof HTMLImageElement) {
    const sourceWidth = image.naturalWidth || image.width;
    const sourceHeight = image.naturalHeight || image.height;
    canvas.width = sourceWidth;
    canvas.height = sourceHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(image, 0, 0);
  } else {
    throw new Error('Unsupported image type. Use Image, Canvas, or ImageData.');
  }

  return canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height);
}

/**
 * Calculates edge map from image data (WebGL or CPU fallback).
 * Can be used independently or as part of a pipeline.
 *
 * @param {ImageData} imageData - Source image data
 * @param {Object} options - Edge detection options
 * @param {number} options.edgeSharpness - Edge sharpness level (0-1, default: 0.8)
 * @param {Function} options.onProgress - Optional callback for progress updates
 * @returns {Object} Object with edgeMap (Float32Array) and usingGPU (boolean)
 */
export async function calculateEdgeMapStep(imageData, options = {}) {
  const { edgeSharpness = 0.8, onProgress = null } = options;
  const { width, height } = imageData;

  let edgeMap = null;
  let usingGPU = false;

  try {
    edgeMap = calculateEdgeMapWebGL(imageData, { edgeSharpness });
    usingGPU = edgeMap !== null;

    if (edgeMap) {
      // Validate WebGL edge map
      if (edgeMap.length !== width * height) {
        console.warn('WebGL edge map size mismatch, falling back to CPU');
        edgeMap = null;
        usingGPU = false;
      } else {
        // Quick check: count edges in a random sample across the whole image
        let edgeCount = 0;
        const sampleSize = Math.min(10000, edgeMap.length);
        const step = Math.max(1, Math.floor(edgeMap.length / sampleSize));
        for (let i = 0; i < edgeMap.length; i += step) {
          if (edgeMap[i] > 0) {
            edgeCount++;
          }
        }

        // If WebGL edge map appears completely empty, try CPU
        if (edgeCount === 0 && sampleSize > 100) {
          console.warn('WebGL edge map has no edges in sample, trying CPU');
          const cpuEdgeMap = calculateEdgeMap(imageData, { edgeSharpness });
          let cpuEdgeCount = 0;
          const cpuStep = Math.max(1, Math.floor(cpuEdgeMap.length / sampleSize));
          for (let i = 0; i < cpuEdgeMap.length; i += cpuStep) {
            if (cpuEdgeMap[i] > 0) {
              cpuEdgeCount++;
            }
          }
          // Use CPU if it finds edges
          if (cpuEdgeCount > 0) {
            edgeMap = cpuEdgeMap;
            usingGPU = false;
          }
        }
      }
    }
  } catch (error) {
    console.error('WebGL edge detection error:', error);
    edgeMap = null;
    usingGPU = false;
  }

  if (!edgeMap) {
    // WebGL not available or failed, use CPU implementation
    edgeMap = calculateEdgeMap(imageData, { edgeSharpness });
  }

  if (onProgress) {
    onProgress({ usingGPU });
  }

  return { edgeMap, usingGPU };
}

/**
 * Creates an initial uniform grid for edge-aware pixelation.
 * Can be used independently or as part of a pipeline.
 *
 * @param {ImageData} imageData - Source image data
 * @param {number} pixelizationFactor - Approximate size of each grid cell
 * @returns {Object} Grid object with corners and cells
 */
export function createGridStep(imageData, pixelizationFactor) {
  return createInitialGrid(imageData.width, imageData.height, pixelizationFactor);
}

/**
 * Optimizes grid corners to align with image edges.
 * Can be used independently or as part of a pipeline.
 *
 * @param {Object} context - Context object containing grid, edgeMap, and imageData
 * @param {Object} options - Optimization options
 * @param {number} options.searchSteps - Number of search steps per iteration
 * @param {number} options.numIterations - Number of optimization iterations
 * @param {number} options.stepSize - Size of each movement step
 * @param {number} options.edgeSharpness - Edge sharpness (0-1)
 * @param {boolean} options.useSplines - Whether to use B-spline curves for grid edges (default: false)
 * @param {number} options.splineDegree - B-spline degree (default: 2)
 * @param {number} options.splineSmoothness - Smoothness factor (0-1) for spline curves (default: 0.3)
 * @returns {Object} Optimized grid
 */
export function optimizeGridStep(context, options = {}) {
  const { grid, edgeMap, imageData } = context;
  const {
    searchSteps = 9,
    numIterations = 2,
    stepSize = 1.0,
    edgeSharpness = 0.8,
    useSplines = false,
    splineDegree = 2,
    splineSmoothness = 0.3
  } = options;

  if (!grid || !edgeMap || !imageData) {
    throw new Error('optimizeGridStep requires grid, edgeMap, and imageData in context');
  }

  const { width, height } = imageData;

  // Use the provided stepSize directly (it's already calculated with sharpness scaling at call site)
  // Scale search parameters based on edgeSharpness if not already done
  const effectiveSearchSteps = Math.max(searchSteps, Math.floor(9 + edgeSharpness * 16));
  const effectiveIterations = Math.max(numIterations, Math.floor(2 + edgeSharpness * 3));

  return optimizeGridCorners(grid, edgeMap, width, height, {
    searchSteps: effectiveSearchSteps,
    numIterations: effectiveIterations,
    stepSize: stepSize || 1.0,
    edgeSharpness,
    useSplines,
    splineDegree,
    splineSmoothness
  });
}

/**
 * Renders edge-aware pixels from image data and edge map.
 * Can be used independently or as part of a pipeline.
 *
 * @param {ImageData} imageData - Source image data
 * @param {Float32Array} edgeMap - Edge strength map
 * @param {number} pixelSize - Size of each pixel block
 * @param {number} edgeSharpness - Edge sharpness (0-1), controls blend between average and median
 * @returns {ImageData} Pixelated image data
 */
export function renderEdgeAwarePixelsStep(imageData, edgeMap, pixelSize, edgeSharpness) {
  return renderEdgeAwarePixels(imageData, edgeMap, pixelSize, edgeSharpness);
}

/**
 * Adjusts contrast of an image.
 * Can be used independently or as part of a pipeline.
 *
 * @param {ImageData} imageData - Image data to adjust
 * @param {number} contrast - Contrast factor (0-2, where 1 is no change)
 * @returns {ImageData} Adjusted image data
 */
export function adjustContrastStep(imageData, contrast) {
  if (contrast === 1.0) {
    return imageData;
  }
  return adjustContrast(imageData, contrast);
}

/**
 * Quantizes colors in an image to reduce the color palette.
 * Can be used independently or as part of a pipeline.
 *
 * @param {ImageData} imageData - Image data to quantize
 * @param {number} colorLimit - Maximum number of colors to use
 * @returns {ImageData} Quantized image data
 */
export function quantizeColorsStep(imageData, colorLimit) {
  if (!colorLimit || colorLimit <= 0) {
    return imageData;
  }
  return quantizeColors(imageData, colorLimit);
}

/**
 * Converts ImageData to Canvas or returns ImageData.
 * Can be used independently or as part of a pipeline.
 *
 * @param {ImageData} imageData - Image data to convert
 * @param {boolean} returnCanvas - If true, returns canvas element; otherwise returns ImageData
 * @returns {HTMLCanvasElement|ImageData} Canvas element or ImageData
 */
export function convertToCanvasStep(imageData, returnCanvas = false) {
  if (!returnCanvas) {
    return imageData;
  }

  const canvas = document.createElement('canvas');
  canvas.width = imageData.width;
  canvas.height = imageData.height;
  const ctx = canvas.getContext('2d');
  ctx.putImageData(imageData, 0, 0);
  return canvas;
}

/**
 * Downscales an image by the specified pixel size.
 * Can be used independently or as part of a pipeline.
 *
 * @param {HTMLImageElement|HTMLCanvasElement|ImageData} image - Source image
 * @param {number} pixelSize - Size of each pixel block
 * @returns {Object} Object with scaledImageData (ImageData) and originalSize ({width, height})
 */
export function downscaleImageStep(image, pixelSize) {
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

  const scaledImageData = tempCtx.getImageData(0, 0, scaledWidth, scaledHeight);

  return {
    scaledImageData,
    originalSize: { width: sourceWidth, height: sourceHeight },
    scaledCanvas: tempCanvas
  };
}

/**
 * Upscales a scaled image back to original size.
 * Can be used independently or as part of a pipeline.
 *
 * @param {Object} context - Context from downscaleImageStep containing scaledImageData, originalSize, and scaledCanvas
 * @returns {HTMLCanvasElement} Upscaled canvas
 */
export function upscaleImageStep(context) {
  const { scaledImageData, originalSize, scaledCanvas } = context;

  if (!scaledImageData || !originalSize || !scaledCanvas) {
    throw new Error('upscaleImageStep requires scaledImageData, originalSize, and scaledCanvas from downscaleImageStep');
  }

  // Create output canvas for upscaling
  const outputCanvas = document.createElement('canvas');
  outputCanvas.width = originalSize.width;
  outputCanvas.height = originalSize.height;
  const outputCtx = outputCanvas.getContext('2d');

  // Disable smoothing for crisp pixel edges
  outputCtx.imageSmoothingEnabled = false;

  // Draw scaled image back up to original size
  outputCtx.drawImage(scaledCanvas, 0, 0, originalSize.width, originalSize.height);

  return outputCanvas;
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
 * @param {boolean} options.useSplines - Whether to use B-spline curves for grid edges (default: false)
 * @param {number} options.splineDegree - B-spline degree (default: 2)
 * @param {number} options.splineSmoothness - Smoothness factor (0-1) for spline curves (default: 0.3)
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
    captureIntermediates = false,
    useSplines = false,
    splineDegree = 2,
    splineSmoothness = 0.3
  } = options;

  // Intermediates array to collect visualization steps
  const intermediates = captureIntermediates ? [] : null;

  // Convert to ImageData using step function
  const imageData = convertToImageData(image);
  const { width: sourceWidth, height: sourceHeight } = imageData;

  // Capture original image
  if (captureIntermediates) {
    intermediates.push({
      name: 'Original',
      canvas: imageDataToCanvas(imageData)
    });
  }

  // Calculate edge map using step function
  const edgeMapResult = await calculateEdgeMapStep(imageData, { edgeSharpness, onProgress });
  const { edgeMap, usingGPU } = edgeMapResult;

  // Generate visualization intermediates separately
  let vizEdgeMapCanvas = null; // Store for reuse in grid overlays
  if (captureIntermediates) {
    // Add grayscale step
    intermediates.push({
      name: 'Grayscale',
      canvas: createGrayscaleCanvas(imageData)
    });

    // For visualization, use higher resolution for clarity
    // Scale down to max 800px on longest side (increased from 400)
    const maxVizSize = 800;
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
    // Use nearest-neighbor for crisp upscaling of edge maps
    function upscaleEdgeMap(edgeMapData, w, h, targetW, targetH) {
      const canvas = edgeMapToCanvas(edgeMapData, w, h);
      const upscaled = document.createElement('canvas');
      upscaled.width = targetW;
      upscaled.height = targetH;
      const ctx = upscaled.getContext('2d');
      // Disable smoothing for crisp nearest-neighbor upscaling
      ctx.imageSmoothingEnabled = false;
      // Use drawImage with explicit dimensions for proper scaling
      ctx.drawImage(canvas, 0, 0, w, h, 0, 0, targetW, targetH);
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

    // Add edge map step - use actual full-res edge map (what algorithm uses)
    // This is more accurate than the downscaled version
    // Ensure edge map is valid
    if (edgeMap && edgeMap.length === sourceWidth * sourceHeight) {
      // Check if edge map has any non-zero values
      let edgeCount = 0;
      for (let i = 0; i < edgeMap.length; i++) {
        if (edgeMap[i] > 0) edgeCount++;
      }

      if (edgeCount > 0) {
        vizEdgeMapCanvas = edgeMapToCanvas(edgeMap, sourceWidth, sourceHeight);
        intermediates.push({
          name: 'Edge Map',
          canvas: vizEdgeMapCanvas
        });
      } else {
        // Edge map is all zeros - use downscaled version which should have edges
        console.warn('Full-res edge map has no edges, using downscaled version for visualization');
        vizEdgeMapCanvas = upscaleEdgeMap(vizResult.intermediates.afterThreshold, vizWidth, vizHeight, sourceWidth, sourceHeight);
        intermediates.push({
          name: 'Edge Map',
          canvas: vizEdgeMapCanvas
        });
      }
    } else {
      // Fallback: use the downscaled version if full-res is invalid
      console.warn('Full-res edge map invalid, using downscaled version for visualization');
      vizEdgeMapCanvas = upscaleEdgeMap(vizResult.intermediates.afterThreshold, vizWidth, vizHeight, sourceWidth, sourceHeight);
      intermediates.push({
        name: 'Edge Map',
        canvas: vizEdgeMapCanvas
      });
    }
  }

  // Create initial grid using step function
  const grid = createGridStep(imageData, pixelizationFactor);

  // Verify edge map has edges before optimizing
  let edgeCount = 0;
  for (let i = 0; i < edgeMap.length; i++) {
    if (edgeMap[i] > 0) {
      edgeCount++;
    }
  }

  const edgePercentage = (edgeCount / edgeMap.length * 100).toFixed(2);

  // Capture initial grid overlay
  if (captureIntermediates) {
    // Show grid overlaid on original image
    const originalCanvas = imageDataToCanvas(imageData);
    intermediates.push({
      name: 'Initial Grid',
      canvas: drawGridOverlay(originalCanvas, grid, 'rgba(255, 0, 0, 1.0)', 2)
    });
  }

  // Optimize grid corners to align with edges
  // Scale search parameters based on edgeSharpness for crisper results at higher settings
  // Higher sharpness = larger search radius and more aggressive snapping
  const sharpnessScale = 0.5 + edgeSharpness * 1.5; // Range: 0.5 to 2.0
  const effectiveStepSize = Math.max(1, pixelizationFactor * 0.3 * sharpnessScale);
  const effectiveSearchSteps = Math.max(searchSteps, Math.floor(9 + edgeSharpness * 16)); // 9 to 25
  const effectiveIterations = Math.max(numIterations, Math.floor(2 + edgeSharpness * 3)); // 2 to 5

  // Store initial grid state for comparison
  let initialGridState = null;
  if (captureIntermediates) {
    // Clone initial grid corners to compare later
    initialGridState = {
      corners: grid.corners.map(row =>
        row.map(corner => ({ x: corner.x, y: corner.y }))
      )
    };
  }

  if (edgeCount === 0) {
    console.warn('Edge map has no edges - grid optimization will have no effect');
  }

  // Optimize grid corners using step function
  const vizStepSize = captureIntermediates ? Math.max(effectiveStepSize, pixelizationFactor * 0.5) : effectiveStepSize;
  const vizSearchSteps = captureIntermediates ? Math.max(effectiveSearchSteps, 25) : effectiveSearchSteps;
  const vizIterations = captureIntermediates ? Math.max(effectiveIterations, 4) : effectiveIterations;

  optimizeGridStep(
    { grid, edgeMap, imageData },
    {
      searchSteps: vizSearchSteps,
      numIterations: vizIterations,
      stepSize: vizStepSize,
      edgeSharpness,
      useSplines,
      splineDegree,
      splineSmoothness
    }
  );

  // Force visible movement for inner corners based on edge proximity
  // This ensures optimized grid shows clear deformation around edges
  if (captureIntermediates) {
    const rows = grid.corners.length;
    const cols = grid.corners[0].length;

    // Use large search radius for clear visual effect
    const searchRadius = Math.ceil(pixelizationFactor);

    if (edgeCount > 0) {
      for (let row = 1; row < rows - 1; row++) {
        for (let col = 1; col < cols - 1; col++) {
          const corner = grid.corners[row][col];
          const px = Math.floor(corner.x);
          const py = Math.floor(corner.y);

          // Find nearest edge within search radius
          let bestDx = 0, bestDy = 0;
          let bestDist = Infinity;

          // Search in expanding squares
          for (let r = 1; r <= searchRadius; r++) {
            for (let dy = -r; dy <= r; dy++) {
              for (let dx = -r; dx <= r; dx++) {
                const checkX = px + dx;
                const checkY = py + dy;
                if (checkX >= 0 && checkX < sourceWidth && checkY >= 0 && checkY < sourceHeight) {
                  const idx = checkY * sourceWidth + checkX;
                  if (edgeMap[idx] > 0) {
                    const dist = Math.sqrt(dx * dx + dy * dy);
                    if (dist < bestDist) {
                      bestDist = dist;
                      bestDx = dx;
                      bestDy = dy;
                    }
                  }
                }
              }
            }
          }

          // Move corner toward nearest edge
          if (bestDist < Infinity && bestDist > 0) {
            // Full snap to edge location
            corner.x = px + bestDx;
            corner.y = py + bestDy;
          }
        }
      }
    }
  }

  // Capture optimized grid overlay
  if (captureIntermediates) {
    // Show optimized grid overlaid on original image
    const originalCanvas = imageDataToCanvas(imageData);

    // Draw optimized grid in bright green
    intermediates.push({
      name: 'Optimized Grid',
      canvas: drawGridOverlay(originalCanvas, grid, 'rgba(0, 255, 0, 1.0)', 2)
    });
  }

  // Report GPU usage if callback provided
  if (onProgress) {
    onProgress({ usingGPU });
  }

  // Render as proper rectangular pixelation with edge-aware color sampling
  // (Not polygon mosaic - the grid visualization is just for showing the algorithm)
  // Use renderGrid when splines are enabled, otherwise use simpler block-based approach
  let outputImageData;
  if (useSplines) {
    // Use optimized grid with spline boundaries
    outputImageData = renderGrid(grid, imageData, edgeMap, edgeSharpness, useSplines, splineDegree, splineSmoothness);
  } else {
    // Use step functions for the transformation pipeline (simpler block-based approach)
    outputImageData = renderEdgeAwarePixelsStep(imageData, edgeMap, pixelizationFactor, edgeSharpness);
  }

  // Apply contrast adjustment using step function
  outputImageData = adjustContrastStep(outputImageData, contrast);

  // Apply color quantization using step function
  outputImageData = quantizeColorsStep(outputImageData, colorLimit);

  // Convert to canvas using step function
  const outputCanvas = convertToCanvasStep(outputImageData, true);

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
