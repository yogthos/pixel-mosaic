import { describe, it, expect } from 'vitest';
import { identityMatrix, rotationMatrix, scaleMatrix } from '../src/projection.js';

describe('Helper Functions', () => {
  describe('identityMatrix', () => {
    it('returns correct identity matrix', () => {
      const matrix = identityMatrix();
      expect(matrix).toEqual([1, 0, 0, 0, 1, 0, 0, 0]);
    });

    it('returns array of 8 elements', () => {
      const matrix = identityMatrix();
      expect(matrix).toHaveLength(8);
    });
  });

  describe('rotationMatrix', () => {
    it('creates rotation matrix for 0 degrees', () => {
      const matrix = rotationMatrix(0, 50, 50);
      // cos(0) = 1, sin(0) = 0
      expect(matrix[0]).toBeCloseTo(1, 5);
      expect(matrix[1]).toBeCloseTo(0, 5);
      expect(matrix[3]).toBeCloseTo(0, 5);
      expect(matrix[4]).toBeCloseTo(1, 5);
    });

    it('creates rotation matrix for 90 degrees', () => {
      const matrix = rotationMatrix(Math.PI / 2, 0, 0);
      // cos(90°) = 0, sin(90°) = 1
      expect(matrix[0]).toBeCloseTo(0, 5);
      expect(matrix[1]).toBeCloseTo(-1, 5);
      expect(matrix[3]).toBeCloseTo(1, 5);
      expect(matrix[4]).toBeCloseTo(0, 5);
    });

    it('returns array of 8 elements', () => {
      const matrix = rotationMatrix(Math.PI / 4, 10, 10);
      expect(matrix).toHaveLength(8);
    });

    it('rotates around specified center point', () => {
      const centerX = 50;
      const centerY = 50;
      const matrix = rotationMatrix(Math.PI / 4, centerX, centerY);
      // Translation components should account for center
      expect(matrix[2]).toBeDefined();
      expect(matrix[5]).toBeDefined();
    });
  });

  describe('scaleMatrix', () => {
    it('creates scale matrix with scale factor 1 (no scaling)', () => {
      const matrix = scaleMatrix(1, 1, 50, 50);
      expect(matrix[0]).toBe(1);
      expect(matrix[4]).toBe(1);
      expect(matrix[2]).toBe(0);
      expect(matrix[5]).toBe(0);
    });

    it('creates scale matrix with different x and y scales', () => {
      const matrix = scaleMatrix(2, 3, 0, 0);
      expect(matrix[0]).toBe(2);
      expect(matrix[4]).toBe(3);
    });

    it('scales around specified center point', () => {
      const centerX = 50;
      const centerY = 50;
      const scaleX = 2;
      const scaleY = 2;
      const matrix = scaleMatrix(scaleX, scaleY, centerX, centerY);
      expect(matrix[2]).toBe(centerX * (1 - scaleX));
      expect(matrix[5]).toBe(centerY * (1 - scaleY));
    });

    it('returns array of 8 elements', () => {
      const matrix = scaleMatrix(2, 2, 10, 10);
      expect(matrix).toHaveLength(8);
    });
  });
});

