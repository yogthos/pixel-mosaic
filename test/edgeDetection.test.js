import { describe, it, expect } from 'vitest';
import { calculateEdgeMap, getEdgeStrength, getEdgeStrengthInterpolated } from '../src/edgeDetection.js';

describe('Edge Detection', () => {
  describe('calculateEdgeMap', () => {
    it('should create an edge map with correct dimensions', () => {
      const width = 10;
      const height = 10;
      const imageData = new ImageData(width, height);

      // Fill with a simple pattern (white image)
      for (let i = 0; i < imageData.data.length; i += 4) {
        imageData.data[i] = 255;     // R
        imageData.data[i + 1] = 255;  // G
        imageData.data[i + 2] = 255; // B
        imageData.data[i + 3] = 255; // A
      }

      const edgeMap = calculateEdgeMap(imageData);

      expect(edgeMap).toBeInstanceOf(Float32Array);
      expect(edgeMap.length).toBe(width * height);
    });

    it('should detect edges in an image with a vertical line', () => {
      const width = 20;
      const height = 20;
      const imageData = new ImageData(width, height);

      // Create a vertical line in the middle (wider to avoid border issues)
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const idx = (y * width + x) * 4;
          if (x >= 8 && x <= 12) {
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

      const edgeMap = calculateEdgeMap(imageData);

      // Edges should be stronger at the boundaries of the line (x=7 and x=13)
      // Check a point near the edge (not on border)
      const edgeAtBoundary = getEdgeStrength(edgeMap, width, 7, 10);
      const edgeInMiddle = getEdgeStrength(edgeMap, width, 10, 10);
      const edgeAway = getEdgeStrength(edgeMap, width, 2, 10);

      // Edge at boundary should be stronger than away from the line
      expect(edgeAtBoundary).toBeGreaterThan(edgeAway);
      // Edge in middle of line should be weaker than at boundary
      expect(edgeAtBoundary).toBeGreaterThan(edgeInMiddle);
    });

    it('should normalize edge map values to 0-1 range', () => {
      const width = 10;
      const height = 10;
      const imageData = new ImageData(width, height);

      // Fill with pattern
      for (let i = 0; i < imageData.data.length; i += 4) {
        imageData.data[i] = Math.random() * 255;
        imageData.data[i + 1] = Math.random() * 255;
        imageData.data[i + 2] = Math.random() * 255;
        imageData.data[i + 3] = 255;
      }

      const edgeMap = calculateEdgeMap(imageData);

      // All values should be between 0 and 1
      for (let i = 0; i < edgeMap.length; i++) {
        expect(edgeMap[i]).toBeGreaterThanOrEqual(0);
        expect(edgeMap[i]).toBeLessThanOrEqual(1);
      }
    });
  });

  describe('getEdgeStrength', () => {
    it('should return edge strength at integer coordinates', () => {
      const width = 10;
      const height = 10;
      const edgeMap = new Float32Array(width * height);

      // Set a specific value
      edgeMap[5 * width + 3] = 0.75;

      const strength = getEdgeStrength(edgeMap, width, 3, 5);
      expect(strength).toBe(0.75);
    });

    it('should return 0 for out-of-bounds coordinates', () => {
      const width = 10;
      const height = 10;
      const edgeMap = new Float32Array(width * height);

      const strength = getEdgeStrength(edgeMap, width, -1, 5);
      expect(strength).toBe(0);
    });
  });

  describe('getEdgeStrengthInterpolated', () => {
    it('should interpolate edge strength at fractional coordinates', () => {
      const width = 10;
      const height = 10;
      const edgeMap = new Float32Array(width * height);

      // Set values at corners
      edgeMap[0 * width + 0] = 0.0; // (0, 0)
      edgeMap[0 * width + 1] = 1.0; // (1, 0)
      edgeMap[1 * width + 0] = 0.0; // (0, 1)
      edgeMap[1 * width + 1] = 1.0; // (1, 1)

      // At (0.5, 0.5), should be average
      const strength = getEdgeStrengthInterpolated(edgeMap, width, height, 0.5, 0.5);
      expect(strength).toBeCloseTo(0.5, 5);
    });

    it('should clamp coordinates to valid range', () => {
      const width = 10;
      const height = 10;
      const edgeMap = new Float32Array(width * height);

      // Should not throw for out-of-bounds
      const strength = getEdgeStrengthInterpolated(edgeMap, width, height, -5, 20);
      expect(strength).toBeGreaterThanOrEqual(0);
      expect(strength).toBeLessThanOrEqual(1);
    });
  });
});

