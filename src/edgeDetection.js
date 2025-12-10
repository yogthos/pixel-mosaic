/**
 * Edge Detection Module
 *
 * Detects edges in images using gradient-based methods.
 * Creates an edge map that can be used for adaptive grid alignment.
 */

/**
 * Calculates the gradient magnitude at each pixel using Sobel operators.
 *
 * @param {ImageData} imageData - Source image data
 * @returns {Float32Array} Edge strength map (1D array, same size as image pixels)
 */
export function calculateEdgeMap(imageData) {
  const { data, width, height } = imageData;
  const edgeMap = new Float32Array(width * height);

  // Sobel kernels for gradient calculation
  const sobelX = [
    -1, 0, 1,
    -2, 0, 2,
    -1, 0, 1
  ];

  const sobelY = [
    -1, -2, -1,
     0,  0,  0,
     1,  2,  1
  ];

  // Calculate gradient for each pixel (excluding border pixels)
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      let gx = 0, gy = 0;

      // Apply Sobel kernels
      for (let ky = -1; ky <= 1; ky++) {
        for (let kx = -1; kx <= 1; kx++) {
          const idx = ((y + ky) * width + (x + kx)) * 4;
          const gray = (data[idx] + data[idx + 1] + data[idx + 2]) / 3;

          const kernelIdx = (ky + 1) * 3 + (kx + 1);
          gx += gray * sobelX[kernelIdx];
          gy += gray * sobelY[kernelIdx];
        }
      }

      // Calculate gradient magnitude
      const magnitude = Math.sqrt(gx * gx + gy * gy);
      edgeMap[y * width + x] = magnitude;
    }
  }

  // Normalize edge map to 0-1 range
  let maxEdge = 0;
  for (let i = 0; i < edgeMap.length; i++) {
    if (edgeMap[i] > maxEdge) {
      maxEdge = edgeMap[i];
    }
  }

  if (maxEdge > 0) {
    for (let i = 0; i < edgeMap.length; i++) {
      edgeMap[i] /= maxEdge;
    }
  }

  return edgeMap;
}

/**
 * Calculates edge direction (orientation) at each pixel.
 *
 * @param {ImageData} imageData - Source image data
 * @returns {Float32Array} Edge direction map in radians (1D array, same size as image pixels)
 */
export function calculateEdgeDirections(imageData) {
  const { data, width, height } = imageData;
  const directions = new Float32Array(width * height);

  // Sobel kernels for gradient calculation
  const sobelX = [
    -1, 0, 1,
    -2, 0, 2,
    -1, 0, 1
  ];

  const sobelY = [
    -1, -2, -1,
     0,  0,  0,
     1,  2,  1
  ];

  // Calculate gradient direction for each pixel (excluding border pixels)
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      let gx = 0, gy = 0;

      // Apply Sobel kernels
      for (let ky = -1; ky <= 1; ky++) {
        for (let kx = -1; kx <= 1; kx++) {
          const idx = ((y + ky) * width + (x + kx)) * 4;
          const gray = (data[idx] + data[idx + 1] + data[idx + 2]) / 3;

          const kernelIdx = (ky + 1) * 3 + (kx + 1);
          gx += gray * sobelX[kernelIdx];
          gy += gray * sobelY[kernelIdx];
        }
      }

      // Calculate edge direction (perpendicular to gradient)
      const direction = Math.atan2(gy, gx) + Math.PI / 2; // Perpendicular to gradient
      directions[y * width + x] = direction;
    }
  }

  return directions;
}

/**
 * Gets the edge strength at a specific coordinate.
 *
 * @param {Float32Array} edgeMap - Edge map from calculateEdgeMap
 * @param {number} width - Image width
 * @param {number} x - X coordinate
 * @param {number} y - Y coordinate
 * @returns {number} Edge strength (0-1)
 */
export function getEdgeStrength(edgeMap, width, x, y) {
  const idx = Math.floor(y) * width + Math.floor(x);
  if (idx < 0 || idx >= edgeMap.length) {
    return 0;
  }
  return edgeMap[idx];
}

/**
 * Gets the edge strength at a sub-pixel coordinate using bilinear interpolation.
 *
 * @param {Float32Array} edgeMap - Edge map from calculateEdgeMap
 * @param {number} width - Image width
 * @param {number} height - Image height
 * @param {number} x - X coordinate (can be fractional)
 * @param {number} y - Y coordinate (can be fractional)
 * @returns {number} Interpolated edge strength (0-1)
 */
export function getEdgeStrengthInterpolated(edgeMap, width, height, x, y) {
  // Clamp coordinates to valid range
  x = Math.max(0, Math.min(width - 1, x));
  y = Math.max(0, Math.min(height - 1, y));

  const x1 = Math.floor(x);
  const y1 = Math.floor(y);
  const x2 = Math.min(width - 1, x1 + 1);
  const y2 = Math.min(height - 1, y1 + 1);

  const fx = x - x1;
  const fy = y - y1;

  const idx11 = y1 * width + x1;
  const idx12 = y2 * width + x1;
  const idx21 = y1 * width + x2;
  const idx22 = y2 * width + x2;

  const v11 = edgeMap[idx11] || 0;
  const v12 = edgeMap[idx12] || 0;
  const v21 = edgeMap[idx21] || 0;
  const v22 = edgeMap[idx22] || 0;

  // Bilinear interpolation
  const v1 = v11 * (1 - fx) + v21 * fx;
  const v2 = v12 * (1 - fx) + v22 * fx;
  return v1 * (1 - fy) + v2 * fy;
}

