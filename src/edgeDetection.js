/**
 * Edge Detection Module
 *
 * Detects edges in images using gradient-based methods.
 * Creates an edge map that can be used for adaptive grid alignment.
 */

/**
 * Applies non-maximum suppression to thin edges.
 * Keeps only local maxima in the gradient direction.
 *
 * @param {Float32Array} magnitudeMap - Gradient magnitude map
 * @param {Float32Array} directionMap - Gradient direction map (in radians, perpendicular to gradient)
 * @param {number} width - Image width
 * @param {number} height - Image height
 * @returns {Float32Array} Suppressed edge map
 */
export function applyNonMaximumSuppression(magnitudeMap, directionMap, width, height) {
  const suppressed = new Float32Array(width * height);

  // For each pixel (excluding borders)
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = y * width + x;
      const magnitude = magnitudeMap[idx];
      const direction = directionMap[idx];

      if (magnitude === 0) {
        suppressed[idx] = 0;
        continue;
      }

      // Normalize direction to [0, 2π)
      let normalizedDir = direction;
      while (normalizedDir < 0) normalizedDir += 2 * Math.PI;
      while (normalizedDir >= 2 * Math.PI) normalizedDir -= 2 * Math.PI;

      // Determine which direction (0°, 45°, 90°, 135°) this edge is closest to
      // We need to check neighbors along the edge direction (perpendicular to gradient)
      let neighbor1, neighbor2;

      // Map direction to one of 4 sectors: 0°, 45°, 90°, 135°
      // Since direction is perpendicular to gradient, we check along the edge
      if ((normalizedDir >= 0 && normalizedDir < Math.PI / 8) ||
          (normalizedDir >= 15 * Math.PI / 8 && normalizedDir < 2 * Math.PI) ||
          (normalizedDir >= 7 * Math.PI / 8 && normalizedDir < 9 * Math.PI / 8)) {
        // Horizontal edge (0° or 180°) - compare with left/right neighbors
        neighbor1 = magnitudeMap[idx - 1]; // left
        neighbor2 = magnitudeMap[idx + 1]; // right
      } else if ((normalizedDir >= Math.PI / 8 && normalizedDir < 3 * Math.PI / 8) ||
                 (normalizedDir >= 9 * Math.PI / 8 && normalizedDir < 11 * Math.PI / 8)) {
        // Diagonal edge (45° or 225°) - compare with top-right/bottom-left neighbors
        neighbor1 = magnitudeMap[(y - 1) * width + (x + 1)]; // top-right
        neighbor2 = magnitudeMap[(y + 1) * width + (x - 1)]; // bottom-left
      } else if ((normalizedDir >= 3 * Math.PI / 8 && normalizedDir < 5 * Math.PI / 8) ||
                 (normalizedDir >= 11 * Math.PI / 8 && normalizedDir < 13 * Math.PI / 8)) {
        // Vertical edge (90° or 270°) - compare with top/bottom neighbors
        neighbor1 = magnitudeMap[(y - 1) * width + x]; // top
        neighbor2 = magnitudeMap[(y + 1) * width + x]; // bottom
      } else {
        // Diagonal edge (135° or 315°) - compare with top-left/bottom-right neighbors
        neighbor1 = magnitudeMap[(y - 1) * width + (x - 1)]; // top-left
        neighbor2 = magnitudeMap[(y + 1) * width + (x + 1)]; // bottom-right
      }

      // Keep pixel only if it's a local maximum
      if (magnitude >= neighbor1 && magnitude >= neighbor2) {
        suppressed[idx] = magnitude;
      } else {
        suppressed[idx] = 0;
      }
    }
  }

  return suppressed;
}

/**
 * Applies thresholding to create sharp edges.
 * Uses percentile-based thresholding for better adaptation to edge value distribution.
 *
 * @param {Float32Array} edgeMap - Edge map (typically after NMS)
 * @param {number} width - Image width
 * @param {number} height - Image height
 * @param {Object} options - Thresholding options
 * @param {number} options.threshold - Simple threshold value (0-1). Values below this are set to 0.
 * @param {number} options.highThreshold - High threshold for hysteresis (optional)
 * @param {number} options.lowThreshold - Low threshold for hysteresis (optional)
 * @param {boolean} options.usePercentile - Use percentile-based thresholding (default: true)
 * @param {boolean} options.binarize - If true, output binary edges (0 or 1) for crisp results (default: true)
 * @returns {Float32Array} Thresholded edge map
 */
export function applyThresholding(edgeMap, width, height, options = {}) {
  const { threshold = 0.1, highThreshold = null, lowThreshold = null, usePercentile = true, binarize = true } = options;
  const thresholded = new Float32Array(edgeMap.length);

  // Calculate percentile-based threshold if enabled
  let actualThreshold = threshold;
  if (usePercentile && threshold > 0) {
    // Collect all non-zero edge values
    const nonZeroValues = [];
    for (let i = 0; i < edgeMap.length; i++) {
      if (edgeMap[i] > 0) {
        nonZeroValues.push(edgeMap[i]);
      }
    }

    if (nonZeroValues.length > 0) {
      // Sort values in ascending order
      nonZeroValues.sort((a, b) => a - b);
      // Calculate percentile: threshold of 0.9 means keep top 10% of edges
      // threshold of 0.0 means keep all edges
      // For threshold 0.9, we want to keep the top 10%, so we need the value at 90th percentile
      const percentile = threshold; // 0.9 threshold = 90th percentile
      // Use ceiling to be more aggressive - ensures we filter more edges
      const percentileIndex = Math.ceil(nonZeroValues.length * percentile);
      // Get the value at the percentile index
      const index = Math.min(nonZeroValues.length - 1, Math.max(0, percentileIndex));
      actualThreshold = nonZeroValues[index];

      // Note: Removed aggressive boost for high thresholds
      // We need to preserve enough edges for grid alignment to work effectively
    }
  }

  // Use hysteresis thresholding if both thresholds are provided
  if (highThreshold !== null && lowThreshold !== null && highThreshold > lowThreshold) {
    // Calculate percentile-based thresholds if enabled
    let actualHighThreshold = highThreshold;
    let actualLowThreshold = lowThreshold;

    if (usePercentile) {
      const nonZeroValues = [];
      for (let i = 0; i < edgeMap.length; i++) {
        if (edgeMap[i] > 0) {
          nonZeroValues.push(edgeMap[i]);
        }
      }

      if (nonZeroValues.length > 0) {
        nonZeroValues.sort((a, b) => a - b);
        const highPercentile = 1 - highThreshold;
        const lowPercentile = 1 - lowThreshold;
        const highIndex = Math.floor(nonZeroValues.length * highPercentile);
        const lowIndex = Math.floor(nonZeroValues.length * lowPercentile);
        actualHighThreshold = nonZeroValues[Math.max(0, highIndex - 1)] || 0;
        actualLowThreshold = nonZeroValues[Math.max(0, lowIndex - 1)] || 0;
      }
    }

    // First pass: mark strong edges (above high threshold) and weak edges (between thresholds)
    const strongEdges = new Set();
    const weakEdges = new Set();

    for (let i = 0; i < edgeMap.length; i++) {
      if (edgeMap[i] >= actualHighThreshold) {
        strongEdges.add(i);
        thresholded[i] = binarize ? 1.0 : edgeMap[i];
      } else if (edgeMap[i] >= actualLowThreshold) {
        weakEdges.add(i);
        thresholded[i] = 0; // Will be determined in second pass
      } else {
        thresholded[i] = 0;
      }
    }

    // Second pass: keep weak edges that are connected to strong edges
    // Check 8-connected neighbors
    for (let i = 0; i < edgeMap.length; i++) {
      if (weakEdges.has(i)) {
        // Check if any 8-connected neighbor is a strong edge
        let connected = false;
        const x = i % width;
        const y = Math.floor(i / width);

        for (let dy = -1; dy <= 1 && !connected; dy++) {
          for (let dx = -1; dx <= 1 && !connected; dx++) {
            if (dx === 0 && dy === 0) continue;
            const nx = x + dx;
            const ny = y + dy;
            if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
              const neighborIdx = ny * width + nx;
              if (strongEdges.has(neighborIdx)) {
                connected = true;
              }
            }
          }
        }

        if (connected) {
          thresholded[i] = binarize ? 1.0 : edgeMap[i];
        }
      }
    }
  } else {
    // Simple thresholding (using percentile-based threshold if enabled)
    // Binarize by default for crisp edges
    for (let i = 0; i < edgeMap.length; i++) {
      if (edgeMap[i] >= actualThreshold) {
        thresholded[i] = binarize ? 1.0 : edgeMap[i];
      } else {
        thresholded[i] = 0;
      }
    }
  }

  return thresholded;
}

/**
 * Calculates the gradient magnitude at each pixel using Sobel operators.
 *
 * @param {ImageData} imageData - Source image data
 * @param {Object} options - Optional configuration
 * @param {boolean} options.applyNMS - Apply non-maximum suppression (default: true)
 * @param {number} options.threshold - Threshold value for edge sharpening (0-1, default: 0.4)
 * @param {number} options.edgeSharpness - Edge sharpness level (0-1, default: 0.8). Maps to threshold: 0 = soft (0.0), 1 = very sharp (0.9)
 * @param {number} options.highThreshold - High threshold for hysteresis (optional)
 * @param {number} options.lowThreshold - Low threshold for hysteresis (optional)
 * @param {boolean} options.captureIntermediates - If true, return object with intermediate steps (default: false)
 * @returns {Float32Array|Object} Edge strength map, or object with edgeMap and intermediates if captureIntermediates is true
 */
export function calculateEdgeMap(imageData, options = {}) {
  let {
    applyNMS = true,
    threshold = null,
    edgeSharpness = 0.8,
    highThreshold = null,
    lowThreshold = null,
    captureIntermediates = false
  } = options;

  // Map edgeSharpness (0-1) to threshold for edge detection
  // edgeSharpness 0.0 -> threshold 0.1 (keep top 90% - very soft, many edges)
  // edgeSharpness 0.5 -> threshold 0.35 (keep top 65% - moderate)
  // edgeSharpness 1.0 -> threshold 0.6 (keep top 40% - sharp, focused edges)
  // Wider range allows more visible difference between soft and sharp settings
  if (threshold === null) {
    threshold = 0.1 + edgeSharpness * 0.5;
  }

  const { data, width, height } = imageData;
  const magnitudeMap = new Float32Array(width * height);
  const directionMap = new Float32Array(width * height);

  // Capture grayscale if needed
  let grayscaleMap = null;
  if (captureIntermediates) {
    grayscaleMap = new Float32Array(width * height);
  }

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

  // Calculate gradient magnitude and direction for each pixel (excluding border pixels)
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

          // Capture center pixel grayscale
          if (captureIntermediates && ky === 0 && kx === 0) {
            grayscaleMap[y * width + x] = gray / 255;
          }
        }
      }

      // Calculate gradient magnitude
      const magnitude = Math.sqrt(gx * gx + gy * gy);
      magnitudeMap[y * width + x] = magnitude;

      // Calculate edge direction (perpendicular to gradient)
      const direction = Math.atan2(gy, gx) + Math.PI / 2;
      directionMap[y * width + x] = direction;
    }
  }

  // Fill in border pixels for grayscale
  if (captureIntermediates) {
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (y === 0 || y === height - 1 || x === 0 || x === width - 1) {
          const idx = (y * width + x) * 4;
          const gray = (data[idx] + data[idx + 1] + data[idx + 2]) / 3;
          grayscaleMap[y * width + x] = gray / 255;
        }
      }
    }
  }

  // Normalize magnitude map to 0-1 range before processing
  let maxEdge = 0;
  for (let i = 0; i < magnitudeMap.length; i++) {
    if (magnitudeMap[i] > maxEdge) {
      maxEdge = magnitudeMap[i];
    }
  }

  if (maxEdge > 0) {
    for (let i = 0; i < magnitudeMap.length; i++) {
      magnitudeMap[i] /= maxEdge;
    }
  }

  // Capture normalized magnitude before NMS
  let normalizedMagnitude = null;
  if (captureIntermediates) {
    normalizedMagnitude = new Float32Array(magnitudeMap);
  }

  let edgeMap = magnitudeMap;
  let afterNMS = null;

  // Apply non-maximum suppression if requested
  if (applyNMS) {
    edgeMap = applyNonMaximumSuppression(magnitudeMap, directionMap, width, height);

    // Capture after NMS
    if (captureIntermediates) {
      afterNMS = new Float32Array(edgeMap);
    }
  }

  // Apply thresholding
  edgeMap = applyThresholding(edgeMap, width, height, {
    threshold,
    highThreshold,
    lowThreshold
  });

  // Return with intermediates if requested
  if (captureIntermediates) {
    return {
      edgeMap,
      intermediates: {
        grayscale: grayscaleMap,
        magnitude: normalizedMagnitude,
        afterNMS: afterNMS || normalizedMagnitude,
        afterThreshold: edgeMap
      },
      width,
      height
    };
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
 * Gets the edge strength at a sub-pixel coordinate.
 * Supports both nearest-neighbor (crisp) and bilinear (smooth) modes.
 *
 * @param {Float32Array} edgeMap - Edge map from calculateEdgeMap
 * @param {number} width - Image width
 * @param {number} height - Image height
 * @param {number} x - X coordinate (can be fractional)
 * @param {number} y - Y coordinate (can be fractional)
 * @param {boolean} interpolate - If true, use bilinear interpolation; if false, use nearest-neighbor (default: false for crisp edges)
 * @returns {number} Edge strength (0-1)
 */
export function getEdgeStrengthInterpolated(edgeMap, width, height, x, y, interpolate = false) {
  // Clamp coordinates to valid range
  x = Math.max(0, Math.min(width - 1, x));
  y = Math.max(0, Math.min(height - 1, y));

  if (!interpolate) {
    // Nearest-neighbor: round to nearest pixel for crisp edge detection
    const px = Math.round(x);
    const py = Math.round(y);
    const idx = py * width + px;
    return edgeMap[idx] || 0;
  }

  // Bilinear interpolation (smooth but can blur edges)
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

  const v1 = v11 * (1 - fx) + v21 * fx;
  const v2 = v12 * (1 - fx) + v22 * fx;
  return v1 * (1 - fy) + v2 * fy;
}

/**
 * Counts the number of edge pixels in a small region around the given point.
 * This is more robust than single-pixel lookup for grid alignment.
 *
 * @param {Float32Array} edgeMap - Edge map from calculateEdgeMap
 * @param {number} width - Image width
 * @param {number} height - Image height
 * @param {number} x - X coordinate
 * @param {number} y - Y coordinate
 * @param {number} radius - Radius to search (default: 1)
 * @returns {number} Edge density (0-1)
 */
export function getEdgeDensity(edgeMap, width, height, x, y, radius = 1) {
  const px = Math.round(x);
  const py = Math.round(y);

  let edgeCount = 0;
  let totalCount = 0;

  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      const nx = px + dx;
      const ny = py + dy;

      if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
        const idx = ny * width + nx;
        if (edgeMap[idx] > 0) {
          edgeCount++;
        }
        totalCount++;
      }
    }
  }

  return totalCount > 0 ? edgeCount / totalCount : 0;
}
