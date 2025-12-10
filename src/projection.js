/**
 * Pixel Art Generator - Projective Transformation Module
 *
 * Implements projective transformation (homography) for image warping.
 */

/**
 * Applies a projective transformation to an image using a 3x3 homography matrix.
 *
 * The transformation matrix is represented as 8 parameters:
 * [a1, a2, a3, b1, b2, b3, c1, c2]
 *
 * The full 3x3 matrix is:
 * [a1 a2 a3]
 * [b1 b2 b3]
 * [c1 c2  1]
 *
 * @param {HTMLImageElement|HTMLCanvasElement|ImageData} image - Source image
 * @param {Array<number>} transformMatrix - 8-element array [a1, a2, a3, b1, b2, b3, c1, c2]
 * @param {Object} options - Optional configuration
 * @param {string} options.interpolation - 'nearest' or 'bilinear' (default: 'nearest')
 * @param {string} options.fillMode - 'constant', 'reflect', 'wrap', or 'nearest' (default: 'constant')
 * @param {number} options.fillValue - Fill value for out-of-bounds pixels (default: 0)
 * @param {boolean} options.returnCanvas - If true, returns canvas element; otherwise returns ImageData
 * @returns {HTMLCanvasElement|ImageData} Transformed image
 */
export function applyProjection(image, transformMatrix, options = {}) {
  const {
    interpolation = 'nearest',
    fillMode = 'constant',
    fillValue = 0,
    returnCanvas = false
  } = options;

  if (transformMatrix.length !== 8) {
    throw new Error('Transform matrix must have 8 elements [a1, a2, a3, b1, b2, b3, c1, c2]');
  }

  const [a1, a2, a3, b1, b2, b3, c1, c2] = transformMatrix;

  // Get source image dimensions
  let sourceWidth, sourceHeight, sourceData;
  if (image instanceof ImageData) {
    sourceWidth = image.width;
    sourceHeight = image.height;
    sourceData = image.data;
  } else {
    const tempCanvas = document.createElement('canvas');
    if (image instanceof HTMLCanvasElement) {
      tempCanvas.width = image.width;
      tempCanvas.height = image.height;
      const ctx = tempCanvas.getContext('2d');
      ctx.drawImage(image, 0, 0);
    } else if (image instanceof HTMLImageElement) {
      tempCanvas.width = image.naturalWidth || image.width;
      tempCanvas.height = image.naturalHeight || image.height;
      const ctx = tempCanvas.getContext('2d');
      ctx.drawImage(image, 0, 0);
    } else {
      throw new Error('Unsupported image type');
    }
    sourceWidth = tempCanvas.width;
    sourceHeight = tempCanvas.height;
    sourceData = tempCanvas.getContext('2d').getImageData(0, 0, sourceWidth, sourceHeight).data;
  }

  // Create output canvas
  const outputCanvas = document.createElement('canvas');
  outputCanvas.width = sourceWidth;
  outputCanvas.height = sourceHeight;
  const outputCtx = outputCanvas.getContext('2d');
  const outputImageData = outputCtx.createImageData(sourceWidth, sourceHeight);
  const outputData = outputImageData.data;

  // Transform each pixel
  for (let y = 0; y < sourceHeight; y++) {
    for (let x = 0; x < sourceWidth; x++) {
      const xf = x;
      const yf = y;

      // Calculate projection
      const projection = c1 * xf + c2 * yf + 1.0;

      if (Math.abs(projection) < 0.0001) {
        // Projection is zero, use fill value
        const idx = (y * sourceWidth + x) * 4;
        outputData[idx] = fillValue;
        outputData[idx + 1] = fillValue;
        outputData[idx + 2] = fillValue;
        outputData[idx + 3] = 255;
        continue;
      }

      // Calculate source coordinates
      const inX = (a1 * xf + a2 * yf + a3) / projection;
      const inY = (b1 * xf + b2 * yf + b3) / projection;

      // Map coordinates based on fill mode
      const mapX = mapCoordinate(inX, sourceWidth, fillMode);
      const mapY = mapCoordinate(inY, sourceHeight, fillMode);

      // Sample pixel
      let r, g, b, a;
      if (interpolation === 'nearest') {
        const coordX = Math.round(mapX);
        const coordY = Math.round(mapY);
        const pixel = readPixel(sourceData, coordX, coordY, sourceWidth, sourceHeight, fillValue);
        r = pixel.r;
        g = pixel.g;
        b = pixel.b;
        a = pixel.a;
      } else {
        // Bilinear interpolation
        const xFloor = Math.floor(mapX);
        const yFloor = Math.floor(mapY);
        const xCeil = xFloor + 1;
        const yCeil = yFloor + 1;

        const topLeft = readPixel(sourceData, xFloor, yFloor, sourceWidth, sourceHeight, fillValue);
        const topRight = readPixel(sourceData, xCeil, yFloor, sourceWidth, sourceHeight, fillValue);
        const bottomLeft = readPixel(sourceData, xFloor, yCeil, sourceWidth, sourceHeight, fillValue);
        const bottomRight = readPixel(sourceData, xCeil, yCeil, sourceWidth, sourceHeight, fillValue);

        const xRatio = mapX - xFloor;
        const yRatio = mapY - yFloor;

        const top = lerpColor(topLeft, topRight, xRatio);
        const bottom = lerpColor(bottomLeft, bottomRight, xRatio);
        const final = lerpColor(top, bottom, yRatio);

        r = final.r;
        g = final.g;
        b = final.b;
        a = final.a;
      }

      // Write output pixel
      const idx = (y * sourceWidth + x) * 4;
      outputData[idx] = r;
      outputData[idx + 1] = g;
      outputData[idx + 2] = b;
      outputData[idx + 3] = a;
    }
  }

  outputCtx.putImageData(outputImageData, 0, 0);

  if (returnCanvas) {
    return outputCanvas;
  } else {
    return outputImageData;
  }
}

/**
 * Maps a coordinate based on the fill mode (reflect, wrap, nearest, or constant).
 *
 * @param {number} coord - Coordinate to map
 * @param {number} length - Length of the dimension
 * @param {string} fillMode - Fill mode: 'constant', 'reflect', 'wrap', or 'nearest'
 * @returns {number} Mapped coordinate
 */
function mapCoordinate(coord, length, fillMode) {
  if (fillMode === 'constant') {
    return coord;
  } else if (fillMode === 'reflect') {
    if (coord < 0) {
      if (length <= 1) {
        return 0;
      }
      const sz2 = 2 * length;
      if (coord < -sz2) {
        coord = coord + sz2 * Math.floor(-coord / sz2);
      }
      coord = coord < -length ? coord + sz2 : -coord - 1;
    } else if (coord > length - 1) {
      if (length <= 1) {
        return 0;
      }
      const sz2 = 2 * length;
      coord = coord - sz2 * Math.floor(coord / sz2);
      if (coord >= length) {
        coord = sz2 - coord - 1;
      }
    }
    return Math.max(0, Math.min(length - 1, coord));
  } else if (fillMode === 'wrap') {
    if (coord < 0) {
      if (length <= 1) {
        return 0;
      }
      const sz = length - 1;
      coord = coord + length * (Math.floor(-coord / sz) + 1);
    } else if (coord > length - 1) {
      if (length <= 1) {
        return 0;
      }
      const sz = length - 1;
      coord = coord - length * Math.floor(coord / sz);
    }
    return Math.max(0, Math.min(length - 1, coord));
  } else if (fillMode === 'nearest') {
    return Math.max(0, Math.min(length - 1, coord));
  }
  return coord;
}

/**
 * Reads a pixel from image data, handling out-of-bounds coordinates.
 *
 * @param {Uint8ClampedArray} data - Image data array
 * @param {number} x - X coordinate
 * @param {number} y - Y coordinate
 * @param {number} width - Image width
 * @param {number} height - Image height
 * @param {number} fillValue - Value to use for out-of-bounds pixels
 * @returns {Object} Pixel object with r, g, b, a properties
 */
function readPixel(data, x, y, width, height, fillValue) {
  if (x >= 0 && x < width && y >= 0 && y < height) {
    const idx = (y * width + x) * 4;
    return {
      r: data[idx],
      g: data[idx + 1],
      b: data[idx + 2],
      a: data[idx + 3]
    };
  } else {
    return {
      r: fillValue,
      g: fillValue,
      b: fillValue,
      a: 255
    };
  }
}

/**
 * Linearly interpolates between two colors.
 *
 * @param {Object} color1 - First color {r, g, b, a}
 * @param {Object} color2 - Second color {r, g, b, a}
 * @param {number} t - Interpolation factor (0-1)
 * @returns {Object} Interpolated color {r, g, b, a}
 */
function lerpColor(color1, color2, t) {
  return {
    r: Math.round(color1.r + (color2.r - color1.r) * t),
    g: Math.round(color1.g + (color2.g - color1.g) * t),
    b: Math.round(color1.b + (color2.b - color1.b) * t),
    a: Math.round(color1.a + (color2.a - color1.a) * t)
  };
}

/**
 * Creates an identity transformation matrix (no transformation).
 *
 * @returns {Array<number>} Identity matrix [1, 0, 0, 0, 1, 0, 0, 0]
 */
export function identityMatrix() {
  return [1, 0, 0, 0, 1, 0, 0, 0];
}

/**
 * Creates a transformation matrix for rotation around the center.
 *
 * @param {number} angle - Rotation angle in radians
 * @param {number} centerX - X coordinate of rotation center
 * @param {number} centerY - Y coordinate of rotation center
 * @returns {Array<number>} Transformation matrix
 */
export function rotationMatrix(angle, centerX, centerY) {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const tx = centerX - centerX * cos + centerY * sin;
  const ty = centerY - centerX * sin - centerY * cos;

  return [
    cos, -sin, tx,
    sin, cos, ty,
    0, 0
  ];
}

/**
 * Creates a transformation matrix for scaling.
 *
 * @param {number} scaleX - X scale factor
 * @param {number} scaleY - Y scale factor
 * @param {number} centerX - X coordinate of scaling center
 * @param {number} centerY - Y coordinate of scaling center
 * @returns {Array<number>} Transformation matrix
 */
export function scaleMatrix(scaleX, scaleY, centerX, centerY) {
  return [
    scaleX, 0, centerX * (1 - scaleX),
    0, scaleY, centerY * (1 - scaleY),
    0, 0
  ];
}

