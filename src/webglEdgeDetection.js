/**
 * WebGL-based Edge Detection
 *
 * Uses GPU acceleration for edge detection using Sobel operators.
 */

import { applyNonMaximumSuppression, applyThresholding } from './edgeDetection.js';

/**
 * Creates a WebGL context and compiles shaders
 */
function createWebGLContext(canvas) {
  const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
  if (!gl) {
    return null;
  }

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

  // Fragment shader - Sobel edge detection with direction
  const fragmentShaderSource = `
    precision mediump float;
    uniform sampler2D u_image;
    uniform vec2 u_textureSize;
    varying vec2 v_texCoord;

    void main() {
      vec2 onePixel = vec2(1.0) / u_textureSize;

      // Sample neighboring pixels for Sobel operator
      float tl = texture2D(u_image, v_texCoord + vec2(-onePixel.x, -onePixel.y)).r;
      float tm = texture2D(u_image, v_texCoord + vec2( 0.0, -onePixel.y)).r;
      float tr = texture2D(u_image, v_texCoord + vec2( onePixel.x, -onePixel.y)).r;
      float ml = texture2D(u_image, v_texCoord + vec2(-onePixel.x,  0.0)).r;
      float mr = texture2D(u_image, v_texCoord + vec2( onePixel.x,  0.0)).r;
      float bl = texture2D(u_image, v_texCoord + vec2(-onePixel.x,  onePixel.y)).r;
      float bm = texture2D(u_image, v_texCoord + vec2( 0.0,  onePixel.y)).r;
      float br = texture2D(u_image, v_texCoord + vec2( onePixel.x,  onePixel.y)).r;

      // Sobel X kernel: [-1, 0, 1; -2, 0, 2; -1, 0, 1]
      float sobelX = -tl + tr - 2.0 * ml + 2.0 * mr - bl + br;

      // Sobel Y kernel: [-1, -2, -1; 0, 0, 0; 1, 2, 1]
      float sobelY = -tl - 2.0 * tm - tr + bl + 2.0 * bm + br;

      // Calculate gradient magnitude
      float magnitude = sqrt(sobelX * sobelX + sobelY * sobelY);

      // Normalize magnitude to [0, 1] range
      // Max theoretical magnitude for normalized [0,1] input with Sobel is ~5.66
      // Use 6.0 as divisor to ensure we stay in [0, 1] range
      float magnitudeNormalized = magnitude / 6.0;

      // Calculate edge direction (perpendicular to gradient)
      // atan2 returns [-π, π], we add π/2 and normalize to [0, 2π)
      float direction = atan(sobelY, sobelX) + 3.14159265359 / 2.0;
      if (direction < 0.0) direction += 2.0 * 3.14159265359;

      // Normalize direction to [0, 1] for storage in texture
      float directionNormalized = direction / (2.0 * 3.14159265359);

      // Output: R = magnitude (normalized), G = direction (normalized), B = unused, A = 1.0
      gl_FragColor = vec4(magnitudeNormalized, directionNormalized, 0.0, 1.0);
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
    return null;
  }

  const program = createProgram(gl, vertexShader, fragmentShader);
  if (!program) {
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
 * Converts ImageData to grayscale and creates WebGL texture
 */
function createGrayscaleTexture(gl, imageData) {
  const { width, height, data } = imageData;
  const grayscaleData = new Uint8Array(width * height);

  // Convert to grayscale
  for (let i = 0; i < data.length; i += 4) {
    const gray = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
    grayscaleData[i / 4] = gray;
  }

  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  // Set alignment to 1 for single-byte LUMINANCE format (avoids row padding issues)
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.LUMINANCE, width, height, 0, gl.LUMINANCE, gl.UNSIGNED_BYTE, grayscaleData);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);

  return texture;
}

/**
 * Calculates edge map using WebGL (GPU-accelerated)
 *
 * @param {ImageData} imageData - Source image data
 * @param {Object} options - Optional configuration
 * @param {boolean} options.applyNMS - Apply non-maximum suppression (default: true)
 * @param {number} options.threshold - Threshold value for edge sharpening (0-1, default: 0.4)
 * @param {number} options.edgeSharpness - Edge sharpness level (0-1, default: 0.8). Maps to threshold: 0 = soft (0.0), 1 = very sharp (0.9)
 * @param {number} options.highThreshold - High threshold for hysteresis (optional)
 * @param {number} options.lowThreshold - Low threshold for hysteresis (optional)
 * @returns {Float32Array} Edge strength map (normalized 0-1)
 */
export function calculateEdgeMapWebGL(imageData, options = {}) {
  let {
    applyNMS = true,
    threshold = null,
    edgeSharpness = 0.8,
    highThreshold = null,
    lowThreshold = null
  } = options;

  // Map edgeSharpness (0-1) to threshold for edge detection
  // Lower thresholds keep more edges
  // edgeSharpness 0.0 -> threshold 0.02 (keep top 98% - very soft, many edges)
  // edgeSharpness 0.5 -> threshold 0.10 (keep top 90% - moderate)
  // edgeSharpness 1.0 -> threshold 0.20 (keep top 80% - sharper, fewer edges)
  if (threshold === null) {
    threshold = 0.02 + edgeSharpness * 0.18;
  }

  const { width, height } = imageData;

  // Create offscreen canvas for WebGL
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const webgl = createWebGLContext(canvas);
  if (!webgl) {
    console.warn('WebGL not available, falling back to CPU');
    return null; // WebGL not available, fallback to CPU
  }

  const { gl, program, positionBuffer, texCoordBuffer } = webgl;

  // Create grayscale texture
  const texture = createGrayscaleTexture(gl, imageData);

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

  // Bind texture
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.uniform1i(gl.getUniformLocation(program, 'u_image'), 0);
  gl.uniform2f(gl.getUniformLocation(program, 'u_textureSize'), width, height);

  // Create output texture for framebuffer
  const outputTexture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, outputTexture);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  // Must use CLAMP_TO_EDGE for non-power-of-two textures
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);

  // Create and setup framebuffer
  const framebuffer = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, outputTexture, 0);

  // Check framebuffer status BEFORE drawing
  const fbStatus = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
  if (fbStatus !== gl.FRAMEBUFFER_COMPLETE) {
    console.error('WebGL framebuffer incomplete:', fbStatus);
    gl.deleteTexture(texture);
    gl.deleteTexture(outputTexture);
    gl.deleteFramebuffer(framebuffer);
    return null;
  }

  // Re-bind input texture for drawing (framebuffer setup may have unbound it)
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, texture);

  // Draw
  gl.drawArrays(gl.TRIANGLES, 0, 6);

  // Check for WebGL errors
  const error = gl.getError();
  if (error !== gl.NO_ERROR) {
    console.error('WebGL error during rendering:', error);
    // Cleanup and fallback to CPU
    gl.deleteTexture(texture);
    gl.deleteTexture(outputTexture);
    gl.deleteFramebuffer(framebuffer);
    return null;
  }

  // Read result
  const pixels = new Uint8Array(width * height * 4);
  gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);

  // Extract magnitude and direction from GPU output
  const magnitudeMap = new Float32Array(width * height);
  const directionMap = new Float32Array(width * height);

  for (let i = 0; i < width * height; i++) {
    // Red channel contains normalized magnitude (0-255 maps to 0-1)
    magnitudeMap[i] = pixels[i * 4] / 255.0;

    // Green channel contains direction normalized to [0, 1]
    // Convert back to radians [0, 2π]
    const directionNormalized = pixels[i * 4 + 1] / 255.0;
    directionMap[i] = directionNormalized * 2 * Math.PI;
  }

  let edgeMap = magnitudeMap;

  // Apply non-maximum suppression if requested
  if (applyNMS) {
    edgeMap = applyNonMaximumSuppression(magnitudeMap, directionMap, width, height);
  }

  // Apply thresholding
  edgeMap = applyThresholding(edgeMap, width, height, {
    threshold,
    highThreshold,
    lowThreshold
  });

  // Cleanup
  gl.deleteTexture(texture);
  gl.deleteTexture(outputTexture);
  gl.deleteFramebuffer(framebuffer);

  return edgeMap;
}
