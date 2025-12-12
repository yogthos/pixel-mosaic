/**
 * Tests for WebGL coordinate transformations in grid rendering
 */
import { describe, it, expect, beforeAll } from 'vitest';

// Mock WebGL for testing coordinate logic
describe('WebGL Coordinate Transformations', () => {

  /**
   * Test the coordinate math used in the shader
   * This simulates what the shader does to understand the transformations
   */
  describe('Shader coordinate math simulation', () => {

    // Simulate the shader's coordinate calculation
    function shaderCoordCalc(texCoordX, texCoordY, imageWidth, imageHeight) {
      // This is what the shader does:
      // float imageY = (1.0 - v_texCoord.y) * u_imageSize.y;
      // float imageX = v_texCoord.x * u_imageSize.x;
      const imageX = texCoordX * imageWidth;
      const imageY = (1.0 - texCoordY) * imageHeight;
      return { imageX, imageY };
    }

    it('should map screen corners to image corners correctly', () => {
      const width = 100;
      const height = 100;

      // Screen bottom-left (texCoord 0,0) -> should be image bottom-left (0, height)
      const bottomLeft = shaderCoordCalc(0, 0, width, height);
      console.log('Screen bottom-left (0,0) -> image:', bottomLeft);
      expect(bottomLeft.imageX).toBe(0);
      expect(bottomLeft.imageY).toBe(height); // Image Y=height is bottom

      // Screen top-left (texCoord 0,1) -> should be image top-left (0, 0)
      const topLeft = shaderCoordCalc(0, 1, width, height);
      console.log('Screen top-left (0,1) -> image:', topLeft);
      expect(topLeft.imageX).toBe(0);
      expect(topLeft.imageY).toBe(0); // Image Y=0 is top

      // Screen bottom-right (texCoord 1,0) -> should be image bottom-right (width, height)
      const bottomRight = shaderCoordCalc(1, 0, width, height);
      console.log('Screen bottom-right (1,0) -> image:', bottomRight);
      expect(bottomRight.imageX).toBe(width);
      expect(bottomRight.imageY).toBe(height);

      // Screen top-right (texCoord 1,1) -> should be image top-right (width, 0)
      const topRight = shaderCoordCalc(1, 1, width, height);
      console.log('Screen top-right (1,1) -> image:', topRight);
      expect(topRight.imageX).toBe(width);
      expect(topRight.imageY).toBe(0);

      // Screen center (texCoord 0.5, 0.5) -> should be image center
      const center = shaderCoordCalc(0.5, 0.5, width, height);
      console.log('Screen center (0.5,0.5) -> image:', center);
      expect(center.imageX).toBe(width / 2);
      expect(center.imageY).toBe(height / 2);
    });

    it('should show the readback Y-flip transformation', () => {
      const height = 100;

      // Simulate readback: output row y gets pixels row (height - 1 - y)
      function readbackYFlip(outputY, height) {
        return height - 1 - outputY;
      }

      // Output row 0 (top of ImageData) gets WebGL row 99 (top of framebuffer)
      console.log('Output row 0 gets WebGL row:', readbackYFlip(0, height));
      expect(readbackYFlip(0, height)).toBe(99);

      // Output row 99 (bottom of ImageData) gets WebGL row 0 (bottom of framebuffer)
      console.log('Output row 99 gets WebGL row:', readbackYFlip(99, height));
      expect(readbackYFlip(99, height)).toBe(0);
    });
  });

  describe('Cell corner storage and retrieval', () => {

    // Simulate how cell corners are stored in texture
    function storeCellCorner(cornerX, cornerY, imageWidth, imageHeight) {
      // From createCellDataTexture:
      const xNorm = Math.max(0, Math.min(1, cornerX / imageWidth));
      const yNorm = Math.max(0, Math.min(1, cornerY / imageHeight));
      const storedX = Math.floor(xNorm * 255);
      const storedY = Math.floor(yNorm * 255);
      return { storedX, storedY, xNorm, yNorm };
    }

    // Simulate how shader reads cell corners from texture
    function readCellCorner(storedX, storedY, imageWidth, imageHeight) {
      // Texture returns normalized 0-1 values
      const texX = storedX / 255;
      const texY = storedY / 255;
      // Shader multiplies by imageSize
      const cornerX = texX * imageWidth;
      const cornerY = texY * imageHeight;
      return { cornerX, cornerY };
    }

    it('should store and retrieve cell corners correctly', () => {
      const width = 100;
      const height = 100;

      // Test a cell at image top-left (corner near 0,0)
      const topLeftCorner = { x: 5, y: 5 };
      const storedTL = storeCellCorner(topLeftCorner.x, topLeftCorner.y, width, height);
      const readTL = readCellCorner(storedTL.storedX, storedTL.storedY, width, height);
      console.log('Top-left corner:', topLeftCorner, '-> stored:', storedTL, '-> read:', readTL);

      // Test a cell at image bottom-right (corner near width, height)
      const bottomRightCorner = { x: 95, y: 95 };
      const storedBR = storeCellCorner(bottomRightCorner.x, bottomRightCorner.y, width, height);
      const readBR = readCellCorner(storedBR.storedX, storedBR.storedY, width, height);
      console.log('Bottom-right corner:', bottomRightCorner, '-> stored:', storedBR, '-> read:', readBR);

      // Test center
      const centerCorner = { x: 50, y: 50 };
      const storedC = storeCellCorner(centerCorner.x, centerCorner.y, width, height);
      const readC = readCellCorner(storedC.storedX, storedC.storedY, width, height);
      console.log('Center corner:', centerCorner, '-> stored:', storedC, '-> read:', readC);
    });

    it('should match shader pixel position to cell corners', () => {
      const width = 100;
      const height = 100;

      // A cell at image top-left has corners around y=0-10
      // When rendering, screen top (texCoord.y=1) should match this cell
      // because shader calculates: imageY = (1 - 1) * 100 = 0

      // A cell at image bottom has corners around y=90-100
      // When rendering, screen bottom (texCoord.y=0) should match this cell
      // because shader calculates: imageY = (1 - 0) * 100 = 100

      console.log('\n=== Cell matching test ===');
      console.log('Cell at image top (y=0-10):');
      console.log('  Should match screen top where texCoord.y=1');
      console.log('  Shader calculates: imageY = (1-1)*100 = 0 ✓');

      console.log('\nCell at image bottom (y=90-100):');
      console.log('  Should match screen bottom where texCoord.y=0');
      console.log('  Shader calculates: imageY = (1-0)*100 = 100 ✓');

      // The math seems correct, so the issue must be elsewhere
    });
  });

  describe('Full pipeline trace', () => {
    it('should trace a pixel through the entire pipeline', () => {
      const width = 100;
      const height = 100;

      console.log('\n=== Full pipeline trace for a pixel at image center ===');

      // 1. Cell definition: A cell at image center (y=45-55)
      const cellCorners = [
        { x: 45, y: 45 }, // top-left in image coords
        { x: 55, y: 45 }, // top-right
        { x: 55, y: 55 }, // bottom-right
        { x: 45, y: 55 }, // bottom-left
      ];
      console.log('1. Cell corners (image coords):', cellCorners);

      // 2. Store in texture
      const stored = cellCorners.map(c => ({
        storedX: Math.floor((c.x / width) * 255),
        storedY: Math.floor((c.y / height) * 255),
      }));
      console.log('2. Stored in texture (0-255):', stored);

      // 3. Shader reads back
      const readCorners = stored.map(s => ({
        x: (s.storedX / 255) * width,
        y: (s.storedY / 255) * height,
      }));
      console.log('3. Shader reads (pixel coords):', readCorners);

      // 4. For a pixel at screen center (texCoord 0.5, 0.5)
      const texCoord = { x: 0.5, y: 0.5 };
      const pixelCenter = {
        x: texCoord.x * width,
        y: (1.0 - texCoord.y) * height,
      };
      console.log('4. Screen center texCoord:', texCoord, '-> pixelCenter:', pixelCenter);

      // 5. Check if pixel is in cell
      // pixelCenter is (50, 50) which should be inside cell with corners 45-55
      const inCell = pixelCenter.x >= readCorners[0].x &&
                     pixelCenter.x <= readCorners[1].x &&
                     pixelCenter.y >= readCorners[0].y &&
                     pixelCenter.y <= readCorners[2].y;
      console.log('5. Is pixel in cell?', inCell);

      // 6. Framebuffer position: screen center is at framebuffer row height/2
      const fbRow = Math.floor(height * texCoord.y); // texCoord.y=0.5 -> row 50
      console.log('6. Framebuffer row:', fbRow);

      // 7. Readback flip: ImageData row = height - 1 - fbRow
      const outputRow = height - 1 - fbRow;
      console.log('7. Output ImageData row:', outputRow);

      // So a pixel at screen center ends up at ImageData row 49 (close to center)
      // This seems correct!
    });

    it('should trace pixels at corners', () => {
      const width = 100;
      const height = 100;

      console.log('\n=== Corner pixel traces ===');

      // Screen bottom-left (texCoord 0, 0)
      let texCoord = { x: 0, y: 0 };
      let pixelCenter = { x: texCoord.x * width, y: (1 - texCoord.y) * height };
      let fbRow = Math.floor(height * texCoord.y);
      let outputRow = height - 1 - fbRow;
      console.log('Screen bottom-left: texCoord=', texCoord);
      console.log('  pixelCenter (image coords):', pixelCenter);
      console.log('  fbRow:', fbRow, '-> outputRow:', outputRow);
      console.log('  Expected: image bottom (y~100) -> output bottom (row~99)');

      // Screen top-left (texCoord 0, 1)
      texCoord = { x: 0, y: 1 };
      pixelCenter = { x: texCoord.x * width, y: (1 - texCoord.y) * height };
      fbRow = Math.floor(height * texCoord.y);
      outputRow = height - 1 - fbRow;
      console.log('\nScreen top-left: texCoord=', texCoord);
      console.log('  pixelCenter (image coords):', pixelCenter);
      console.log('  fbRow:', fbRow, '-> outputRow:', outputRow);
      console.log('  Expected: image top (y~0) -> output top (row~0)');

      // Wait, this shows:
      // - texCoord.y=1 -> fbRow=100 -> outputRow=-1 (OUT OF BOUNDS!)
      // This is a bug! When texCoord.y=1 exactly, we get row 100 which is past the last row
    });
  });
});
