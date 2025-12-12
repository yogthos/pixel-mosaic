/**
 * Grid Optimization Module
 *
 * Implements an adaptive grid system where grid corners can be moved
 * to align with image edges for better pixelation results.
 */

import { getEdgeStrengthInterpolated, getEdgeDensity } from './edgeDetection.js';
// WebGL polygon renderer no longer used - now rendering rectangular pixels
// import { renderGridWebGL } from './webglGridRender.js';

/**
 * B-SPLINE UTILITIES
 */

/**
 * Evaluates a B-spline curve at parameter t.
 * Uses uniform B-splines with degree 2 (quadratic).
 *
 * @param {number} t - Parameter value (0 to 1)
 * @param {Array} controlPoints - Array of control points [{x, y}, ...]
 * @param {number} degree - B-spline degree (default: 2)
 * @returns {Object} Point on curve {x, y}
 */
function evaluateBSpline(t, controlPoints, degree = 2) {
  if (controlPoints.length < degree + 1) {
    // Not enough control points, use linear interpolation
    if (controlPoints.length === 2) {
      return {
        x: controlPoints[0].x + (controlPoints[1].x - controlPoints[0].x) * t,
        y: controlPoints[0].y + (controlPoints[1].y - controlPoints[0].y) * t
      };
    }
    // Fallback to first point
    return { x: controlPoints[0].x, y: controlPoints[0].y };
  }

  // For degree 2 (quadratic) B-splines with uniform knots
  // We use the basis functions for quadratic B-splines
  if (degree === 2) {
    // For a quadratic B-spline, we need 3 control points
    // Using the first 3 control points for simplicity
    const p0 = controlPoints[0];
    const p1 = controlPoints[1];
    const p2 = controlPoints[2];

    // Quadratic B-spline basis functions
    const t2 = t * t;
    const oneMinusT = 1 - t;
    const oneMinusT2 = oneMinusT * oneMinusT;

    const b0 = 0.5 * oneMinusT2;
    const b1 = 0.5 * (1 + 2 * t - 2 * t2);
    const b2 = 0.5 * t2;

    return {
      x: b0 * p0.x + b1 * p1.x + b2 * p2.x,
      y: b0 * p0.y + b1 * p1.y + b2 * p2.y
    };
  }

  // For degree 3 (cubic) B-splines
  if (degree === 3) {
    const p0 = controlPoints[0];
    const p1 = controlPoints[1];
    const p2 = controlPoints[2];
    const p3 = controlPoints[3];

    const t2 = t * t;
    const t3 = t2 * t;
    const oneMinusT = 1 - t;
    const oneMinusT2 = oneMinusT * oneMinusT;
    const oneMinusT3 = oneMinusT2 * oneMinusT;

    const b0 = oneMinusT3 / 6;
    const b1 = (3 * t3 - 6 * t2 + 4) / 6;
    const b2 = (-3 * t3 + 3 * t2 + 3 * t + 1) / 6;
    const b3 = t3 / 6;

    return {
      x: b0 * p0.x + b1 * p1.x + b2 * p2.x + b3 * p3.x,
      y: b0 * p0.y + b1 * p1.y + b2 * p2.y + b3 * p3.y
    };
  }

  // Fallback to linear interpolation
  return {
    x: controlPoints[0].x + (controlPoints[1].x - controlPoints[0].x) * t,
    y: controlPoints[0].y + (controlPoints[1].y - controlPoints[0].y) * t
  };
}

/**
 * Gets control points for a B-spline edge between two corners.
 * Uses the two corner points plus adjacent corners for smooth curves.
 *
 * @param {Object} corner1 - First corner point
 * @param {Object} corner2 - Second corner point
 * @param {Object} prevCorner - Previous corner (for direction)
 * @param {Object} nextCorner - Next corner (for direction)
 * @returns {Array} Control points for B-spline
 */
function getSplineControlPoints(corner1, corner2, prevCorner = null, nextCorner = null) {
  // For a simple edge, use the two corners plus a midpoint control point
  // If we have adjacent corners, use them to influence the curve direction
  const controlPoints = [corner1];

  if (prevCorner && nextCorner) {
    // Use adjacent corners to create a smooth curve
    // Add a control point that influences the curve direction
    const midX = (corner1.x + corner2.x) / 2;
    const midY = (corner1.y + corner2.y) / 2;

    // Influence from adjacent corners (weighted)
    const influence = 0.3;
    const controlX = midX + (prevCorner.x + nextCorner.x - 2 * midX) * influence;
    const controlY = midY + (prevCorner.y + nextCorner.y - 2 * midY) * influence;

    controlPoints.push({ x: controlX, y: controlY });
  } else {
    // Simple midpoint control point
    controlPoints.push({
      x: (corner1.x + corner2.x) / 2,
      y: (corner1.y + corner2.y) / 2
    });
  }

  controlPoints.push(corner2);
  return controlPoints;
}

/**
 * Tests if a point is inside a cell bounded by B-spline edges.
 * Uses simplified winding number test for better performance.
 *
 * @param {number} x - Point X coordinate
 * @param {number} y - Point Y coordinate
 * @param {Object} cell - GridCell object
 * @param {Object} grid - Grid object (unused, kept for API compatibility)
 * @param {number} splineDegree - B-spline degree (unused for simplified test)
 * @returns {boolean} True if point is inside the spline-bounded cell
 */
function pointInSplineCell(x, y, cell, grid, splineDegree = 2) {
  // For performance, use a simplified approach:
  // 1. First do a quick bounding box check
  // 2. Then use polygon approximation with minimal samples

  const corners = cell.corners;

  // Quick bounding box check
  let minX = corners[0].x, maxX = corners[0].x;
  let minY = corners[0].y, maxY = corners[0].y;
  for (let i = 1; i < 4; i++) {
    minX = Math.min(minX, corners[i].x);
    maxX = Math.max(maxX, corners[i].x);
    minY = Math.min(minY, corners[i].y);
    maxY = Math.max(maxY, corners[i].y);
  }

  // Expand bounds slightly for spline curves
  const margin = Math.max(maxX - minX, maxY - minY) * 0.1;
  if (x < minX - margin || x > maxX + margin || y < minY - margin || y > maxY + margin) {
    return false;
  }

  // Use winding number algorithm with sampled spline edges
  // Reduced samples for performance (4 samples per edge = 16 total points)
  const numSamples = 4;
  const polygon = [];

  // Sample each edge
  for (let edge = 0; edge < 4; edge++) {
    const corner1 = corners[edge];
    const corner2 = corners[(edge + 1) % 4];
    const midX = (corner1.x + corner2.x) / 2;
    const midY = (corner1.y + corner2.y) / 2;

    for (let i = 0; i < numSamples; i++) {
      const t = i / numSamples;
      // Simplified quadratic B-spline evaluation inline
      const t2 = t * t;
      const oneMinusT = 1 - t;
      const oneMinusT2 = oneMinusT * oneMinusT;
      const b0 = 0.5 * oneMinusT2;
      const b1 = 0.5 * (1 + 2 * t - 2 * t2);
      const b2 = 0.5 * t2;

      polygon.push({
        x: b0 * corner1.x + b1 * midX + b2 * corner2.x,
        y: b0 * corner1.y + b1 * midY + b2 * corner2.y
      });
    }
  }

  // Winding number test
  let winding = 0;
  const n = polygon.length;
  for (let i = 0; i < n; i++) {
    const p1 = polygon[i];
    const p2 = polygon[(i + 1) % n];

    if (p1.y <= y) {
      if (p2.y > y) {
        // Upward crossing
        const cross = (p2.x - p1.x) * (y - p1.y) - (x - p1.x) * (p2.y - p1.y);
        if (cross > 0) winding++;
      }
    } else {
      if (p2.y <= y) {
        // Downward crossing
        const cross = (p2.x - p1.x) * (y - p1.y) - (x - p1.x) * (p2.y - p1.y);
        if (cross < 0) winding--;
      }
    }
  }

  return winding !== 0;
}

/**
 * Checks if two line segments intersect.
 *
 * @param {number} x1 - First segment start X
 * @param {number} y1 - First segment start Y
 * @param {number} x2 - First segment end X
 * @param {number} y2 - First segment end Y
 * @param {number} x3 - Second segment start X
 * @param {number} y3 - Second segment start Y
 * @param {number} x4 - Second segment end X
 * @param {number} y4 - Second segment end Y
 * @returns {boolean} True if segments intersect
 */
function lineSegmentIntersect(x1, y1, x2, y2, x3, y3, x4, y4) {
  const denom = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
  if (Math.abs(denom) < 1e-10) return false; // Parallel lines

  const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / denom;
  const u = -((x1 - x2) * (y1 - y3) - (y1 - y2) * (x1 - x3)) / denom;

  return t >= 0 && t <= 1 && u >= 0 && u <= 1;
}

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
   * For spline cells, bounds may extend beyond corners due to curve bulging
   */
  getBounds(useSplines = false, splineDegree = 2) {
    let minX = Infinity, minY = Infinity;
    let maxX = -Infinity, maxY = -Infinity;

    // First, include all corner points
    for (const corner of this.corners) {
      minX = Math.min(minX, corner.x);
      minY = Math.min(minY, corner.y);
      maxX = Math.max(maxX, corner.x);
      maxY = Math.max(maxY, corner.y);
    }

    // For splines, sample the curves to find extended bounds
    if (useSplines) {
      const edges = [
        [this.corners[0], this.corners[1]], // Top edge
        [this.corners[1], this.corners[2]], // Right edge
        [this.corners[2], this.corners[3]], // Bottom edge
        [this.corners[3], this.corners[0]]  // Left edge
      ];

      for (const [corner1, corner2] of edges) {
        const controlPoints = getSplineControlPoints(corner1, corner2);
        // Sample spline curve
        for (let t = 0; t <= 1; t += 0.1) {
          const point = evaluateBSpline(t, controlPoints, splineDegree);
          minX = Math.min(minX, point.x);
          minY = Math.min(minY, point.y);
          maxX = Math.max(maxX, point.x);
          maxY = Math.max(maxY, point.y);
        }
      }
    }

    return { minX, minY, maxX, maxY };
  }

  /**
   * Calculates the average color of pixels within this cell
   * Optimized: samples pixels at regular intervals for speed
   *
   * @param {ImageData} imageData - Source image data
   * @param {boolean} useSplines - Whether to use spline boundaries
   * @param {Object} grid - Grid object (needed for spline point-in-cell test)
   * @param {number} splineDegree - B-spline degree (default: 2)
   */
  getAverageColor(imageData, useSplines = false, grid = null, splineDegree = 2) {
    const { data, width } = imageData;
    const bounds = this.getBounds(useSplines, splineDegree);

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

        let inside = false;
        if (useSplines && grid) {
          inside = pointInSplineCell(pixelCenterX, pixelCenterY, this, grid, splineDegree);
        } else {
          inside = pointInQuadrilateral(pixelCenterX, pixelCenterY, corners);
        }

        if (inside) {
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
   * @param {boolean} useSplines - Whether to use spline boundaries
   * @param {Object} grid - Grid object (needed for spline point-in-cell test)
   * @param {number} splineDegree - B-spline degree (default: 2)
   * @returns {Object} Color {r, g, b, a}
   */
  getBlendedColor(imageData, sharpness, useSplines = false, grid = null, splineDegree = 2) {
    const { data, width } = imageData;
    const bounds = this.getBounds(useSplines, splineDegree);

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

        let inside = false;
        if (useSplines && grid) {
          inside = pointInSplineCell(pixelCenterX, pixelCenterY, this, grid, splineDegree);
        } else {
          inside = pointInQuadrilateral(pixelCenterX, pixelCenterY, corners);
        }

        if (inside) {
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
      return this.getAverageColor(imageData, useSplines, grid, splineDegree);
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
 * Renders grid cell colors as rectangular pixels (not polygons).
 * This produces the classic "pixel art" look while using edge-aware colors.
 *
 * @param {Object} grid - Grid with cells, cols, rows
 * @param {ImageData} imageData - Source image data (for dimensions)
 * @param {Array} cellColors - Pre-calculated cell colors [{r,g,b,a}, ...]
 * @returns {ImageData} Rendered image with rectangular pixels
 */
export function renderGridAsRectangles(grid, imageData, cellColors) {
  const { width, height } = imageData;
  const { cols, rows } = grid;

  const output = new ImageData(width, height);
  const outputData = output.data;

  // Calculate pixel block size
  const blockWidth = width / cols;
  const blockHeight = height / rows;

  // Fill each rectangular block with its cell's color
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const cellIdx = row * cols + col;
      const color = cellColors[cellIdx];

      // Calculate block bounds
      const startX = Math.floor(col * blockWidth);
      const endX = Math.floor((col + 1) * blockWidth);
      const startY = Math.floor(row * blockHeight);
      const endY = Math.floor((row + 1) * blockHeight);

      // Fill the block
      for (let y = startY; y < endY && y < height; y++) {
        for (let x = startX; x < endX && x < width; x++) {
          const idx = (y * width + x) * 4;
          outputData[idx] = color.r;
          outputData[idx + 1] = color.g;
          outputData[idx + 2] = color.b;
          outputData[idx + 3] = 255;
        }
      }
    }
  }

  return output;
}

/**
 * Evaluates how well a grid edge (line or spline between two corners) aligns with image edges.
 * Uses nearest-neighbor sampling by default for crisp edge detection.
 *
 * @param {Float32Array} edgeMap - Edge map
 * @param {number} width - Image width
 * @param {number} height - Image height
 * @param {number} x1 - Start X coordinate
 * @param {number} y1 - Start Y coordinate
 * @param {number} x2 - End X coordinate
 * @param {number} y2 - End Y coordinate
 * @param {boolean} useSplines - Whether to sample along B-spline curve
 * @param {Object} prevCorner - Previous corner (for spline control points)
 * @param {Object} nextCorner - Next corner (for spline control points)
 * @param {number} splineDegree - B-spline degree (default: 2)
 * @returns {number} Alignment score (higher = better alignment)
 */
function evaluateEdgeAlignment(edgeMap, width, height, x1, y1, x2, y2, useSplines = false, prevCorner = null, nextCorner = null, splineDegree = 2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const length = Math.sqrt(dx * dx + dy * dy);

  if (length < 1) return 0;

  // Sample points along the edge - use more samples for better precision
  const numSamples = Math.max(3, Math.ceil(length * 1.5));
  let edgeHits = 0;
  let consecutiveHits = 0;
  let maxConsecutiveHits = 0;

  // Get control points for spline if needed
  let controlPoints = null;
  if (useSplines) {
    const corner1 = { x: x1, y: y1 };
    const corner2 = { x: x2, y: y2 };
    controlPoints = getSplineControlPoints(corner1, corner2, prevCorner, nextCorner);
  }

  for (let i = 0; i <= numSamples; i++) {
    const t = i / numSamples;
    let x, y;

    if (useSplines && controlPoints) {
      // Sample along B-spline curve
      const point = evaluateBSpline(t, controlPoints, splineDegree);
      x = point.x;
      y = point.y;
    } else {
      // Sample along straight line
      x = x1 + dx * t;
      y = y1 + dy * t;
    }

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
 * Evaluates edge density in a small region around a point.
 * Higher density = more edges nearby = better position for a corner.
 *
 * @param {Float32Array} edgeMap - Edge map
 * @param {number} width - Image width
 * @param {number} height - Image height
 * @param {number} x - X coordinate
 * @param {number} y - Y coordinate
 * @param {number} radius - Search radius in pixels
 * @returns {number} Edge density score (0-1)
 */
function evaluateEdgeDensity(edgeMap, width, height, x, y, radius = 3) {
  let edgeCount = 0;
  let totalSamples = 0;

  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      const px = Math.floor(x + dx);
      const py = Math.floor(y + dy);

      if (px >= 0 && px < width && py >= 0 && py < height) {
        totalSamples++;
        const idx = py * width + px;
        if (edgeMap[idx] > 0) {
          edgeCount++;
        }
      }
    }
  }

  return totalSamples > 0 ? edgeCount / totalSamples : 0;
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
 * @param {boolean} options.useSplines - Whether to use B-spline curves for edge alignment (default: false)
 * @param {number} options.splineDegree - B-spline degree (default: 2)
 * @returns {Object} Optimized grid
 */
export function optimizeGridCorners(grid, edgeMap, width, height, options = {}) {
  const {
    searchSteps = 9,
    numIterations = 2,
    stepSize = 1.0,
    edgeSharpness = 0.8,
    useSplines = false,
    splineDegree = 2
  } = options;

  // Validate edge map
  if (!edgeMap || edgeMap.length !== width * height) {
    console.warn('Invalid edge map for grid optimization');
    return grid;
  }

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

        // Find all edges connected to this corner
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

        // Calculate current alignment score (edge alignment + edge density)
        let bestAlignment = evaluateEdgeDensity(edgeMap, width, height, corner.x, corner.y, Math.ceil(stepSize));
        for (const neighbor of connectedEdges) {
          // Find adjacent corners for spline control points
          let prevCorner = null;
          let nextCorner = null;
          if (useSplines) {
            // Find the direction of the edge to get appropriate adjacent corners
            // For a horizontal edge, use vertical neighbors; for vertical, use horizontal
            const dx = neighbor.x - corner.x;
            const dy = neighbor.y - corner.y;

            // Determine if edge is more horizontal or vertical
            if (Math.abs(dx) > Math.abs(dy)) {
              // Horizontal edge - use vertical neighbors
              if (row > 0) prevCorner = corners[row - 1][col];
              if (row < rows - 1) nextCorner = corners[row + 1][col];
            } else {
              // Vertical edge - use horizontal neighbors
              if (col > 0) prevCorner = corners[row][col - 1];
              if (col < cols - 1) nextCorner = corners[row][col + 1];
            }
          }
          bestAlignment += evaluateEdgeAlignment(
            edgeMap, width, height,
            corner.x, corner.y,
            neighbor.x, neighbor.y,
            useSplines,
            prevCorner,
            nextCorner,
            splineDegree
          );
        }

        // Search in a grid pattern around the corner
        // searchSteps likely represents a grid (e.g., 9 = 3x3, 25 = 5x5)
        const gridSize = Math.floor(Math.sqrt(searchSteps));
        const halfGrid = Math.floor(gridSize / 2);

        for (let dy = -halfGrid; dy <= halfGrid; dy++) {
          for (let dx = -halfGrid; dx <= halfGrid; dx++) {
            if (dx === 0 && dy === 0) continue; // Skip current position

            const testX = corner.x + dx * stepSize;
            const testY = corner.y + dy * stepSize;

            // Keep corners within bounds
            if (testX < 0 || testX >= width || testY < 0 || testY >= height) {
              continue;
            }

            // Evaluate alignment of all edges connected to this test position
            // Include edge density to attract corners toward edges
            let alignment = evaluateEdgeDensity(edgeMap, width, height, testX, testY, Math.ceil(stepSize));
            for (const neighbor of connectedEdges) {
              // Find adjacent corners for spline control points
              let prevCorner = null;
              let nextCorner = null;
              if (useSplines) {
                // Find the direction of the edge to get appropriate adjacent corners
                const dx = neighbor.x - testX;
                const dy = neighbor.y - testY;

                // Determine if edge is more horizontal or vertical
                if (Math.abs(dx) > Math.abs(dy)) {
                  // Horizontal edge - use vertical neighbors
                  if (row > 0) prevCorner = corners[row - 1][col];
                  if (row < rows - 1) nextCorner = corners[row + 1][col];
                } else {
                  // Vertical edge - use horizontal neighbors
                  if (col > 0) prevCorner = corners[row][col - 1];
                  if (col < cols - 1) nextCorner = corners[row][col + 1];
                }
              }
              alignment += evaluateEdgeAlignment(
                edgeMap, width, height,
                testX, testY,
                neighbor.x, neighbor.y,
                useSplines,
                prevCorner,
                nextCorner,
                splineDegree
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
 * @param {boolean} useSplines - Whether to use B-spline curves for cell boundaries (default: false)
 * @param {number} splineDegree - B-spline degree (default: 2)
 * @returns {ImageData} Rendered pixelated image
 */
export function renderGrid(grid, imageData, edgeMap = null, edgeSharpness = 0.8, useSplines = false, splineDegree = 2) {
  const { width, height } = imageData;

  // Pre-calculate colors for all cells
  // Uses smooth blending between average (soft) and median (crisp) based on sharpness
  const cellColors = [];
  for (let i = 0; i < grid.cells.length; i++) {
    cellColors.push(grid.cells[i].getBlendedColor(imageData, edgeSharpness, useSplines, grid, splineDegree));
  }

  // Render as rectangular pixels (classic pixel art look)
  // The edge-aware grid optimization determines the colors, but output is rectangular
  return renderGridAsRectangles(grid, imageData, cellColors);
}

