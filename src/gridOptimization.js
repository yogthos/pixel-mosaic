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
 * Evaluates a Bezier curve at parameter t.
 * Uses quadratic or cubic Bezier curves which properly interpolate endpoints.
 * This ensures cell edges meet at corners without gaps.
 *
 * @param {number} t - Parameter value (0 to 1)
 * @param {Array} controlPoints - Array of control points [{x, y}, ...]
 * @param {number} degree - Curve degree: 2 for quadratic, 3 for cubic (default: 2)
 * @returns {Object} Point on curve {x, y}
 */
function evaluateBSpline(t, controlPoints, degree = 2) {
  if (controlPoints.length < 2) {
    return { x: controlPoints[0].x, y: controlPoints[0].y };
  }

  if (controlPoints.length === 2) {
    // Linear interpolation
    return {
      x: controlPoints[0].x + (controlPoints[1].x - controlPoints[0].x) * t,
      y: controlPoints[0].y + (controlPoints[1].y - controlPoints[0].y) * t
    };
  }

  // Quadratic Bezier: P(t) = (1-t)²P0 + 2t(1-t)P1 + t²P2
  // This interpolates endpoints: P(0)=P0, P(1)=P2
  if (degree === 2 && controlPoints.length >= 3) {
    const p0 = controlPoints[0];
    const p1 = controlPoints[1];
    const p2 = controlPoints[2];

    const oneMinusT = 1 - t;
    const oneMinusT2 = oneMinusT * oneMinusT;
    const t2 = t * t;

    // Quadratic Bezier basis functions
    const b0 = oneMinusT2;
    const b1 = 2 * t * oneMinusT;
    const b2 = t2;

    return {
      x: b0 * p0.x + b1 * p1.x + b2 * p2.x,
      y: b0 * p0.y + b1 * p1.y + b2 * p2.y
    };
  }

  // Cubic Bezier: P(t) = (1-t)³P0 + 3t(1-t)²P1 + 3t²(1-t)P2 + t³P3
  // This interpolates endpoints: P(0)=P0, P(1)=P3
  if (degree === 3 && controlPoints.length >= 4) {
    const p0 = controlPoints[0];
    const p1 = controlPoints[1];
    const p2 = controlPoints[2];
    const p3 = controlPoints[3];

    const oneMinusT = 1 - t;
    const oneMinusT2 = oneMinusT * oneMinusT;
    const oneMinusT3 = oneMinusT2 * oneMinusT;
    const t2 = t * t;
    const t3 = t2 * t;

    // Cubic Bezier basis functions
    const b0 = oneMinusT3;
    const b1 = 3 * t * oneMinusT2;
    const b2 = 3 * t2 * oneMinusT;
    const b3 = t3;

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
 * Gets control points for a Bezier edge between two corners.
 * Creates smooth curves that properly interpolate endpoints.
 *
 * The control point is calculated to be consistent between adjacent cells
 * sharing the same edge, preventing gaps and overlaps.
 *
 * @param {Object} corner1 - First corner point
 * @param {Object} corner2 - Second corner point
 * @param {Object} prevCorner - Previous corner (for curve influence)
 * @param {Object} nextCorner - Next corner (for curve influence)
 * @param {number} splineSmoothness - Smoothness factor (0-1), controls curve deviation (default: 0.3)
 * @param {number} imageWidth - Optional image width for bounds checking
 * @param {number} imageHeight - Optional image height for bounds checking
 * @returns {Array} Control points for Bezier curve [start, control, end]
 */
function getSplineControlPoints(corner1, corner2, prevCorner = null, nextCorner = null, splineSmoothness = 0.3, imageWidth = null, imageHeight = null) {
  const controlPoints = [corner1];

  const midX = (corner1.x + corner2.x) / 2;
  const midY = (corner1.y + corner2.y) / 2;

  // For zero smoothness, use straight line (midpoint as control = straight Bezier)
  if (splineSmoothness < 0.001) {
    controlPoints.push({ x: midX, y: midY });
    controlPoints.push(corner2);
    return controlPoints;
  }

  // Edge vector
  const edgeX = corner2.x - corner1.x;
  const edgeY = corner2.y - corner1.y;
  const edgeLength = Math.sqrt(edgeX * edgeX + edgeY * edgeY);

  if (edgeLength < 0.001) {
    // Degenerate edge - use midpoint
    controlPoints.push({ x: midX, y: midY });
    controlPoints.push(corner2);
    return controlPoints;
  }

  // Perpendicular unit vector - use consistent direction based on edge orientation
  // Always point "outward" in a consistent manner (positive perpendicular)
  // This ensures adjacent cells compute the same curve for shared edges
  let perpX = -edgeY / edgeLength;
  let perpY = edgeX / edgeLength;

  // Ensure consistent perpendicular direction by using a canonical orientation
  // If perpendicular points more negative than positive, flip it
  if (perpX + perpY < 0) {
    perpX = -perpX;
    perpY = -perpY;
  }

  let controlX = midX;
  let controlY = midY;

  if (prevCorner && nextCorner) {
    // Calculate how much the adjacent corners deviate from the edge line
    // This determines the curve's bulge direction and amount

    // Vector from midpoint to average of adjacent corners
    const avgAdjX = (prevCorner.x + nextCorner.x) / 2;
    const avgAdjY = (prevCorner.y + nextCorner.y) / 2;

    // Project this onto the perpendicular direction
    const toAdjX = avgAdjX - midX;
    const toAdjY = avgAdjY - midY;
    const perpProjection = toAdjX * perpX + toAdjY * perpY;

    // Apply smoothness-scaled perpendicular offset
    // Negative because we want to bulge away from adjacent corners (into the cell)
    const offset = -perpProjection * splineSmoothness * 0.4;

    // Clamp the offset to prevent excessive bulging
    const maxOffset = edgeLength * 0.2; // Max 20% of edge length
    const clampedOffset = Math.max(-maxOffset, Math.min(maxOffset, offset));

    controlX = midX + perpX * clampedOffset;
    controlY = midY + perpY * clampedOffset;
  }

  // Bounds checking if image dimensions provided
  if (imageWidth !== null && imageHeight !== null) {
    controlX = Math.max(0, Math.min(imageWidth - 1, controlX));
    controlY = Math.max(0, Math.min(imageHeight - 1, controlY));
  }

  controlPoints.push({ x: controlX, y: controlY });
  controlPoints.push(corner2);
  return controlPoints;
}

/**
 * Generates and caches a spline polygon for a cell.
 * This is computed once per cell and reused for all point-in-cell tests.
 *
 * @param {Object} cell - GridCell object
 * @param {Object} grid - Grid object
 * @param {number} splineDegree - B-spline degree (default: 2)
 * @param {number} splineSmoothness - Smoothness factor (default: 0.3)
 * @returns {Object} Cached spline data with polygon, bounds, and center
 */
function getOrCreateSplineCache(cell, grid, splineDegree = 2, splineSmoothness = 0.3) {
  // Check if cache exists and is valid
  if (cell._splineCache &&
      cell._splineCache.splineDegree === splineDegree &&
      cell._splineCache.splineSmoothness === splineSmoothness) {
    return cell._splineCache;
  }

  const corners = cell.corners;
  const polygon = [];

  // Calculate bounds while building polygon
  let minX = Infinity, maxX = -Infinity;
  let minY = Infinity, maxY = -Infinity;

  // Fast path: if smoothness is 0, just use corners (quadrilateral)
  // This is faster and avoids any curve-related artifacts
  if (splineSmoothness < 0.001) {
    for (const corner of corners) {
      polygon.push({ x: corner.x, y: corner.y });
      minX = Math.min(minX, corner.x);
      maxX = Math.max(maxX, corner.x);
      minY = Math.min(minY, corner.y);
      maxY = Math.max(maxY, corner.y);
    }

    const centerX = (corners[0].x + corners[1].x + corners[2].x + corners[3].x) / 4;
    const centerY = (corners[0].y + corners[1].y + corners[2].y + corners[3].y) / 4;
    const avgWidth = ((corners[1].x - corners[0].x) + (corners[2].x - corners[3].x)) / 2;
    const avgHeight = ((corners[3].y - corners[0].y) + (corners[2].y - corners[1].y)) / 2;
    const radius = Math.min(Math.abs(avgWidth), Math.abs(avgHeight)) / 2;

    cell._splineCache = {
      polygon,
      minX, maxX, minY, maxY,
      centerX, centerY, radius,
      splineDegree,
      splineSmoothness
    };
    return cell._splineCache;
  }

  // Get cell index once (avoid repeated indexOf)
  let cellRow = -1, cellCol = -1;
  if (grid && grid.corners && cell._gridIndex !== undefined) {
    cellRow = Math.floor(cell._gridIndex / grid.cols);
    cellCol = cell._gridIndex % grid.cols;
  } else if (grid && grid.cells) {
    const idx = grid.cells.indexOf(cell);
    if (idx >= 0) {
      cell._gridIndex = idx;
      cellRow = Math.floor(idx / grid.cols);
      cellCol = idx % grid.cols;
    }
  }

  const rows = grid && grid.corners ? grid.corners.length : 0;
  const cols = grid && grid.corners ? grid.corners[0].length : 0;

  // Use 12 samples per edge for good accuracy with reasonable performance
  const numSamples = 12;

  // Sample each edge
  for (let edge = 0; edge < 4; edge++) {
    const corner1 = corners[edge];
    const corner2 = corners[(edge + 1) % 4];

    // Get adjacent corners that influence this edge's curve
    // We use corners from the same cell that are not part of this edge
    let prevCorner = null;
    let nextCorner = null;

    if (cellRow >= 0 && cellCol >= 0) {
      // For each edge, use the opposite corners of the cell as influence
      // This creates curves that bulge inward/outward consistently
      if (edge === 0) { // Top edge (corner0 to corner1)
        // Use bottom corners for influence
        prevCorner = corners[3]; // bottomLeft
        nextCorner = corners[2]; // bottomRight
      } else if (edge === 1) { // Right edge (corner1 to corner2)
        // Use left corners for influence
        prevCorner = corners[0]; // topLeft
        nextCorner = corners[3]; // bottomLeft
      } else if (edge === 2) { // Bottom edge (corner2 to corner3)
        // Use top corners for influence
        prevCorner = corners[1]; // topRight
        nextCorner = corners[0]; // topLeft
      } else { // Left edge (corner3 to corner0)
        // Use right corners for influence
        prevCorner = corners[2]; // bottomRight
        nextCorner = corners[1]; // topRight
      }
    }

    const controlPoints = getSplineControlPoints(corner1, corner2, prevCorner, nextCorner, splineSmoothness);

    // Sample curve points (excluding last point to avoid duplicates at corners)
    for (let i = 0; i < numSamples; i++) {
      const t = i / numSamples;
      const point = evaluateBSpline(t, controlPoints, splineDegree);
      polygon.push(point);

      minX = Math.min(minX, point.x);
      maxX = Math.max(maxX, point.x);
      minY = Math.min(minY, point.y);
      maxY = Math.max(maxY, point.y);
    }
  }

  // Calculate cell center for distance approximation
  const centerX = (corners[0].x + corners[1].x + corners[2].x + corners[3].x) / 4;
  const centerY = (corners[0].y + corners[1].y + corners[2].y + corners[3].y) / 4;

  // Calculate approximate radius (half of average dimension)
  const avgWidth = ((corners[1].x - corners[0].x) + (corners[2].x - corners[3].x)) / 2;
  const avgHeight = ((corners[3].y - corners[0].y) + (corners[2].y - corners[1].y)) / 2;
  const radius = Math.min(Math.abs(avgWidth), Math.abs(avgHeight)) / 2;

  // Add margin to bounds for spline bulging
  const margin = Math.max(maxX - minX, maxY - minY) * 0.1;

  // Cache the result
  cell._splineCache = {
    polygon,
    minX: minX - margin,
    maxX: maxX + margin,
    minY: minY - margin,
    maxY: maxY + margin,
    centerX,
    centerY,
    radius,
    splineDegree,
    splineSmoothness
  };

  return cell._splineCache;
}

/**
 * Tests if a point is inside a cell bounded by B-spline edges.
 * Uses cached spline polygon for efficient repeated tests.
 *
 * @param {number} x - Point X coordinate
 * @param {number} y - Point Y coordinate
 * @param {Object} cell - GridCell object
 * @param {Object} grid - Grid object (needed for finding adjacent corners for spline control points)
 * @param {number} splineDegree - B-spline degree (default: 2)
 * @param {number} splineSmoothness - Smoothness factor for spline curves (default: 0.3)
 * @returns {boolean} True if point is inside the spline-bounded cell
 */
function pointInSplineCell(x, y, cell, grid, splineDegree = 2, splineSmoothness = 0.3) {
  // Get or create cached spline polygon
  const cache = getOrCreateSplineCache(cell, grid, splineDegree, splineSmoothness);

  // Quick bounding box rejection
  if (x < cache.minX || x > cache.maxX || y < cache.minY || y > cache.maxY) {
    return false;
  }

  // Winding number test using cached polygon
  const polygon = cache.polygon;
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
 * Fast approximate boundary distance using cached cell data.
 * Uses distance from cell center as a simple approximation.
 *
 * @param {number} x - Point X coordinate
 * @param {number} y - Point Y coordinate
 * @param {Object} cell - GridCell object with cached spline data
 * @param {Object} grid - Grid object
 * @param {number} splineDegree - B-spline degree
 * @param {number} splineSmoothness - Smoothness factor
 * @returns {number} Approximate distance to boundary (negative = deep inside)
 */
function getApproxBoundaryDistance(x, y, cell, grid, splineDegree = 2, splineSmoothness = 0.3) {
  const cache = getOrCreateSplineCache(cell, grid, splineDegree, splineSmoothness);

  // Fast approximation: distance from center minus radius
  const dx = x - cache.centerX;
  const dy = y - cache.centerY;
  const distFromCenter = Math.sqrt(dx * dx + dy * dy);

  // Return negative value (inside) that increases toward center
  // Points near boundary have values close to 0, center has most negative
  return distFromCenter - cache.radius;
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
   * For spline cells, uses cached bounds from spline polygon for efficiency
   *
   * @param {boolean} useSplines - Whether to use spline boundaries
   * @param {number} splineDegree - B-spline degree (default: 2)
   * @param {Object} grid - Grid object (needed for spline control points)
   * @param {number} splineSmoothness - Smoothness factor for spline curves (default: 0.3)
   */
  getBounds(useSplines = false, splineDegree = 2, grid = null, splineSmoothness = 0.3) {
    // For splines, use cached bounds from spline polygon
    if (useSplines && grid) {
      const cache = getOrCreateSplineCache(this, grid, splineDegree, splineSmoothness);
      return {
        minX: cache.minX,
        minY: cache.minY,
        maxX: cache.maxX,
        maxY: cache.maxY
      };
    }

    // For non-spline cells, compute bounds from corners
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
   * Uses cached spline data for efficient boundary testing
   *
   * @param {ImageData} imageData - Source image data
   * @param {boolean} useSplines - Whether to use spline boundaries
   * @param {Object} grid - Grid object (needed for spline point-in-cell test)
   * @param {number} splineDegree - B-spline degree (default: 2)
   * @param {number} splineSmoothness - Smoothness factor for spline curves (default: 0.3)
   */
  getAverageColor(imageData, useSplines = false, grid = null, splineDegree = 2, splineSmoothness = 0.3) {
    const { data, width } = imageData;
    const bounds = this.getBounds(useSplines, splineDegree, grid, splineSmoothness);

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
    const sampleStep = Math.max(1, Math.floor(Math.min(
      (maxX - minX) / 10,
      (maxY - minY) / 10,
      4
    )));

    let r = 0, g = 0, b = 0, a = 0;
    let count = 0;

    // Pre-cache spline data if using splines
    if (useSplines && grid) {
      getOrCreateSplineCache(this, grid, splineDegree, splineSmoothness);
    }

    for (let y = minY; y <= maxY; y += sampleStep) {
      for (let x = minX; x <= maxX; x += sampleStep) {
        const pixelCenterX = x + 0.5;
        const pixelCenterY = y + 0.5;

        let inside = false;

        if (useSplines && grid) {
          inside = pointInSplineCell(pixelCenterX, pixelCenterY, this, grid, splineDegree, splineSmoothness);
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
   * Uses cached spline data for efficient boundary testing
   *
   * @param {ImageData} imageData - Source image data
   * @param {number} sharpness - Blend factor (0-1)
   * @param {boolean} useSplines - Whether to use spline boundaries
   * @param {Object} grid - Grid object (needed for spline point-in-cell test)
   * @param {number} splineDegree - B-spline degree (default: 2)
   * @param {number} splineSmoothness - Smoothness factor for spline curves (default: 0.3)
   * @returns {Object} Color {r, g, b, a}
   */
  getBlendedColor(imageData, sharpness, useSplines = false, grid = null, splineDegree = 2, splineSmoothness = 0.3) {
    const { data, width } = imageData;
    const bounds = this.getBounds(useSplines, splineDegree, grid, splineSmoothness);

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

    // Sample at reasonable density for good quality without being excessive
    const sampleStep = Math.max(1, Math.floor(Math.min(
      (maxX - minX) / 12,
      (maxY - minY) / 12,
      3
    )));

    // Pre-cache spline data if using splines
    if (useSplines && grid) {
      getOrCreateSplineCache(this, grid, splineDegree, splineSmoothness);
    }

    // Collect all color samples
    const samples = [];
    let avgR = 0, avgG = 0, avgB = 0, avgA = 0;

    for (let y = minY; y <= maxY; y += sampleStep) {
      for (let x = minX; x <= maxX; x += sampleStep) {
        const pixelCenterX = x + 0.5;
        const pixelCenterY = y + 0.5;

        let inside = false;

        if (useSplines && grid) {
          inside = pointInSplineCell(pixelCenterX, pixelCenterY, this, grid, splineDegree, splineSmoothness);
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
      return this.getAverageColor(imageData, useSplines, grid, splineDegree, splineSmoothness);
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
      // Store grid index on cell to avoid expensive indexOf calls
      cell._gridIndex = row * cols + col;
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
 * @param {number} splineSmoothness - Smoothness factor (0-1) for spline curves (default: 0.3)
 * @returns {number} Alignment score (higher = better alignment)
 */
function evaluateEdgeAlignment(edgeMap, width, height, x1, y1, x2, y2, useSplines = false, prevCorner = null, nextCorner = null, splineDegree = 2, splineSmoothness = 0.3) {
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
    controlPoints = getSplineControlPoints(corner1, corner2, prevCorner, nextCorner, splineSmoothness);
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
 * @param {number} options.splineSmoothness - Smoothness factor (0-1) for spline curves (default: 0.3)
 * @returns {Object} Optimized grid
 */
export function optimizeGridCorners(grid, edgeMap, width, height, options = {}) {
  const {
    searchSteps = 9,
    numIterations = 2,
    stepSize = 1.0,
    edgeSharpness = 0.8,
    useSplines = false,
    splineDegree = 2,
    splineSmoothness = 0.3
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
            splineDegree,
            splineSmoothness
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
                splineDegree,
                splineSmoothness
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
 * Samples color from a uniform rectangular region.
 * Used to ensure sampling matches output rendering.
 *
 * @param {ImageData} imageData - Source image data
 * @param {number} startX - Left edge
 * @param {number} startY - Top edge
 * @param {number} endX - Right edge (exclusive)
 * @param {number} endY - Bottom edge (exclusive)
 * @param {number} sharpness - Blend factor (0=average, 1=median)
 * @returns {Object} Color {r, g, b, a}
 */
function sampleUniformRect(imageData, startX, startY, endX, endY, sharpness) {
  const { data, width, height } = imageData;

  startX = Math.max(0, Math.floor(startX));
  startY = Math.max(0, Math.floor(startY));
  endX = Math.min(width, Math.floor(endX));
  endY = Math.min(height, Math.floor(endY));

  if (endX <= startX || endY <= startY) {
    return { r: 128, g: 128, b: 128, a: 255 };
  }

  const rw = endX - startX;
  const rh = endY - startY;
  const step = Math.max(1, Math.floor(Math.min(rw / 6, rh / 6, 4)));

  const samples = [];
  let sumR = 0, sumG = 0, sumB = 0, sumA = 0;

  for (let y = startY; y < endY; y += step) {
    for (let x = startX; x < endX; x += step) {
      const idx = (y * width + x) * 4;
      const r = data[idx], g = data[idx + 1], b = data[idx + 2], a = data[idx + 3];
      samples.push({ r, g, b, a });
      sumR += r; sumG += g; sumB += b; sumA += a;
    }
  }

  if (samples.length === 0) {
    return { r: 128, g: 128, b: 128, a: 255 };
  }

  const n = samples.length;
  const avgR = Math.round(sumR / n);
  const avgG = Math.round(sumG / n);
  const avgB = Math.round(sumB / n);
  const avgA = Math.round(sumA / n);

  if (sharpness < 0.01) {
    return { r: avgR, g: avgG, b: avgB, a: avgA };
  }

  samples.sort((a, b) => (a.r + a.g + a.b) - (b.r + b.g + b.b));
  const mid = samples[Math.floor(n / 2)];

  const t = sharpness;
  return {
    r: Math.round(avgR * (1 - t) + mid.r * t),
    g: Math.round(avgG * (1 - t) + mid.g * t),
    b: Math.round(avgB * (1 - t) + mid.b * t),
    a: Math.round(avgA * (1 - t) + mid.a * t)
  };
}

/**
 * Renders the optimized grid to a canvas with sharp boundaries.
 *
 * CRITICAL: For clean pixel art without fuzzy edges, colors are sampled from
 * the SAME uniform rectangular regions that will be rendered. This ensures
 * perfect alignment between sampling and output.
 *
 * The grid optimization (corner movement) is used for edge detection during
 * optimization, but final rendering always uses uniform rectangular blocks.
 *
 * @param {Object} grid - Optimized grid
 * @param {ImageData} imageData - Source image data
 * @param {Float32Array} edgeMap - Optional edge map (unused)
 * @param {number} edgeSharpness - Edge sharpness (0-1)
 * @param {boolean} useSplines - Whether splines were used (doesn't affect sampling)
 * @param {number} splineDegree - Unused
 * @param {number} splineSmoothness - Unused
 * @returns {ImageData} Rendered pixelated image
 */
export function renderGrid(grid, imageData, edgeMap = null, edgeSharpness = 0.8, useSplines = false, splineDegree = 2, splineSmoothness = 0.3) {
  const { width, height } = imageData;
  const { cols, rows } = grid;

  const blockW = width / cols;
  const blockH = height / rows;

  // Sample colors from UNIFORM rectangles matching output blocks
  // This ensures sampling region = output region = no fuzzy edges
  const cellColors = [];

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const x0 = col * blockW;
      const y0 = row * blockH;
      const x1 = (col + 1) * blockW;
      const y1 = (row + 1) * blockH;

      cellColors.push(sampleUniformRect(imageData, x0, y0, x1, y1, edgeSharpness));
    }
  }

  // Render as rectangular pixels
  return renderGridAsRectangles(grid, imageData, cellColors);
}

