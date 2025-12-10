/**
 * Pixel Art Generator - Main Pixelation Module
 *
 * Provides functions to pixelate images using canvas-based techniques.
 * Based on the projection logic found in the original implementation.
 */

/**
 * Pixelates an image by scaling it down and then back up with nearest-neighbor interpolation.
 *
 * @param {HTMLImageElement|HTMLCanvasElement|ImageData} image - Source image to pixelate
 * @param {number} pixelSize - Size of each pixel block (e.g., 3 = 3x3 pixel blocks)
 * @param {Object} options - Optional configuration
 * @param {boolean} options.returnCanvas - If true, returns canvas element; otherwise returns ImageData
 * @param {number} options.colorLimit - Limit the number of colors (optional, for color quantization)
 * @returns {HTMLCanvasElement|ImageData} Pixelated image
 */
export function pixelateImage(image, pixelSize, options = {}) {
  const {
    returnCanvas = false,
    colorLimit = null
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
  }

  // Create output canvas for upscaling
  const outputCanvas = document.createElement('canvas');
  outputCanvas.width = sourceWidth;
  outputCanvas.height = sourceHeight;
  const outputCtx = outputCanvas.getContext('2d');

  // Disable smoothing for crisp pixel edges
  outputCtx.imageSmoothingEnabled = false;

  // Draw scaled image back up to original size
  outputCtx.putImageData(imageData, 0, 0);
  outputCtx.drawImage(tempCanvas, 0, 0, sourceWidth, sourceHeight);

  if (returnCanvas) {
    return outputCanvas;
  } else {
    return outputCtx.getImageData(0, 0, sourceWidth, sourceHeight);
  }
}

/**
 * Quantizes colors in an image to reduce the color palette.
 * Uses a simple median cut algorithm.
 *
 * @param {ImageData} imageData - Image data to quantize
 * @param {number} maxColors - Maximum number of colors to use
 * @returns {ImageData} Quantized image data
 */
function quantizeColors(imageData, maxColors) {
  const data = new Uint8ClampedArray(imageData.data);
  const width = imageData.width;
  const height = imageData.height;
  const colorMap = new Map();

  // Build color frequency map
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const key = `${r},${g},${b}`;
    colorMap.set(key, (colorMap.get(key) || 0) + 1);
  }

  // If we already have fewer colors than the limit, return original
  if (colorMap.size <= maxColors) {
    return imageData;
  }

  // Simple color quantization: find most common colors and map others to nearest
  const sortedColors = Array.from(colorMap.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, maxColors)
    .map(([key]) => {
      const [r, g, b] = key.split(',').map(Number);
      return { r, g, b };
    });

  // Create output image data
  const output = new ImageData(width, height);
  const outputData = output.data;

  // Map each pixel to nearest color
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const a = data[i + 3];

    // Find nearest color
    let minDist = Infinity;
    let nearestColor = sortedColors[0];
    for (const color of sortedColors) {
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

