/**
 * WebGL-based Edge Detection
 *
 * Uses GPU acceleration for edge detection using Sobel operators.
 */

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

  // Fragment shader - Sobel edge detection
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

      // Output magnitude (will be normalized later)
      gl_FragColor = vec4(magnitude, magnitude, magnitude, 1.0);
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
 * @returns {Float32Array} Edge strength map (normalized 0-1)
 */
export function calculateEdgeMapWebGL(imageData) {
  const { width, height } = imageData;

  // Create offscreen canvas for WebGL
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const webgl = createWebGLContext(canvas);
  if (!webgl) {
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

  // Create framebuffer
  const framebuffer = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);

  const outputTexture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, outputTexture);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, outputTexture, 0);

  // Draw
  gl.drawArrays(gl.TRIANGLES, 0, 6);

  // Read result
  const pixels = new Uint8Array(width * height * 4);
  gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);

  // Convert to Float32Array and normalize
  const edgeMap = new Float32Array(width * height);
  let maxEdge = 0;

  for (let i = 0; i < width * height; i++) {
    const magnitude = pixels[i * 4]; // Red channel contains magnitude
    edgeMap[i] = magnitude;
    if (magnitude > maxEdge) {
      maxEdge = magnitude;
    }
  }

  // Normalize to 0-1
  if (maxEdge > 0) {
    for (let i = 0; i < edgeMap.length; i++) {
      edgeMap[i] /= maxEdge;
    }
  }

  // Cleanup
  gl.deleteTexture(texture);
  gl.deleteTexture(outputTexture);
  gl.deleteFramebuffer(framebuffer);

  return edgeMap;
}

