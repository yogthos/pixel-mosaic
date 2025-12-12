/**
 * WebGL-based Grid Rendering with B-Spline Support
 *
 * Uses GPU acceleration for rendering optimized grids with B-spline boundaries.
 */

/**
 * Creates a WebGL context for grid rendering
 */
function createGridRenderContext(canvas) {
  const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
  if (!gl) {
    console.warn('WebGL grid renderer: WebGL context not available');
    return null;
  }

  // Get renderer info (use standard RENDERER parameter, WEBGL_debug_renderer_info is deprecated)
  // Note: Renderer info available via gl.getParameter(gl.RENDERER) if needed

  // Vertex shader - simple pass-through
  const vertexShaderSource = `
    attribute vec2 a_position;
    attribute vec2 a_texCoord;
    varying vec2 v_texCoord;

    void main() {
      gl_Position = vec4(a_position, 0.0, 1.0);
      v_texCoord = a_texCoord;
    }
  `;

  // Fragment shader for B-spline grid rendering
  // Note: WebGL doesn't support variable-length loops well, so we use a fixed maximum
  const fragmentShaderSource = `
    precision mediump float;
    uniform sampler2D u_image;
    uniform sampler2D u_cellData;
    uniform sampler2D u_cellColors;
    uniform vec2 u_imageSize;
    uniform float u_numCells;
    uniform float u_splineDegree;
    uniform float u_useSplines;

    varying vec2 v_texCoord;

    // Cross product helper for edge test
    float edgeCross(vec2 edgeStart, vec2 edgeEnd, vec2 point) {
      vec2 edge = edgeEnd - edgeStart;
      vec2 toPoint = point - edgeStart;
      return edge.x * toPoint.y - edge.y * toPoint.x;
    }

    // Check if point is inside a quadrilateral (polygon mode)
    // Fully unrolled to avoid array indexing (required for GLSL ES 1.0 on some GPUs)
    bool pointInQuadrilateral(vec2 point, vec2 c0, vec2 c1, vec2 c2, vec2 c3) {
      // Cross product test for each edge - all must have same sign
      float cross0 = edgeCross(c0, c1, point);
      float cross1 = edgeCross(c1, c2, point);
      float cross2 = edgeCross(c2, c3, point);
      float cross3 = edgeCross(c3, c0, point);

      // All positive or all negative means inside
      bool allPositive = cross0 >= 0.0 && cross1 >= 0.0 && cross2 >= 0.0 && cross3 >= 0.0;
      bool allNegative = cross0 <= 0.0 && cross1 <= 0.0 && cross2 <= 0.0 && cross3 <= 0.0;

      return allPositive || allNegative;
    }

    // Simplified spline test - for WebGL we just use the quadrilateral test
    // B-splines with degree 2 stay very close to control polygon
    // The slight deviation is acceptable for visual quality and avoids overlap issues
    bool pointInSplineCellApprox(vec2 point, vec2 c0, vec2 c1, vec2 c2, vec2 c3, float degree) {
      return pointInQuadrilateral(point, c0, c1, c2, c3);
    }

    void main() {
      // Map screen position to image pixel coordinates
      // v_texCoord: (0,0) = bottom-left screen, (1,1) = top-right screen
      // Image coords: (0,0) = top-left, (width-1,height-1) = bottom-right
      //
      // WITHOUT FLIP_Y:
      // - texCoord.y=0 (screen bottom) samples image TOP (row 0)
      // - texCoord.y=1 (screen top) samples image BOTTOM (row height-1)
      // - Image appears UPSIDE DOWN on screen, but cell matching is direct:
      // - imageY = texCoord.y * height
      float imageY = v_texCoord.y * u_imageSize.y;
      float imageX = v_texCoord.x * u_imageSize.x;
      vec2 pixelCenter = vec2(imageX, imageY);

      // Sample source image (will be upside down but coordinates match)
      vec4 sourceColor = texture2D(u_image, v_texCoord);

      // Find which cell contains this pixel
      float cellIdx = -1.0;

      // Test cells (limited to reasonable number for performance)
      // Note: WebGL doesn't support break, so we test all cells but only take first match
      // Use compile-time constant for loop bound (WebGL requires constant expressions)
      float texWidth = u_numCells * 4.0;
      for (int i = 0; i < 2048; i++) {
        // Only test if we haven't found a cell yet and i is within bounds
        if (cellIdx < 0.0 && float(i) < u_numCells) {
          // Read cell corners from texture (unrolled to avoid variable array indexing)
          float cellBase = float(i) * 4.0;

          vec4 cd0 = texture2D(u_cellData, vec2((cellBase + 0.5) / texWidth, 0.5));
          vec4 cd1 = texture2D(u_cellData, vec2((cellBase + 1.5) / texWidth, 0.5));
          vec4 cd2 = texture2D(u_cellData, vec2((cellBase + 2.5) / texWidth, 0.5));
          vec4 cd3 = texture2D(u_cellData, vec2((cellBase + 3.5) / texWidth, 0.5));

          // Decode 16-bit coordinates from RGBA (RG=X high/low, BA=Y high/low)
          // Texture values are 0-1, multiply by 255 to get byte values
          vec2 c0 = vec2(
            (cd0.r * 255.0 * 256.0 + cd0.g * 255.0) / 65535.0 * u_imageSize.x,
            (cd0.b * 255.0 * 256.0 + cd0.a * 255.0) / 65535.0 * u_imageSize.y
          );
          vec2 c1 = vec2(
            (cd1.r * 255.0 * 256.0 + cd1.g * 255.0) / 65535.0 * u_imageSize.x,
            (cd1.b * 255.0 * 256.0 + cd1.a * 255.0) / 65535.0 * u_imageSize.y
          );
          vec2 c2 = vec2(
            (cd2.r * 255.0 * 256.0 + cd2.g * 255.0) / 65535.0 * u_imageSize.x,
            (cd2.b * 255.0 * 256.0 + cd2.a * 255.0) / 65535.0 * u_imageSize.y
          );
          vec2 c3 = vec2(
            (cd3.r * 255.0 * 256.0 + cd3.g * 255.0) / 65535.0 * u_imageSize.x,
            (cd3.b * 255.0 * 256.0 + cd3.a * 255.0) / 65535.0 * u_imageSize.y
          );

          bool inside = false;
          if (u_useSplines > 0.5) {
            inside = pointInSplineCellApprox(pixelCenter, c0, c1, c2, c3, u_splineDegree);
          } else {
            inside = pointInQuadrilateral(pixelCenter, c0, c1, c2, c3);
          }

          if (inside) {
            cellIdx = float(i);
          }
        }
      }

      // Get cell color
      if (cellIdx >= 0.0) {
        float colorTexCoord = (cellIdx + 0.5) / u_numCells;
        vec4 cellColor = texture2D(u_cellColors, vec2(colorTexCoord, 0.5));
        gl_FragColor = vec4(cellColor.rgb, 1.0);  // Full alpha for matched cells
      } else {
        // No cell matched - output transparent for batch compositing
        gl_FragColor = vec4(0.0, 0.0, 0.0, 0.0);
      }
    }
  `;

  function createShader(gl, type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      console.error('Shader compile error:', gl.getShaderInfoLog(shader));
      gl.deleteShader(shader);
      return null;
    }
    return shader;
  }

  function createProgram(gl, vertexShader, fragmentShader) {
    const program = gl.createProgram();
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.error('Program link error:', gl.getProgramInfoLog(program));
      gl.deleteProgram(program);
      return null;
    }
    return program;
  }

  const vertexShader = createShader(gl, gl.VERTEX_SHADER, vertexShaderSource);
  const fragmentShader = createShader(gl, gl.FRAGMENT_SHADER, fragmentShaderSource);
  if (!vertexShader || !fragmentShader) {
    console.error('WebGL grid renderer: Failed to compile shaders');
    if (vertexShader) gl.deleteShader(vertexShader);
    if (fragmentShader) gl.deleteShader(fragmentShader);
    return null;
  }

  const program = createProgram(gl, vertexShader, fragmentShader);
  if (!program) {
    console.error('WebGL grid renderer: Failed to link program');
    gl.deleteShader(vertexShader);
    gl.deleteShader(fragmentShader);
    return null;
  }

  // Create quad geometry
  const positionBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
    -1, -1,
     1, -1,
    -1,  1,
    -1,  1,
     1, -1,
     1,  1,
  ]), gl.STATIC_DRAW);

  const texCoordBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, texCoordBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
    0, 0,
    1, 0,
    0, 1,
    0, 1,
    1, 0,
    1, 1,
  ]), gl.STATIC_DRAW);

  return { gl, program, positionBuffer, texCoordBuffer };
}

/**
 * Creates a texture from cell corner data
 * Uses 16-bit precision per coordinate for better accuracy
 * Stores X in RG channels (high/low byte) and Y in BA channels (high/low byte)
 */
function createCellDataTexture(gl, grid, imageWidth, imageHeight) {
  const numCells = grid.cells.length;
  // Each cell has 4 corners, each corner uses RGBA for 16-bit X and 16-bit Y
  const data = new Uint8Array(numCells * 4 * 4); // RGBA per corner, 4 corners per cell

  for (let i = 0; i < numCells; i++) {
    const cell = grid.cells[i];
    const baseIdx = i * 16; // 4 corners * 4 components

    for (let c = 0; c < 4; c++) {
      const corner = cell.corners[c];
      const idx = baseIdx + c * 4;

      // Store coordinates as 16-bit values (0-65535 range) split into high/low bytes
      // This gives much better precision than 8-bit
      const xVal = Math.max(0, Math.min(65535, Math.floor((corner.x / imageWidth) * 65535)));
      const yVal = Math.max(0, Math.min(65535, Math.floor((corner.y / imageHeight) * 65535)));

      data[idx] = (xVal >> 8) & 0xFF;     // X high byte
      data[idx + 1] = xVal & 0xFF;         // X low byte
      data[idx + 2] = (yVal >> 8) & 0xFF;  // Y high byte
      data[idx + 3] = yVal & 0xFF;         // Y low byte
    }
  }

  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, numCells * 4, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);

  return texture;
}

/**
 * Creates a texture from cell colors
 */
function createCellColorTexture(gl, cellColors) {
  const numCells = cellColors.length;
  const data = new Uint8Array(numCells * 4); // RGBA per cell

  for (let i = 0; i < numCells; i++) {
    const color = cellColors[i];
    data[i * 4] = color.r;
    data[i * 4 + 1] = color.g;
    data[i * 4 + 2] = color.b;
    data[i * 4 + 3] = color.a;
  }

  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, numCells, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);

  return texture;
}

/**
 * Creates a texture from ImageData
 */
function createImageTexture(gl, imageData) {
  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  // NO Y flip - handle all coordinate transformations consistently
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, imageData);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);

  return texture;
}

/**
 * Build spatial index of cells by their bounding boxes
 */
function buildCellSpatialIndex(grid, width, height, tileSize) {
  const tilesX = Math.ceil(width / tileSize);
  const tilesY = Math.ceil(height / tileSize);
  const tiles = Array(tilesX * tilesY).fill(null).map(() => []);

  for (let i = 0; i < grid.cells.length; i++) {
    const cell = grid.cells[i];
    const corners = cell.corners;

    // Get bounding box with margin for splines
    let minX = corners[0].x, maxX = corners[0].x;
    let minY = corners[0].y, maxY = corners[0].y;
    for (let c = 1; c < 4; c++) {
      minX = Math.min(minX, corners[c].x);
      maxX = Math.max(maxX, corners[c].x);
      minY = Math.min(minY, corners[c].y);
      maxY = Math.max(maxY, corners[c].y);
    }

    // Add margin for spline curves
    const margin = Math.max(maxX - minX, maxY - minY) * 0.15;
    minX -= margin;
    maxX += margin;
    minY -= margin;
    maxY += margin;

    // Find all tiles this cell overlaps
    const startTileX = Math.max(0, Math.floor(minX / tileSize));
    const endTileX = Math.min(tilesX - 1, Math.floor(maxX / tileSize));
    const startTileY = Math.max(0, Math.floor(minY / tileSize));
    const endTileY = Math.min(tilesY - 1, Math.floor(maxY / tileSize));

    for (let ty = startTileY; ty <= endTileY; ty++) {
      for (let tx = startTileX; tx <= endTileX; tx++) {
        tiles[ty * tilesX + tx].push(i);
      }
    }
  }

  return { tiles, tilesX, tilesY, tileSize };
}

/**
 * Render a single batch of cells
 */
function renderBatch(gl, program, grid, cellColors, cellIndices, width, height, useSplines, splineDegree) {
  const numCells = cellIndices.length;
  if (numCells === 0) return null;

  // Create subset grid and colors for this batch
  const batchCells = cellIndices.map(i => grid.cells[i]);
  const batchColors = cellIndices.map(i => cellColors[i]);
  const batchGrid = { cells: batchCells, corners: grid.corners };

  // Create textures for this batch
  const cellDataTexture = createCellDataTexture(gl, batchGrid, width, height);
  const cellColorTexture = createCellColorTexture(gl, batchColors);

  if (!cellDataTexture || !cellColorTexture) {
    if (cellDataTexture) gl.deleteTexture(cellDataTexture);
    if (cellColorTexture) gl.deleteTexture(cellColorTexture);
    return null;
  }

  // Bind batch textures
  gl.activeTexture(gl.TEXTURE1);
  gl.bindTexture(gl.TEXTURE_2D, cellDataTexture);

  gl.activeTexture(gl.TEXTURE2);
  gl.bindTexture(gl.TEXTURE_2D, cellColorTexture);

  // Update uniforms
  gl.uniform1f(gl.getUniformLocation(program, 'u_numCells'), numCells);

  // Draw
  gl.drawArrays(gl.TRIANGLES, 0, 6);

  // Cleanup batch textures
  gl.deleteTexture(cellDataTexture);
  gl.deleteTexture(cellColorTexture);

  return true;
}

/**
 * Renders grid using WebGL (GPU-accelerated) with batching for large grids
 *
 * @param {Object} grid - Optimized grid
 * @param {ImageData} imageData - Source image data
 * @param {Array} cellColors - Pre-calculated cell colors
 * @param {boolean} useSplines - Whether to use B-spline curves
 * @param {number} splineDegree - B-spline degree
 * @returns {ImageData|null} Rendered image data, or null if WebGL unavailable
 */
export function renderGridWebGL(grid, imageData, cellColors, useSplines = false, splineDegree = 2) {
  const { width, height } = imageData;
  const numCells = grid.cells.length;
  const BATCH_SIZE = 1024; // Max cells per WebGL batch

  // DEBUG: Log cell distribution to diagnose coordinate issues
  let minY = Infinity, maxY = -Infinity, minX = Infinity, maxX = -Infinity;
  for (let i = 0; i < Math.min(numCells, 100); i++) {
    const cell = grid.cells[i];
    for (const corner of cell.corners) {
      minX = Math.min(minX, corner.x);
      maxX = Math.max(maxX, corner.x);
      minY = Math.min(minY, corner.y);
      maxY = Math.max(maxY, corner.y);
    }
  }

  // Create offscreen canvas for WebGL
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const webgl = createGridRenderContext(canvas);
  if (!webgl) {
    console.warn('WebGL grid renderer: Failed to create WebGL context');
    return null;
  }

  const { gl, program, positionBuffer, texCoordBuffer } = webgl;

  // Create image texture (shared across all batches)
  let imageTexture;
  try {
    imageTexture = createImageTexture(gl, imageData);
    if (!imageTexture) {
      console.error('WebGL grid renderer: Failed to create image texture');
      return null;
    }
  } catch (error) {
    console.error('WebGL grid renderer: Error creating image texture:', error);
    return null;
  }

  // Setup WebGL state
  gl.viewport(0, 0, width, height);
  gl.useProgram(program);

  // Bind attributes
  const positionLocation = gl.getAttribLocation(program, 'a_position');
  const texCoordLocation = gl.getAttribLocation(program, 'a_texCoord');

  gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
  gl.enableVertexAttribArray(positionLocation);
  gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);

  gl.bindBuffer(gl.ARRAY_BUFFER, texCoordBuffer);
  gl.enableVertexAttribArray(texCoordLocation);
  gl.vertexAttribPointer(texCoordLocation, 2, gl.FLOAT, false, 0, 0);

  // Bind image texture (shared)
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, imageTexture);
  gl.uniform1i(gl.getUniformLocation(program, 'u_image'), 0);
  gl.uniform1i(gl.getUniformLocation(program, 'u_cellData'), 1);
  gl.uniform1i(gl.getUniformLocation(program, 'u_cellColors'), 2);

  // Set constant uniforms
  gl.uniform2f(gl.getUniformLocation(program, 'u_imageSize'), width, height);
  gl.uniform1f(gl.getUniformLocation(program, 'u_splineDegree'), splineDegree);
  gl.uniform1f(gl.getUniformLocation(program, 'u_useSplines'), useSplines ? 1.0 : 0.0);

  // Create output texture and framebuffer
  const outputTexture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, outputTexture);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);

  const framebuffer = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, outputTexture, 0);

  const fbStatus = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
  if (fbStatus !== gl.FRAMEBUFFER_COMPLETE) {
    console.error('WebGL grid renderer: Framebuffer incomplete');
    gl.deleteTexture(imageTexture);
    gl.deleteTexture(outputTexture);
    gl.deleteFramebuffer(framebuffer);
    return null;
  }

  // Enable blending to composite batches
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

  // Clear to transparent
  gl.clearColor(0, 0, 0, 0);
  gl.clear(gl.COLOR_BUFFER_BIT);

  // Re-bind imageTexture to TEXTURE0 (got unbound when creating outputTexture)
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, imageTexture);

  // Log overall cell distribution before batching
  if (numCells > 0) {
    let minY = Infinity, maxY = -Infinity;
    let minX = Infinity, maxX = -Infinity;
    for (const cell of grid.cells) {
      for (const corner of cell.corners) {
        minX = Math.min(minX, corner.x);
        maxX = Math.max(maxX, corner.x);
        minY = Math.min(minY, corner.y);
        maxY = Math.max(maxY, corner.y);
      }
    }
  }

  // Process cells in batches
  if (numCells <= BATCH_SIZE) {
    // Single batch - direct render
    const cellDataTexture = createCellDataTexture(gl, grid, width, height);
    const cellColorTexture = createCellColorTexture(gl, cellColors);

    if (!cellDataTexture || !cellColorTexture) {
      console.error('WebGL grid renderer: Failed to create textures');
      gl.deleteTexture(imageTexture);
      gl.deleteTexture(outputTexture);
      gl.deleteFramebuffer(framebuffer);
      if (cellDataTexture) gl.deleteTexture(cellDataTexture);
      if (cellColorTexture) gl.deleteTexture(cellColorTexture);
      return null;
    }

    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, cellDataTexture);
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, cellColorTexture);
    gl.uniform1f(gl.getUniformLocation(program, 'u_numCells'), numCells);

    gl.drawArrays(gl.TRIANGLES, 0, 6);

    gl.deleteTexture(cellDataTexture);
    gl.deleteTexture(cellColorTexture);
  } else {
    // Multi-batch rendering - process all cells in order (simpler than spatial batching)
    for (let start = 0; start < numCells; start += BATCH_SIZE) {
      const end = Math.min(start + BATCH_SIZE, numCells);
      const batchCells = [];
      for (let i = start; i < end; i++) {
        batchCells.push(i);
      }

      renderBatch(gl, program, grid, cellColors, batchCells, width, height, useSplines, splineDegree);
    }
  }

  // Check for WebGL errors
  let error = gl.getError();
  if (error !== gl.NO_ERROR) {
    const errorMessages = {
      [gl.INVALID_ENUM]: 'INVALID_ENUM',
      [gl.INVALID_VALUE]: 'INVALID_VALUE',
      [gl.INVALID_OPERATION]: 'INVALID_OPERATION',
      [gl.INVALID_FRAMEBUFFER_OPERATION]: 'INVALID_FRAMEBUFFER_OPERATION',
      [gl.OUT_OF_MEMORY]: 'OUT_OF_MEMORY',
      [gl.CONTEXT_LOST_WEBGL]: 'CONTEXT_LOST_WEBGL'
    };
    console.error('WebGL grid renderer: Error during rendering:', errorMessages[error] || error);
    gl.deleteTexture(imageTexture);
    gl.deleteTexture(outputTexture);
    gl.deleteFramebuffer(framebuffer);
    return null;
  }

  // Read result
  const pixels = new Uint8Array(width * height * 4);
  gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);

  // Create ImageData and fill transparent pixels with source image
  // Without FLIP_Y in texture upload:
  // - WebGL row 0 (bottom of screen) shows image TOP
  // - WebGL row height-1 (top of screen) shows image BOTTOM
  // - readPixels row 0 = image TOP
  // - ImageData row 0 = image TOP
  // So NO flip is needed - direct copy!
  const output = new ImageData(width, height);
  const sourceData = imageData.data;

  for (let i = 0; i < pixels.length; i += 4) {
    if (pixels[i + 3] === 0) {
      // Transparent pixel - use source image color
      output.data[i] = sourceData[i];
      output.data[i + 1] = sourceData[i + 1];
      output.data[i + 2] = sourceData[i + 2];
      output.data[i + 3] = 255;
    } else {
      // Cell color
      output.data[i] = pixels[i];
      output.data[i + 1] = pixels[i + 1];
      output.data[i + 2] = pixels[i + 2];
      output.data[i + 3] = 255;
    }
  }

  // Cleanup
  gl.deleteTexture(imageTexture);
  gl.deleteTexture(outputTexture);
  gl.deleteFramebuffer(framebuffer);

  return output;
}
