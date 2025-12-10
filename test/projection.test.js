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
});

