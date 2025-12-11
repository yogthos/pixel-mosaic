/**
 * Visualization Module
 *
 * Helper functions for rendering intermediate algorithm steps
 * as visible canvas images for debugging and educational purposes.
 */

/**
 * Converts a Float32Array edge map to a visible canvas.
 * Edge values are rendered as white on black background.
 * For binary edge maps, edges are shown as bright white.
 *
 * @param {Float32Array} edgeMap - Edge map (values 0-1)
 * @param {number} width - Image width
 * @param {number} height - Image height
 * @returns {HTMLCanvasElement} Canvas with edge visualization
 */
export function edgeMapToCanvas(edgeMap, width, height) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  const imageData = ctx.createImageData(width, height);
  const data = imageData.data;

  // Validate edge map size
  if (edgeMap.length !== width * height) {
    console.warn(`Edge map size mismatch: expected ${width * height}, got ${edgeMap.length}`);
    // Fill with error color
    for (let i = 0; i < data.length; i += 4) {
      data[i] = 255;     // R
      data[i + 1] = 0;   // G
      data[i + 2] = 0;   // B
      data[i + 3] = 255; // A
    }
    ctx.putImageData(imageData, 0, 0);
    return canvas;
  }

  // Check if edge map has any edges
  let hasEdges = false;
  let maxValue = 0;
  for (let i = 0; i < edgeMap.length; i++) {
    if (edgeMap[i] > 0) {
      hasEdges = true;
      maxValue = Math.max(maxValue, edgeMap[i]);
    }
  }

  // Render edges
  if (!hasEdges) {
    // Fill with dark gray to indicate no edges detected
    for (let i = 0; i < data.length; i += 4) {
      data[i] = 32;     // R
      data[i + 1] = 32; // G
      data[i + 2] = 32; // B
      data[i + 3] = 255; // A
    }
  } else {
    // Render edges - binary edges (0 or 1) or continuous values
    for (let i = 0; i < edgeMap.length; i++) {
      const value = edgeMap[i];
      const idx = i * 4;

      if (value > 0) {
        // Edge pixel - bright white (or scaled if continuous)
        const intensity = Math.round(value * 255);
        data[idx] = intensity;     // R
        data[idx + 1] = intensity;  // G
        data[idx + 2] = intensity; // B
      } else {
        // Non-edge pixel - black
        data[idx] = 0;       // R
        data[idx + 1] = 0;   // G
        data[idx + 2] = 0;   // B
      }
      data[idx + 3] = 255;   // A
    }
  }

  ctx.putImageData(imageData, 0, 0);
  return canvas;
}

/**
 * Creates a grayscale canvas from ImageData.
 *
 * @param {ImageData} imageData - Source image data
 * @returns {HTMLCanvasElement} Grayscale canvas
 */
export function createGrayscaleCanvas(imageData) {
  const { width, height, data } = imageData;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  const output = ctx.createImageData(width, height);
  const outputData = output.data;

  for (let i = 0; i < data.length; i += 4) {
    // Use standard luminance formula
    const gray = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
    outputData[i] = gray;
    outputData[i + 1] = gray;
    outputData[i + 2] = gray;
    outputData[i + 3] = data[i + 3];
  }

  ctx.putImageData(output, 0, 0);
  return canvas;
}

/**
 * Draws a grid overlay on top of an image canvas.
 *
 * @param {HTMLCanvasElement} imageCanvas - Base image canvas
 * @param {Object} grid - Grid object with corners array
 * @param {string} color - Line color (default: 'rgba(255, 0, 0, 0.7)')
 * @param {number} lineWidth - Line width (default: 1)
 * @returns {HTMLCanvasElement} New canvas with grid overlay
 */
export function drawGridOverlay(imageCanvas, grid, color = 'rgba(255, 0, 0, 0.7)', lineWidth = 1) {
  const canvas = document.createElement('canvas');
  canvas.width = imageCanvas.width;
  canvas.height = imageCanvas.height;
  const ctx = canvas.getContext('2d');

  // Draw the base image
  ctx.drawImage(imageCanvas, 0, 0);

  // Draw grid lines
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  const { corners } = grid;
  const rows = corners.length;
  const cols = corners[0].length;

  // Calculate grid density to decide if we should skip some lines
  const avgCellWidth = imageCanvas.width / (cols - 1);
  const avgCellHeight = imageCanvas.height / (rows - 1);
  const minCellSize = Math.min(avgCellWidth, avgCellHeight);

  // If cells are very small, only show every Nth line for clarity
  const skipFactor = minCellSize < 20 ? Math.ceil(20 / minCellSize) : 1;

  // Draw horizontal lines (connecting corners in each row)
  for (let row = 0; row < rows; row += skipFactor) {
    ctx.beginPath();
    ctx.moveTo(corners[row][0].x, corners[row][0].y);
    for (let col = 1; col < cols; col++) {
      ctx.lineTo(corners[row][col].x, corners[row][col].y);
    }
    ctx.stroke();
  }

  // Draw last row if we skipped some
  if (skipFactor > 1 && rows > 1) {
    const lastRow = rows - 1;
    ctx.beginPath();
    ctx.moveTo(corners[lastRow][0].x, corners[lastRow][0].y);
    for (let col = 1; col < cols; col++) {
      ctx.lineTo(corners[lastRow][col].x, corners[lastRow][col].y);
    }
    ctx.stroke();
  }

  // Draw vertical lines (connecting corners in each column)
  for (let col = 0; col < cols; col += skipFactor) {
    ctx.beginPath();
    ctx.moveTo(corners[0][col].x, corners[0][col].y);
    for (let row = 1; row < rows; row++) {
      ctx.lineTo(corners[row][col].x, corners[row][col].y);
    }
    ctx.stroke();
  }

  // Draw last column if we skipped some
  if (skipFactor > 1 && cols > 1) {
    const lastCol = cols - 1;
    ctx.beginPath();
    ctx.moveTo(corners[0][lastCol].x, corners[0][lastCol].y);
    for (let row = 1; row < rows; row++) {
      ctx.lineTo(corners[row][lastCol].x, corners[row][lastCol].y);
    }
    ctx.stroke();
  }

  return canvas;
}

/**
 * Creates a canvas from ImageData.
 *
 * @param {ImageData} imageData - Source image data
 * @returns {HTMLCanvasElement} Canvas with the image
 */
export function imageDataToCanvas(imageData) {
  const canvas = document.createElement('canvas');
  canvas.width = imageData.width;
  canvas.height = imageData.height;
  const ctx = canvas.getContext('2d');
  ctx.putImageData(imageData, 0, 0);
  return canvas;
}

/**
 * Creates a deep copy of a grid's corner positions.
 * Used to capture grid state before optimization.
 *
 * @param {Object} grid - Grid object with corners array
 * @returns {Object} Cloned grid with copied corner positions
 */
export function cloneGridCorners(grid) {
  const clonedCorners = grid.corners.map(row =>
    row.map(corner => ({
      x: corner.x,
      y: corner.y,
      originalX: corner.originalX,
      originalY: corner.originalY
    }))
  );

  return {
    corners: clonedCorners,
    cells: grid.cells,
    cols: grid.cols,
    rows: grid.rows
  };
}

