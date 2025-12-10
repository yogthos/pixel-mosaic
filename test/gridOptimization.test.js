import { describe, it, expect } from 'vitest';
import { createInitialGrid, optimizeGridCorners, renderGrid } from '../src/gridOptimization.js';

describe('Grid Optimization', () => {
  describe('createInitialGrid', () => {
    it('should create a grid with correct structure', () => {
      const width = 100;
      const height = 100;
      const gridSize = 10;

      const grid = createInitialGrid(width, height, gridSize);

      expect(grid).toHaveProperty('corners');
      expect(grid).toHaveProperty('cells');
      expect(grid).toHaveProperty('cols');
      expect(grid).toHaveProperty('rows');

      expect(grid.corners.length).toBeGreaterThan(0);
      expect(grid.cells.length).toBeGreaterThan(0);
    });

    it('should create corners at correct positions', () => {
      const width = 100;
      const height = 100;
      const gridSize = 25; // Should create 4x4 grid

      const grid = createInitialGrid(width, height, gridSize);

      // Check first corner
      expect(grid.corners[0][0].x).toBe(0);
      expect(grid.corners[0][0].y).toBe(0);

      // Check last corner (approximately)
      const lastRow = grid.corners[grid.corners.length - 1];
      const lastCorner = lastRow[lastRow.length - 1];
      expect(lastCorner.x).toBeCloseTo(width, 1);
      expect(lastCorner.y).toBeCloseTo(height, 1);
    });

    it('should create cells from corners', () => {
      const width = 100;
      const height = 100;
      const gridSize = 25;

      const grid = createInitialGrid(width, height, gridSize);

      // Each cell should have 4 corners
      for (const cell of grid.cells) {
        expect(cell.corners).toHaveLength(4);
      }
    });
  });

  describe('optimizeGridCorners', () => {
    it('should optimize grid corners without errors', () => {
      const width = 50;
      const height = 50;
      const gridSize = 10;

      const grid = createInitialGrid(width, height, gridSize);

      // Create a simple edge map (all zeros)
      const edgeMap = new Float32Array(width * height);

      const optimized = optimizeGridCorners(grid, edgeMap, width, height, {
        searchSteps: 5,
        numIterations: 1,
        stepSize: 1.0
      });

      expect(optimized).toBeDefined();
      expect(optimized.corners).toBeDefined();
    });

    it('should preserve grid structure after optimization', () => {
      const width = 50;
      const height = 50;
      const gridSize = 10;

      const grid = createInitialGrid(width, height, gridSize);
      const originalCornerCount = grid.corners.length;

      const edgeMap = new Float32Array(width * height);
      const optimized = optimizeGridCorners(grid, edgeMap, width, height);

      expect(optimized.corners.length).toBe(originalCornerCount);
    });
  });

  describe('renderGrid', () => {
    it('should render grid to ImageData', () => {
      const width = 50;
      const height = 50;
      const gridSize = 10;

      const grid = createInitialGrid(width, height, gridSize);

      // Create a simple image
      const imageData = new ImageData(width, height);
      for (let i = 0; i < imageData.data.length; i += 4) {
        imageData.data[i] = 128;     // R
        imageData.data[i + 1] = 128; // G
        imageData.data[i + 2] = 128; // B
        imageData.data[i + 3] = 255; // A
      }

      const output = renderGrid(grid, imageData);

      expect(output).toBeInstanceOf(ImageData);
      expect(output.width).toBe(width);
      expect(output.height).toBe(height);
      expect(output.data.length).toBe(width * height * 4);
    });

    it('should produce valid pixel data', () => {
      const width = 20;
      const height = 20;
      const gridSize = 5;

      const grid = createInitialGrid(width, height, gridSize);

      const imageData = new ImageData(width, height);
      for (let i = 0; i < imageData.data.length; i += 4) {
        imageData.data[i] = 255;
        imageData.data[i + 1] = 0;
        imageData.data[i + 2] = 0;
        imageData.data[i + 3] = 255;
      }

      const output = renderGrid(grid, imageData);

      // Check that all pixels have valid RGBA values
      for (let i = 0; i < output.data.length; i += 4) {
        expect(output.data[i]).toBeGreaterThanOrEqual(0);
        expect(output.data[i]).toBeLessThanOrEqual(255);
        expect(output.data[i + 1]).toBeGreaterThanOrEqual(0);
        expect(output.data[i + 1]).toBeLessThanOrEqual(255);
        expect(output.data[i + 2]).toBeGreaterThanOrEqual(0);
        expect(output.data[i + 2]).toBeLessThanOrEqual(255);
        expect(output.data[i + 3]).toBe(255); // Alpha should be 255
      }
    });
  });
});

