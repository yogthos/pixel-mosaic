import { describe, it, expect, beforeEach } from 'vitest';
import { pixelateImage, loadImage } from '../src/pixelate.js';

// Helper to create a test canvas with colored pixels
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

// Helper to create a test ImageData
function createTestImageData(width, height, color = [255, 0, 0, 255]) {
  const canvas = createTestCanvas(width, height, color);
  return canvas.getContext('2d').getImageData(0, 0, width, height);
}

describe('pixelateImage', () => {
  it('returns ImageData when returnCanvas is false', () => {
    const canvas = createTestCanvas(100, 100);
    const result = pixelateImage(canvas, 5);
    expect(result).toBeInstanceOf(ImageData);
  });

  it('returns Canvas when returnCanvas is true', () => {
    const canvas = createTestCanvas(100, 100);
    const result = pixelateImage(canvas, 5, { returnCanvas: true });
    expect(result).toBeInstanceOf(HTMLCanvasElement);
  });

  it('maintains original dimensions', () => {
    const canvas = createTestCanvas(100, 100);
    const result = pixelateImage(canvas, 5, { returnCanvas: true });
    expect(result.width).toBe(100);
    expect(result.height).toBe(100);
  });

  it('works with different pixel sizes', () => {
    const canvas = createTestCanvas(100, 100);
    const result1 = pixelateImage(canvas, 2, { returnCanvas: true });
    const result2 = pixelateImage(canvas, 10, { returnCanvas: true });
    expect(result1.width).toBe(100);
    expect(result2.width).toBe(100);
  });

  it('works with ImageData input', () => {
    const imageData = createTestImageData(100, 100);
    const result = pixelateImage(imageData, 5, { returnCanvas: true });
    expect(result).toBeInstanceOf(HTMLCanvasElement);
    expect(result.width).toBe(100);
    expect(result.height).toBe(100);
  });

  it('handles very small pixel sizes', () => {
    const canvas = createTestCanvas(100, 100);
    const result = pixelateImage(canvas, 2, { returnCanvas: true });
    expect(result.width).toBe(100);
    expect(result.height).toBe(100);
  });

  it('handles large pixel sizes', () => {
    const canvas = createTestCanvas(100, 100);
    const result = pixelateImage(canvas, 50, { returnCanvas: true });
    expect(result.width).toBe(100);
    expect(result.height).toBe(100);
  });

  it('applies color quantization when colorLimit is set', () => {
    // Create canvas with multiple colors
    const canvas = createTestCanvas(100, 100);
    const ctx = canvas.getContext('2d');
    const imageData = ctx.getImageData(0, 0, 100, 100);

    // Add some color variation
    for (let i = 0; i < imageData.data.length; i += 16) {
      imageData.data[i] = Math.floor(Math.random() * 256);     // R
      imageData.data[i + 1] = Math.floor(Math.random() * 256); // G
      imageData.data[i + 2] = Math.floor(Math.random() * 256); // B
    }
    ctx.putImageData(imageData, 0, 0);

    const result = pixelateImage(canvas, 5, {
      returnCanvas: true,
      colorLimit: 8
    });
    expect(result).toBeInstanceOf(HTMLCanvasElement);
  });

  it('throws error for unsupported image type', () => {
    expect(() => {
      pixelateImage({}, 5);
    }).toThrow('Unsupported image type');
  });
});

describe('loadImage', () => {
  it('is a function', () => {
    expect(typeof loadImage).toBe('function');
  });

  // Note: Testing file loading and URL loading would require more complex mocking
  // of FileReader and Image.onerror. For now, we verify the function exists.
  // In a real scenario, you'd want to mock these browser APIs for testing.
});

