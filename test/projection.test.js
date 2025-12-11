import { describe, it, expect } from 'vitest';
import { applyProjection, identityMatrix, rotationMatrix, scaleMatrix } from '../src/projection.js';

// Helper to create a test canvas
function createTestCanvas(width, height, color = [255, 0, 0, 255]) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  const imageData = ctx.createImageData(width, height);

  for (let i = 0; i < imageData.data.length; i += 4) {
    imageData.data[i] = color[0];     // R
    imageData.data[i + 1] = color[1]; // G
    imageData.data[i + 2] = color[2]; // B
    imageData.data[i + 3] = color[3]; // A
  }

  ctx.putImageData(imageData, 0, 0);
  return canvas;
}

describe('applyProjection', () => {
  it('returns ImageData when returnCanvas is false', () => {
    const canvas = createTestCanvas(100, 100);
    const identity = identityMatrix();
    const result = applyProjection(canvas, identity);
    expect(result).toBeInstanceOf(ImageData);
  });

  it('returns Canvas when returnCanvas is true', () => {
    const canvas = createTestCanvas(100, 100);
    const identity = identityMatrix();
    const result = applyProjection(canvas, identity, { returnCanvas: true });
    expect(result).toBeInstanceOf(HTMLCanvasElement);
  });

  it('maintains dimensions with identity matrix', () => {
    const canvas = createTestCanvas(100, 100);
    const identity = identityMatrix();
    const result = applyProjection(canvas, identity, { returnCanvas: true });
    expect(result.width).toBe(100);
    expect(result.height).toBe(100);
  });

  it('applies identity transformation without change', () => {
    const canvas = createTestCanvas(100, 100, [255, 0, 0, 255]);
    const identity = identityMatrix();
    const result = applyProjection(canvas, identity, { returnCanvas: true });
    expect(result.width).toBe(100);
    expect(result.height).toBe(100);
  });

  it('applies rotation transformation', () => {
    const canvas = createTestCanvas(100, 100);
    const rotation = rotationMatrix(Math.PI / 4, 50, 50);
    const result = applyProjection(canvas, rotation, { returnCanvas: true });
    expect(result).toBeInstanceOf(HTMLCanvasElement);
    expect(result.width).toBe(100);
    expect(result.height).toBe(100);
  });

  it('applies scale transformation', () => {
    const canvas = createTestCanvas(100, 100);
    const scale = scaleMatrix(0.5, 0.5, 50, 50);
    const result = applyProjection(canvas, scale, { returnCanvas: true });
    expect(result).toBeInstanceOf(HTMLCanvasElement);
    expect(result.width).toBe(100);
    expect(result.height).toBe(100);
  });

  it('uses nearest interpolation by default', () => {
    const canvas = createTestCanvas(100, 100);
    const identity = identityMatrix();
    const result = applyProjection(canvas, identity, { returnCanvas: true });
    expect(result).toBeInstanceOf(HTMLCanvasElement);
  });

  it('uses bilinear interpolation when specified', () => {
    const canvas = createTestCanvas(100, 100);
    const identity = identityMatrix();
    const result = applyProjection(canvas, identity, {
      returnCanvas: true,
      interpolation: 'bilinear'
    });
    expect(result).toBeInstanceOf(HTMLCanvasElement);
  });

  it('handles different fill modes', () => {
    const canvas = createTestCanvas(100, 100);
    const rotation = rotationMatrix(Math.PI / 4, 50, 50);

    const modes = ['constant', 'reflect', 'wrap', 'nearest'];
    modes.forEach(mode => {
      const result = applyProjection(canvas, rotation, {
        returnCanvas: true,
        fillMode: mode
      });
      expect(result).toBeInstanceOf(HTMLCanvasElement);
    });
  });

  it('throws error for invalid transform matrix length', () => {
    const canvas = createTestCanvas(100, 100);
    expect(() => {
      applyProjection(canvas, [1, 2, 3]); // Invalid length
    }).toThrow('Transform matrix must have 8 elements');
  });

  it('handles zero projection case', () => {
    const canvas = createTestCanvas(100, 100);
    // Create a matrix that could cause zero projection
    const matrix = [1, 0, 0, 0, 1, 0, -0.01, -0.01];
    const result = applyProjection(canvas, matrix, { returnCanvas: true });
    expect(result).toBeInstanceOf(HTMLCanvasElement);
  });

  it('works with ImageData input', () => {
    const canvas = createTestCanvas(100, 100);
    const ctx = canvas.getContext('2d');
    const imageData = ctx.getImageData(0, 0, 100, 100);
    const identity = identityMatrix();
    const result = applyProjection(imageData, identity, { returnCanvas: true });
    expect(result).toBeInstanceOf(HTMLCanvasElement);
  });

  it('preserves pixelated look with nearest-neighbor interpolation', () => {
    // Create a pixelated image (large blocks)
    const canvas = createTestCanvas(100, 100);
    const ctx = canvas.getContext('2d');
    const imageData = ctx.createImageData(100, 100);

    // Create 10x10 pixel blocks
    const blockSize = 10;
    for (let by = 0; by < 10; by++) {
      for (let bx = 0; bx < 10; bx++) {
        // Alternate colors
        const color = (bx + by) % 2 === 0 ? [255, 0, 0, 255] : [0, 0, 255, 255];
        for (let y = by * blockSize; y < (by + 1) * blockSize; y++) {
          for (let x = bx * blockSize; x < (bx + 1) * blockSize; x++) {
            const idx = (y * 100 + x) * 4;
            imageData.data[idx] = color[0];
            imageData.data[idx + 1] = color[1];
            imageData.data[idx + 2] = color[2];
            imageData.data[idx + 3] = color[3];
          }
        }
      }
    }
    ctx.putImageData(imageData, 0, 0);

    // Apply rotation with nearest-neighbor
    const angle = Math.PI / 4; // 45 degrees
    const centerX = 50;
    const centerY = 50;
    const transform = rotationMatrix(angle, centerX, centerY);
    const result = applyProjection(canvas, transform, {
      returnCanvas: true,
      interpolation: 'nearest'
    });

    expect(result).toBeInstanceOf(HTMLCanvasElement);
    // Result should maintain pixelated appearance (not blurred)
    const resultCtx = result.getContext('2d');
    const resultData = resultCtx.getImageData(0, 0, result.width, result.height);

    // Check that we still have distinct color blocks (not smooth gradients)
    // Sample a few pixels - they should be either red or blue, not intermediate
    let distinctColors = new Set();
    for (let i = 0; i < resultData.data.length; i += 400) { // Sample every 100th pixel
      const r = resultData.data[i];
      const g = resultData.data[i + 1];
      const b = resultData.data[i + 2];
      distinctColors.add(`${r},${g},${b}`);
    }

    // Should have distinct colors (not all blended)
    expect(distinctColors.size).toBeGreaterThan(1);
  });
});

