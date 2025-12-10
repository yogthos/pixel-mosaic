import { describe, it, expect } from 'vitest';
import {
  calculateEdgeMap,
  getEdgeStrength,
  getEdgeStrengthInterpolated,
  applyNonMaximumSuppression,
  applyThresholding,
  calculateEdgeDirections
} from '../src/edgeDetection.js';

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

    it('should create sharper edges with NMS and thresholding enabled', () => {
      const width = 20;
      const height = 20;
      const imageData = new ImageData(width, height);

      // Create a vertical line
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const idx = (y * width + x) * 4;
          if (x >= 8 && x <= 12) {
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

      // Test with NMS and thresholding (default uses edgeSharpness 0.8 = threshold 0.4)
      const edgeMapSharp = calculateEdgeMap(imageData, { applyNMS: true, edgeSharpness: 0.8 });

      // Test without NMS and thresholding
      const edgeMapSoft = calculateEdgeMap(imageData, { applyNMS: false, threshold: 0.0 });

      // Count non-zero edge pixels - sharp edges should have fewer non-zero pixels
      // (more pixels suppressed to 0)
      let sharpNonZero = 0;
      let softNonZero = 0;
      for (let i = 0; i < edgeMapSharp.length; i++) {
        if (edgeMapSharp[i] > 0.01) sharpNonZero++;
        if (edgeMapSoft[i] > 0.01) softNonZero++;
      }

      // Sharp edges should have fewer or equal non-zero pixels due to NMS and thresholding
      // (thresholding removes weak edges, NMS thins them)
      expect(sharpNonZero).toBeLessThanOrEqual(softNonZero);

      // Verify that edge values are actually sharper (higher contrast)
      // Find max edge value - should be similar or higher with sharpening
      let maxSharp = 0;
      let maxSoft = 0;
      for (let i = 0; i < edgeMapSharp.length; i++) {
        if (edgeMapSharp[i] > maxSharp) maxSharp = edgeMapSharp[i];
        if (edgeMapSoft[i] > maxSoft) maxSoft = edgeMapSoft[i];
      }
      // Sharp edges should have strong edges preserved
      expect(maxSharp).toBeGreaterThan(0);
    });

    it('should use edgeSharpness parameter to control threshold', () => {
      const width = 20;
      const height = 20;
      const imageData = new ImageData(width, height);

      // Create a vertical line
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const idx = (y * width + x) * 4;
          if (x >= 8 && x <= 12) {
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

      // Test with low sharpness (soft edges)
      const edgeMapSoft = calculateEdgeMap(imageData, { edgeSharpness: 0.2 }); // threshold ~0.1

      // Test with high sharpness (sharp edges)
      const edgeMapSharp = calculateEdgeMap(imageData, { edgeSharpness: 0.9 }); // threshold ~0.45

      // Count non-zero edge pixels - sharper should have fewer
      let softNonZero = 0;
      let sharpNonZero = 0;
      for (let i = 0; i < edgeMapSoft.length; i++) {
        if (edgeMapSoft[i] > 0.01) softNonZero++;
        if (edgeMapSharp[i] > 0.01) sharpNonZero++;
      }

      // Sharper edges should have fewer non-zero pixels
      expect(sharpNonZero).toBeLessThanOrEqual(softNonZero);
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
    it('should interpolate edge strength at fractional coordinates when interpolate=true', () => {
      const width = 10;
      const height = 10;
      const edgeMap = new Float32Array(width * height);

      // Set values at corners
      edgeMap[0 * width + 0] = 0.0; // (0, 0)
      edgeMap[0 * width + 1] = 1.0; // (1, 0)
      edgeMap[1 * width + 0] = 0.0; // (0, 1)
      edgeMap[1 * width + 1] = 1.0; // (1, 1)

      // At (0.5, 0.5), should be average when using bilinear interpolation
      const strength = getEdgeStrengthInterpolated(edgeMap, width, height, 0.5, 0.5, true);
      expect(strength).toBeCloseTo(0.5, 5);
    });

    it('should use nearest-neighbor by default for crisp edges', () => {
      const width = 10;
      const height = 10;
      const edgeMap = new Float32Array(width * height);

      // Set values at corners
      edgeMap[0 * width + 0] = 0.0; // (0, 0)
      edgeMap[0 * width + 1] = 1.0; // (1, 0)
      edgeMap[1 * width + 0] = 0.0; // (0, 1)
      edgeMap[1 * width + 1] = 1.0; // (1, 1)

      // At (0.5, 0.5), should round to (1, 1) which is 1.0 with nearest-neighbor (default)
      const strength = getEdgeStrengthInterpolated(edgeMap, width, height, 0.5, 0.5);
      expect(strength).toBe(1.0);
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

  describe('applyNonMaximumSuppression', () => {
    it('should thin edges by keeping only local maxima', () => {
      const width = 10;
      const height = 10;
      const magnitudeMap = new Float32Array(width * height);
      const directionMap = new Float32Array(width * height);

      // Create a simple edge pattern: a vertical line of high magnitude
      // with decreasing values on either side
      // For a vertical edge, the gradient is horizontal, so edge direction is vertical (90°)
      for (let x = 5; x < 6; x++) {
        for (let y = 1; y < height - 1; y++) {
          const idx = y * width + x;
          // Center pixel has highest magnitude
          if (y === 5) {
            magnitudeMap[idx] = 1.0;
          } else if (y === 4 || y === 6) {
            magnitudeMap[idx] = 0.8; // Neighbors along edge direction
          } else {
            magnitudeMap[idx] = 0.3;
          }
          // Vertical edge direction (perpendicular to horizontal gradient = 90°)
          directionMap[idx] = Math.PI / 2; // 90 degrees
        }
      }

      const suppressed = applyNonMaximumSuppression(magnitudeMap, directionMap, width, height);

      // Center pixel should be kept (local maximum)
      expect(suppressed[5 * width + 5]).toBeCloseTo(1.0, 5);
      // Neighbors along the edge direction (top/bottom) should be suppressed (not local maxima)
      expect(suppressed[4 * width + 5]).toBe(0);
      expect(suppressed[6 * width + 5]).toBe(0);
    });

    it('should preserve edge map dimensions', () => {
      const width = 10;
      const height = 10;
      const magnitudeMap = new Float32Array(width * height);
      const directionMap = new Float32Array(width * height);

      const suppressed = applyNonMaximumSuppression(magnitudeMap, directionMap, width, height);

      expect(suppressed).toBeInstanceOf(Float32Array);
      expect(suppressed.length).toBe(width * height);
    });
  });

  describe('applyThresholding', () => {
    it('should set values below threshold to zero', () => {
      const width = 10;
      const height = 10;
      const edgeMap = new Float32Array(width * height);

      // Set some values
      edgeMap[5 * width + 5] = 0.8;
      edgeMap[5 * width + 6] = 0.3;
      edgeMap[5 * width + 7] = 0.05;

      const thresholded = applyThresholding(edgeMap, width, height, {
        threshold: 0.2,
        usePercentile: false, // Use absolute threshold for this test
        binarize: false // Preserve original magnitudes for this test
      });

      expect(thresholded[5 * width + 5]).toBeCloseTo(0.8, 5); // Above threshold
      expect(thresholded[5 * width + 6]).toBeCloseTo(0.3, 5); // Above threshold
      expect(thresholded[5 * width + 7]).toBe(0); // Below threshold
    });

    it('should binarize edges by default for crisp results', () => {
      const width = 10;
      const height = 10;
      const edgeMap = new Float32Array(width * height);

      // Set some values
      edgeMap[5 * width + 5] = 0.8;
      edgeMap[5 * width + 6] = 0.3;
      edgeMap[5 * width + 7] = 0.05;

      const thresholded = applyThresholding(edgeMap, width, height, {
        threshold: 0.2,
        usePercentile: false // Use absolute threshold for this test
      });

      expect(thresholded[5 * width + 5]).toBe(1.0); // Above threshold, binarized to 1
      expect(thresholded[5 * width + 6]).toBe(1.0); // Above threshold, binarized to 1
      expect(thresholded[5 * width + 7]).toBe(0); // Below threshold
    });

    it('should preserve edge map dimensions', () => {
      const width = 10;
      const height = 10;
      const edgeMap = new Float32Array(width * height);

      const thresholded = applyThresholding(edgeMap, width, height, { threshold: 0.1 });

      expect(thresholded).toBeInstanceOf(Float32Array);
      expect(thresholded.length).toBe(width * height);
    });

    it('should support hysteresis thresholding', () => {
      const width = 10;
      const height = 10;
      const edgeMap = new Float32Array(width * height);

      // Create pattern: strong edge, weak edge directly connected (8-connected), weak edge isolated
      edgeMap[5 * width + 5] = 0.9; // Strong edge
      edgeMap[5 * width + 6] = 0.5; // Weak edge directly connected to strong (adjacent)
      edgeMap[2 * width + 2] = 0.5; // Weak edge isolated (not connected to any strong edge)

      const thresholded = applyThresholding(edgeMap, width, height, {
        highThreshold: 0.8,
        lowThreshold: 0.4,
        usePercentile: false, // Disable percentile for this test to use absolute thresholds
        binarize: false // Preserve original magnitudes for this test
      });

      expect(thresholded[5 * width + 5]).toBeCloseTo(0.9, 5); // Strong edge kept
      expect(thresholded[5 * width + 6]).toBeCloseTo(0.5, 5); // Connected weak edge kept
      expect(thresholded[2 * width + 2]).toBe(0); // Isolated weak edge removed
    });

    it('should binarize hysteresis edges when binarize=true', () => {
      const width = 10;
      const height = 10;
      const edgeMap = new Float32Array(width * height);

      // Create pattern: strong edge, weak edge directly connected
      edgeMap[5 * width + 5] = 0.9; // Strong edge
      edgeMap[5 * width + 6] = 0.5; // Weak edge directly connected to strong (adjacent)

      const thresholded = applyThresholding(edgeMap, width, height, {
        highThreshold: 0.8,
        lowThreshold: 0.4,
        usePercentile: false,
        binarize: true
      });

      expect(thresholded[5 * width + 5]).toBe(1.0); // Strong edge binarized to 1
      expect(thresholded[5 * width + 6]).toBe(1.0); // Connected weak edge binarized to 1
    });
  });
});
