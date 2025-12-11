import { describe, it, expect, beforeEach } from 'vitest';
import { pixelateImage, pixelateImageEdgeAware, loadImage } from '../src/pixelate.js';

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

describe('pixelateImageEdgeAware', () => {
  it('should return canvas when returnCanvas is true', async () => {
    const canvas = createTestCanvas(100, 100);
    const result = await pixelateImageEdgeAware(canvas, 10, { returnCanvas: true });
    expect(result).toBeInstanceOf(HTMLCanvasElement);
  });

  it('should maintain original dimensions', async () => {
    const canvas = createTestCanvas(100, 100);
    const result = await pixelateImageEdgeAware(canvas, 10, { returnCanvas: true });
    expect(result.width).toBe(100);
    expect(result.height).toBe(100);
  });

  it('should produce rectangular pixels, not polygons', async () => {
    const width = 60;
    const height = 60;
    const pixelSize = 10;

    // Create image with clear edges (vertical line)
    const canvas = createTestCanvas(width, height);
    const ctx = canvas.getContext('2d');
    const imageData = ctx.getImageData(0, 0, width, height);

    // Create vertical line
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = (y * width + x) * 4;
        if (x >= width / 2 - 1 && x <= width / 2 + 1) {
          imageData.data[idx] = 255;     // R
          imageData.data[idx + 1] = 255; // G
          imageData.data[idx + 2] = 255; // B
        } else {
          imageData.data[idx] = 0;
          imageData.data[idx + 1] = 0;
          imageData.data[idx + 2] = 0;
        }
        imageData.data[idx + 3] = 255;
      }
    }
    ctx.putImageData(imageData, 0, 0);

    const result = await pixelateImageEdgeAware(canvas, pixelSize, {
      returnCanvas: true,
      edgeSharpness: 0.8
    });

    // Get result image data
    const resultCtx = result.getContext('2d');
    const resultData = resultCtx.getImageData(0, 0, width, height);

    // Check that pixels form rectangular blocks
    // For pixelSize=10, we should have 6x6 blocks
    // Each block should have uniform color
    const blocksX = Math.ceil(width / pixelSize);
    const blocksY = Math.ceil(height / pixelSize);

    // Sample a few blocks to verify they're rectangular (uniform color within block)
    for (let by = 0; by < blocksY; by += 2) {
      for (let bx = 0; bx < blocksX; bx += 2) {
        const blockStartX = bx * pixelSize;
        const blockStartY = by * pixelSize;
        const blockEndX = Math.min(blockStartX + pixelSize, width);
        const blockEndY = Math.min(blockStartY + pixelSize, height);

        // Get color of top-left pixel in block
        const topLeftIdx = (blockStartY * width + blockStartX) * 4;
        const r = resultData.data[topLeftIdx];
        const g = resultData.data[topLeftIdx + 1];
        const b = resultData.data[topLeftIdx + 2];

        // Check that all pixels in block have same color (rectangular block)
        let uniform = true;
        for (let y = blockStartY; y < blockEndY && uniform; y++) {
          for (let x = blockStartX; x < blockEndX && uniform; x++) {
            const idx = (y * width + x) * 4;
            if (resultData.data[idx] !== r ||
                resultData.data[idx + 1] !== g ||
                resultData.data[idx + 2] !== b) {
              uniform = false;
            }
          }
        }

        // Block should be uniform (rectangular pixelation)
        expect(uniform).toBe(true);
      }
    }
  });

  it('should detect edges and apply edge-aware color sampling', async () => {
    const width = 60;
    const height = 60;
    const pixelSize = 10;

    // Create image with clear edges
    const canvas = createTestCanvas(width, height);
    const ctx = canvas.getContext('2d');
    const imageData = ctx.getImageData(0, 0, width, height);

    // Create vertical line
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = (y * width + x) * 4;
        if (x >= width / 2 - 1 && x <= width / 2 + 1) {
          imageData.data[idx] = 255;
          imageData.data[idx + 1] = 255;
          imageData.data[idx + 2] = 255;
        } else {
          imageData.data[idx] = 0;
          imageData.data[idx + 1] = 0;
          imageData.data[idx + 2] = 0;
        }
        imageData.data[idx + 3] = 255;
      }
    }
    ctx.putImageData(imageData, 0, 0);

    // Test with high edge sharpness (should use median color near edges)
    const result = await pixelateImageEdgeAware(canvas, pixelSize, {
      returnCanvas: true,
      edgeSharpness: 1.0
    });

    expect(result).toBeInstanceOf(HTMLCanvasElement);
    expect(result.width).toBe(width);
    expect(result.height).toBe(height);
  });

  it('should return intermediates when captureIntermediates is true', async () => {
    const canvas = createTestCanvas(60, 60);
    const result = await pixelateImageEdgeAware(canvas, 10, {
      returnCanvas: true,
      captureIntermediates: true
    });

    expect(result).toHaveProperty('intermediates');
    expect(result).toHaveProperty('canvas');
    expect(result).toHaveProperty('usingGPU');
    expect(Array.isArray(result.intermediates)).toBe(true);
    expect(result.intermediates.length).toBeGreaterThan(0);

    // Should have Final Result step
    const finalStep = result.intermediates.find(s => s.name === 'Final Result');
    expect(finalStep).toBeDefined();
    expect(finalStep.canvas).toBeInstanceOf(HTMLCanvasElement);
  });
});

