/**
 * Grid Optimization Module
 *
 * Implements an adaptive grid system where grid corners can be moved
 * to align with image edges for better pixelation results.
 */

import { getEdgeStrengthInterpolated, getEdgeDensity } from './edgeDetection.js';

/**
 * Tests if a point is inside a quadrilateral using the cross-product method.
 *
 * @param {number} x - Point X coordinate
 * @param {number} y - Point Y coordinate
 * @param {Array} corners - Array of 4 corner points [topLeft, topRight, bottomRight, bottomLeft]
 * @returns {boolean} True if point is inside the quadrilateral
 */
function pointInQuadrilateral(x, y, corners) {
  // Use cross-product test for each edge
  // Point is inside if it's consistently on the same side of all edges
  const edges = [
    [corners[0], corners[1]], // Top edge
    [corners[1], corners[2]], // Right edge
    [corners[2], corners[3]], // Bottom edge
    [corners[3], corners[0]]  // Left edge
  ];

  // Check if point is on the same side (left or right) of all edges
  let side = null;

  for (const [p1, p2] of edges) {
    // Cross product: (p2 - p1) × (point - p1)
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const px = x - p1.x;
    const py = y - p1.y;
    const cross = dx * py - dy * px;

    if (Math.abs(cross) < 1e-10) {
      // Point is on the edge - consider it inside
      continue;
    }

    const currentSide = cross > 0 ? 'left' : 'right';

    if (side === null) {
      side = currentSide;
    } else if (side !== currentSide) {
      // Point is on different sides of different edges - not inside
      return false;
    }
  }

  // Point is consistently on one side of all edges (or on edges)
  return true;
}

/**
 * Represents a grid corner point
 */
class GridCorner {
  constructor(x, y) {
    this.x = x;
    this.y = y;
    this.originalX = x;
    this.originalY = y;
  }

  reset() {
    this.x = this.originalX;
    this.y = this.originalY;
  }
}

/**
 * Represents a grid cell
 */
class GridCell {
  constructor(corners) {
    this.corners = corners; // Array of 4 corners [topLeft, topRight, bottomRight, bottomLeft]
  }

  /**
   * Gets the bounding box of this cell
   */
  getBounds() {
    let minX = Infinity, minY = Infinity;
    let maxX = -Infinity, maxY = -Infinity;

    for (const corner of this.corners) {
      minX = Math.min(minX, corner.x);
      minY = Math.min(minY, corner.y);
      maxX = Math.max(maxX, corner.x);
      maxY = Math.max(maxY, corner.y);
    }

    return { minX, minY, maxX, maxY };
  }

  /**
   * Calculates the average color of pixels within this cell
   * Optimized: samples pixels at regular intervals for speed
   */
  getAverageColor(imageData) {
    const { data, width } = imageData;
    const bounds = this.getBounds();

    const minX = Math.max(0, Math.floor(bounds.minX));
    const minY = Math.max(0, Math.floor(bounds.minY));
    const maxX = Math.min(width - 1, Math.floor(bounds.maxX));
    const maxY = Math.min(imageData.height - 1, Math.floor(bounds.maxY));

    // Get corners as array for point-in-polygon test
    const corners = [
      this.corners[0], // topLeft
      this.corners[1], // topRight
      this.corners[2], // bottomRight
      this.corners[3]  // bottomLeft
    ];

    // Optimize: sample pixels at intervals instead of every pixel
    // This dramatically speeds up color calculation for large cells
    const sampleStep = Math.max(1, Math.floor(Math.min(
      (maxX - minX) / 10,
      (maxY - minY) / 10,
      4
    )));

    let r = 0, g = 0, b = 0, a = 0;
    let count = 0;

    for (let y = minY; y <= maxY; y += sampleStep) {
      for (let x = minX; x <= maxX; x += sampleStep) {
        // Use point-in-polygon test with pixel center
        const pixelCenterX = x + 0.5;
        const pixelCenterY = y + 0.5;

        if (pointInQuadrilateral(pixelCenterX, pixelCenterY, corners)) {
          const idx = (y * width + x) * 4;
          r += data[idx];
          g += data[idx + 1];
          b += data[idx + 2];
          a += data[idx + 3];
          count++;
        }
      }
    }

    if (count === 0) {
      // Fallback: use bounding box average if no samples found
      for (let y = minY; y <= maxY; y++) {
        for (let x = minX; x <= maxX; x++) {
          const idx = (y * width + x) * 4;
          r += data[idx];
          g += data[idx + 1];
          b += data[idx + 2];
          a += data[idx + 3];
          count++;
        }
      }
    }

    if (count === 0) {
      return { r: 0, g: 0, b: 0, a: 255 };
    }

    return {
      r: Math.round(r / count),
      g: Math.round(g / count),
      b: Math.round(b / count),
      a: Math.round(a / count)
    };
  }

  /**
   * Calculates blended color between average and median based on sharpness.
   * - sharpness 0: 100% average (soft, blended)
   * - sharpness 1: 100% median (crisp, dominant color)
   *
   * @param {ImageData} imageData - Source image data
   * @param {number} sharpness - Blend factor (0-1)
   * @returns {Object} Color {r, g, b, a}
   */
  getBlendedColor(imageData, sharpness) {
    const { data, width } = imageData;
    const bounds = this.getBounds();

    const minX = Math.max(0, Math.floor(bounds.minX));
    const minY = Math.max(0, Math.floor(bounds.minY));
    const maxX = Math.min(width - 1, Math.floor(bounds.maxX));
    const maxY = Math.min(imageData.height - 1, Math.floor(bounds.maxY));

    const corners = [
      this.corners[0],
      this.corners[1],
      this.corners[2],
      this.corners[3]
    ];

    // Sample densely for accurate calculation
    const sampleStep = Math.max(1, Math.floor(Math.min(
      (maxX - minX) / 15,
      (maxY - minY) / 15,
      2
    )));

    // Collect all color samples
    const samples = [];
    let avgR = 0, avgG = 0, avgB = 0, avgA = 0;

    for (let y = minY; y <= maxY; y += sampleStep) {
      for (let x = minX; x <= maxX; x += sampleStep) {
        const pixelCenterX = x + 0.5;
        const pixelCenterY = y + 0.5;

        if (pointInQuadrilateral(pixelCenterX, pixelCenterY, corners)) {
          const idx = (y * width + x) * 4;
          const r = data[idx];
          const g = data[idx + 1];
          const b = data[idx + 2];
          const a = data[idx + 3];

          samples.push({ r, g, b, a });
          avgR += r;
          avgG += g;
          avgB += b;
          avgA += a;
        }
      }
    }

    if (samples.length === 0) {
      return this.getAverageColor(imageData);
    }

    // Calculate average color
    const count = samples.length;
    avgR = Math.round(avgR / count);
    avgG = Math.round(avgG / count);
    avgB = Math.round(avgB / count);
    avgA = Math.round(avgA / count);

    // Calculate median color
    samples.sort((a, b) => (a.r + a.g + a.b) - (b.r + b.g + b.b));
    const medianIdx = Math.floor(samples.length / 2);
    const medR = samples[medianIdx].r;
    const medG = samples[medianIdx].g;
    const medB = samples[medianIdx].b;
    const medA = samples[medianIdx].a;

    // Blend between average and median based on sharpness
    // sharpness 0 = 100% average, sharpness 1 = 100% median
    const t = sharpness;
    return {
      r: Math.round(avgR * (1 - t) + medR * t),
      g: Math.round(avgG * (1 - t) + medG * t),
      b: Math.round(avgB * (1 - t) + medB * t),
      a: Math.round(avgA * (1 - t) + medA * t)
    };
  }
}

/**
 * Creates an initial uniform grid
 *
 * @param {number} width - Image width
 * @param {number} height - Image height
 * @param {number} gridSize - Approximate size of each grid cell
 * @returns {Object} Grid object with corners and cells
 */
export function createInitialGrid(width, height, gridSize) {
  const cols = Math.ceil(width / gridSize);
  const rows = Math.ceil(height / gridSize);

  const corners = [];
  const cells = [];

  // Create corner points
  for (let row = 0; row <= rows; row++) {
    const rowCorners = [];
    for (let col = 0; col <= cols; col++) {
      const x = (col * width) / cols;
      const y = (row * height) / rows;
      rowCorners.push(new GridCorner(x, y));
    }
    corners.push(rowCorners);
  }

  // Create cells from corners
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const cell = new GridCell([
        corners[row][col],
        corners[row][col + 1],
        corners[row + 1][col + 1],
        corners[row + 1][col]
      ]);
      cells.push(cell);
    }
  }

  return { corners, cells, cols, rows };
}

/**
 * Evaluates how well a grid edge (line between two corners) aligns with image edges.
 * Uses nearest-neighbor sampling by default for crisp edge detection.
 *
 * @param {Float32Array} edgeMap - Edge map
 * @param {number} width - Image width
 * @param {number} height - Image height
 * @param {number} x1 - Start X coordinate
 * @param {number} y1 - Start Y coordinate
 * @param {number} x2 - End X coordinate
 * @param {number} y2 - End Y coordinate
 * @returns {number} Alignment score (higher = better alignment)
 */
function evaluateEdgeAlignment(edgeMap, width, height, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const length = Math.sqrt(dx * dx + dy * dy);

  if (length < 1) return 0;

  // Sample points along the edge - use more samples for better precision
  const numSamples = Math.max(3, Math.ceil(length * 1.5));
  let edgeHits = 0;
  let consecutiveHits = 0;
  let maxConsecutiveHits = 0;

  for (let i = 0; i <= numSamples; i++) {
    const t = i / numSamples;
    const x = x1 + dx * t;
    const y = y1 + dy * t;

    // Clamp to bounds
    const clampedX = Math.max(0, Math.min(width - 1, x));
    const clampedY = Math.max(0, Math.min(height - 1, y));

    // Use nearest-neighbor (non-interpolated) for crisp edge detection
    const strength = getEdgeStrengthInterpolated(edgeMap, width, height, clampedX, clampedY, false);

    // Count edge hits (binary edges mean strength is either 0 or 1)
    if (strength > 0) {
      edgeHits++;
      consecutiveHits++;
      maxConsecutiveHits = Math.max(maxConsecutiveHits, consecutiveHits);
    } else {
      consecutiveHits = 0;
    }
  }

  // Score based on edge hits and consecutive runs
  // This rewards lines that follow edges continuously rather than just crossing them
  const hitRatio = edgeHits / (numSamples + 1);
  const consecutiveBonus = maxConsecutiveHits / (numSamples + 1);

  // Check if corner points themselves are on edges (bonus for precise alignment)
  const startOnEdge = getEdgeStrengthInterpolated(edgeMap, width, height,
    Math.max(0, Math.min(width - 1, x1)),
    Math.max(0, Math.min(height - 1, y1)), false) > 0 ? 0.2 : 0;

  // Weight: hit ratio (40%), consecutive runs (40%), corner on edge (20%)
  return hitRatio * 0.4 + consecutiveBonus * 0.4 + startOnEdge;
}

/**
 * Optimizes grid corners to align cell sides with edges
 *
 * @param {Object} grid - Grid object from createInitialGrid
 * @param {Float32Array} edgeMap - Edge map from edgeDetection.calculateEdgeMap
 * @param {number} width - Image width
 * @param {number} height - Image height
 * @param {Object} options - Optimization options
 * @param {number} options.searchSteps - Number of search steps per iteration
 * @param {number} options.numIterations - Number of optimization iterations
 * @param {number} options.stepSize - Size of each movement step
 * @param {number} options.edgeSharpness - Edge sharpness (0-1), higher = less damping for crisper snapping
 * @returns {Object} Optimized grid
 */
export function optimizeGridCorners(grid, edgeMap, width, height, options = {}) {
  const {
    searchSteps = 9,
    numIterations = 2,
    stepSize = 1.0,
    edgeSharpness = 0.8
  } = options;

  const { corners, cells } = grid;
  const rows = corners.length;
  const cols = corners[0].length;

  // Calculate base damping based on edge sharpness
  // Higher sharpness = less damping = corners snap more directly to edges
  // At sharpness 0: damping ranges 0.3-0.5 (conservative)
  // At sharpness 1: damping ranges 0.8-1.0 (aggressive, nearly full movement)
  const baseDamping = 0.3 + edgeSharpness * 0.5; // 0.3 to 0.8
  const dampingRange = 0.2 * (1 - edgeSharpness * 0.5); // 0.2 to 0.1

  // Optimization loop
  for (let iteration = 0; iteration < numIterations; iteration++) {
    // Process each corner (excluding border corners to keep grid connected)
    for (let row = 1; row < rows - 1; row++) {
      for (let col = 1; col < cols - 1; col++) {
        const corner = corners[row][col];
        let bestX = corner.x;
        let bestY = corner.y;

        // Evaluate current alignment by checking all edges connected to this corner
        let bestAlignment = 0;
        const connectedEdges = [];

        // Find all edges connected to this corner
        if (row > 0) {
          connectedEdges.push(corners[row - 1][col]); // Top
        }
        if (row < rows - 1) {
          connectedEdges.push(corners[row + 1][col]); // Bottom
        }
        if (col > 0) {
          connectedEdges.push(corners[row][col - 1]); // Left
        }
        if (col < cols - 1) {
          connectedEdges.push(corners[row][col + 1]); // Right
        }

        // Calculate current alignment score
        for (const neighbor of connectedEdges) {
          bestAlignment += evaluateEdgeAlignment(
            edgeMap, width, height,
            corner.x, corner.y,
            neighbor.x, neighbor.y
          );
        }

        // Search in a grid pattern around the corner
        // searchSteps likely represents a grid (e.g., 9 = 3x3, 25 = 5x5)
        const gridSize = Math.floor(Math.sqrt(searchSteps));
        const halfGrid = Math.floor(gridSize / 2);

        for (let dy = -halfGrid; dy <= halfGrid; dy++) {
          for (let dx = -halfGrid; dx <= halfGrid; dx++) {
            const testX = corner.x + dx * stepSize;
            const testY = corner.y + dy * stepSize;

            // Keep corners within bounds
            if (testX < 0 || testX >= width || testY < 0 || testY >= height) {
              continue;
            }

            // Evaluate alignment of all edges connected to this test position
            let alignment = 0;
            for (const neighbor of connectedEdges) {
              alignment += evaluateEdgeAlignment(
                edgeMap, width, height,
                testX, testY,
                neighbor.x, neighbor.y
              );
            }

            // Prefer positions with better edge alignment
            if (alignment > bestAlignment) {
              bestAlignment = alignment;
              bestX = testX;
              bestY = testY;
            }
          }
        }

        // Update corner position with sharpness-aware damping
        // More aggressive early iterations, slightly more conservative later
        const iterationProgress = iteration / Math.max(1, numIterations - 1);
        const damping = baseDamping + dampingRange * (1 - iterationProgress);
        const deltaX = bestX - corner.x;
        const deltaY = bestY - corner.y;
        corner.x += deltaX * damping;
        corner.y += deltaY * damping;
      }
    }
  }

  return grid;
}

/**
 * Renders the optimized grid to a canvas with sharp boundaries
 * Uses optimized spatial hash for fast pixel-to-cell mapping
 *
 * @param {Object} grid - Optimized grid
 * @param {ImageData} imageData - Source image data
 * @param {Float32Array} edgeMap - Optional edge map (unused, kept for API compatibility)
 * @param {number} edgeSharpness - Edge sharpness (0-1), smoothly blends between average and median colors
 * @returns {ImageData} Rendered pixelated image
 */
export function renderGrid(grid, imageData, edgeMap = null, edgeSharpness = 0.8) {
  const { width, height } = imageData;
  const output = new ImageData(width, height);
  const outputData = output.data;

  // Pre-calculate colors for all cells
  // Uses smooth blending between average (soft) and median (crisp) based on sharpness
  const cellColors = [];
  for (let i = 0; i < grid.cells.length; i++) {
    cellColors.push(grid.cells[i].getBlendedColor(imageData, edgeSharpness));
  }

  // Build spatial hash for fast cell lookup
  const cellBounds = grid.cells.map(cell => cell.getBounds());
  const bucketSize = 32; // Smaller buckets for better precision
  const bucketsX = Math.ceil(width / bucketSize);
  const bucketsY = Math.ceil(height / bucketSize);
  const spatialHash = Array(bucketsY * bucketsX).fill(null).map(() => []);

  // Assign cells to spatial buckets
  for (let i = 0; i < grid.cells.length; i++) {
    const bounds = cellBounds[i];
    const minBucketX = Math.max(0, Math.floor(bounds.minX / bucketSize));
    const maxBucketX = Math.min(bucketsX - 1, Math.floor(bounds.maxX / bucketSize));
    const minBucketY = Math.max(0, Math.floor(bounds.minY / bucketSize));
    const maxBucketY = Math.min(bucketsY - 1, Math.floor(bounds.maxY / bucketSize));

    for (let by = minBucketY; by <= maxBucketY; by++) {
      for (let bx = minBucketX; bx <= maxBucketX; bx++) {
        spatialHash[by * bucketsX + bx].push(i);
      }
    }
  }

  // Pre-compute corner arrays for all cells
  const cellCorners = grid.cells.map(cell => [
    cell.corners[0], // topLeft
    cell.corners[1], // topRight
    cell.corners[2], // bottomRight
    cell.corners[3]  // bottomLeft
  ]);

  // Render using spatial hash - ensures every pixel is assigned
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const pixelIdx = y * width + x;
      const pixelCenterX = x + 0.5;
      const pixelCenterY = y + 0.5;

      // Get candidate cells from spatial hash
      const bucketX = Math.floor(x / bucketSize);
      const bucketY = Math.floor(y / bucketSize);
      const bucketIdx = bucketY * bucketsX + bucketX;
      const candidateCells = spatialHash[bucketIdx] || [];

      // Find which cell contains this pixel
      let assigned = false;
      let cellIdx = 0;

      // Check candidate cells first (most common case)
      for (const i of candidateCells) {
        if (pointInQuadrilateral(pixelCenterX, pixelCenterY, cellCorners[i])) {
          cellIdx = i;
          assigned = true;
          break;
        }
      }

      // If not found in bucket, check all cells (should be rare)
      if (!assigned) {
        for (let i = 0; i < grid.cells.length; i++) {
          if (pointInQuadrilateral(pixelCenterX, pixelCenterY, cellCorners[i])) {
            cellIdx = i;
            assigned = true;
            break;
          }
        }
      }

      // Fallback: assign to nearest cell by center distance (ensures no gaps)
      if (!assigned) {
        let minDist = Infinity;
        for (let i = 0; i < grid.cells.length; i++) {
          const bounds = cellBounds[i];
          const centerX = (bounds.minX + bounds.maxX) / 2;
          const centerY = (bounds.minY + bounds.maxY) / 2;
          const dist = Math.sqrt(
            Math.pow(x - centerX, 2) + Math.pow(y - centerY, 2)
          );
          if (dist < minDist) {
            minDist = dist;
            cellIdx = i;
          }
        }
      }

      // Set pixel color
      const color = cellColors[cellIdx];
      const idx = pixelIdx * 4;
      outputData[idx] = color.r;
      outputData[idx + 1] = color.g;
      outputData[idx + 2] = color.b;
      outputData[idx + 3] = color.a;
    }
  }

  return output;
}

