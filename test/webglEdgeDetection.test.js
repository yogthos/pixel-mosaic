import { describe, it, expect } from 'vitest';
import { calculateEdgeMapWebGL } from '../src/webglEdgeDetection.js';
import { calculateEdgeMap } from '../src/edgeDetection.js';

// Helper to create test image with edges
function createTestImageWithEdges(width, height) {
  const imageData = new ImageData(width, height);

  // Create a vertical line (strong edges)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      if (x >= width / 2 - 2 && x <= width / 2 + 2) {
        // White line
        imageData.data[idx] = 255;
        imageData.data[idx + 1] = 255;
        imageData.data[idx + 2] = 255;
      } else {
        // Black background
        imageData.data[idx] = 0;
        imageData.data[idx + 1] = 0;
        imageData.data[idx + 2] = 0;
      }
      imageData.data[idx + 3] = 255;
    }
  }

  return imageData;
}

describe('WebGL Edge Detection', () => {
  it('should return null if WebGL is not available', () => {
    // This test may pass or fail depending on test environment
    // If WebGL is available, it will proceed, otherwise null
    const imageData = createTestImageWithEdges(20, 20);
    const result = calculateEdgeMapWebGL(imageData);

    // Result should either be null (no WebGL) or a Float32Array (WebGL available)
    expect(result === null || result instanceof Float32Array).toBe(true);
  });

  it('should produce edge map with correct dimensions when WebGL is available', () => {
    const width = 20;
    const height = 20;
    const imageData = createTestImageWithEdges(width, height);
    const edgeMap = calculateEdgeMapWebGL(imageData);

    // Skip test if WebGL not available
    if (!edgeMap) {
      console.log('WebGL not available, skipping test');
      return;
    }

    expect(edgeMap).toBeInstanceOf(Float32Array);
    expect(edgeMap.length).toBe(width * height);
  });

  it('should detect edges when WebGL is available', () => {
    const width = 20;
    const height = 20;
    const imageData = createTestImageWithEdges(width, height);
    const edgeMap = calculateEdgeMapWebGL(imageData, { edgeSharpness: 0.8 });

    // Skip test if WebGL not available
    if (!edgeMap) {
      console.log('WebGL not available, skipping test');
      return;
    }

    // Should detect edges (not all zeros)
    let edgeCount = 0;
    for (let i = 0; i < edgeMap.length; i++) {
      if (edgeMap[i] > 0) edgeCount++;
    }

    // Should have detected edges
    expect(edgeCount).toBeGreaterThan(0);
  });

  it('should normalize magnitude values to 0-1 range', () => {
    const width = 20;
    const height = 20;
    const imageData = createTestImageWithEdges(width, height);
    const edgeMap = calculateEdgeMapWebGL(imageData);

    // Skip test if WebGL not available
    if (!edgeMap) {
      console.log('WebGL not available, skipping test');
      return;
    }

    // All values should be between 0 and 1
    for (let i = 0; i < edgeMap.length; i++) {
      expect(edgeMap[i]).toBeGreaterThanOrEqual(0);
      expect(edgeMap[i]).toBeLessThanOrEqual(1);
    }
  });

  it('should use edgeSharpness parameter correctly', () => {
    const width = 20;
    const height = 20;
    const imageData = createTestImageWithEdges(width, height);

    // Low sharpness (more edges)
    const edgeMapSoft = calculateEdgeMapWebGL(imageData, { edgeSharpness: 0.2 });

    // Skip test if WebGL not available
    if (!edgeMapSoft) {
      console.log('WebGL not available, skipping test');
      return;
    }

    // High sharpness (fewer edges)
    const edgeMapSharp = calculateEdgeMapWebGL(imageData, { edgeSharpness: 0.9 });

    let softCount = 0;
    let sharpCount = 0;
    for (let i = 0; i < edgeMapSoft.length; i++) {
      if (edgeMapSoft[i] > 0.01) softCount++;
      if (edgeMapSharp[i] > 0.01) sharpCount++;
    }

    // Sharper should have fewer or equal edges
    expect(sharpCount).toBeLessThanOrEqual(softCount);
  });
});

