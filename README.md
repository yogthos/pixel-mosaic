# Pixel Mosaic

![CI](https://github.com/yogthos/pixel-mosaic/actions/workflows/main.yml/badge.svg)

A canvas-based library for pixelating images with edge-aware algorithms and projective transformations.

## Features

- Simple pixelation with nearest-neighbor scaling
- Edge-aware pixelation that aligns grid boundaries with image edges
- Configurable edge sharpness (0-1) with smooth gradient blending
- WebGL-accelerated edge detection (CPU fallback)
- Color quantization with diversity-maximizing algorithm
- Contrast adjustment
- Projective transformations (homography)

<table>
<tr>
<td><strong>Original</strong><br><img src="img/dino.jpg" width="300"></td>
<td><strong>Naive Approach</strong><br><img src="img/dino_px_naive.png" width="300"></td>
</tr>
<tr>
<td><strong>Edge Detection</strong><br><img src="img/dino_px.png" width="300"></td>
<td><strong>Edge Detection + Sharpening</strong><br><img src="img/dino_px_sharp.png" width="300"></td>
</tr>
</table>

## Installation

```bash
npm install @yogthos/pixel-mosaic
```

## Installation

```bash
git clone https://github.com/yogthos/pixel-mosaic.git
cd pixel-mosaic
```

## Quick Start

### Using the Demo Page

1. Start a local web server (required for ES modules):

```bash
# Python 3
python3 -m http.server 8000

# Node.js (with http-server)
npx http-server -p 8000
```

### API

```javascript
import { pixelateImage, pixelateImageEdgeAware, loadImage } from '@yogthos/pixel-mosaic';

// Load image
const img = await loadImage('image.jpg');

// Simple pixelation
const pixelated = pixelateImage(img, 5, {
  returnCanvas: true,
  colorLimit: 32,
  contrast: 1.2
});

// Edge-aware pixelation
const edgeAware = await pixelateImageEdgeAware(img, 10, {
  returnCanvas: true,
  edgeSharpness: 0.8,  // 0 = soft, 1 = crisp
  numIterations: 3
});
```

## API Reference

### `pixelateImage(image, pixelSize, options)`

Simple pixelation by scaling down and up.

**Parameters:**
- `image` - HTMLImageElement, HTMLCanvasElement, or ImageData
- `pixelSize` - Size of pixel blocks (e.g., 5 = 5x5 blocks)
- `options`:
  - `returnCanvas` (boolean) - Return canvas instead of ImageData
  - `colorLimit` (number) - Limit color palette size
  - `contrast` (number) - Contrast factor (1.0 = no change)

**Returns:** `HTMLCanvasElement|ImageData`

### `pixelateImageEdgeAware(image, pixelSize, options)`

Edge-aware pixelation with adaptive grid alignment.

**Parameters:**
- `image` - HTMLImageElement, HTMLCanvasElement, or ImageData
- `pixelSize` - Approximate size of pixel blocks
- `options`:
  - `returnCanvas` (boolean) - Return canvas instead of ImageData
  - `colorLimit` (number) - Limit color palette size
  - `contrast` (number) - Contrast factor
  - `edgeSharpness` (number, 0-1) - Edge sharpness (0 = soft, 1 = crisp)
  - `numIterations` (number) - Grid optimization iterations (default: 2)
  - `searchSteps` (number) - Search positions per corner (default: 9)
  - `onProgress` (function) - Progress callback `{ usingGPU: boolean }`

**Returns:** `Promise<HTMLCanvasElement|ImageData>`

### `loadImage(source)`

Loads an image from URL or File.

**Parameters:**
- `source` - URL string or File object

**Returns:** `Promise<HTMLImageElement>`

### `applyProjection(image, transformMatrix, options)`

Applies projective transformation using 3x3 matrix.

**Parameters:**
- `image` - HTMLImageElement, HTMLCanvasElement, or ImageData
- `transformMatrix` - 8-element array `[a1, a2, a3, b1, b2, b3, c1, c2]`
- `options`:
  - `interpolation` (string) - 'nearest' or 'bilinear'
  - `fillMode` (string) - 'constant', 'reflect', 'wrap', or 'nearest'
  - `returnCanvas` (boolean) - Return canvas instead of ImageData

**Returns:** `HTMLCanvasElement|ImageData`

**Helper functions:**
- `identityMatrix()` - Identity transformation
- `rotationMatrix(angle, centerX, centerY)` - Rotation matrix
- `scaleMatrix(scaleX, scaleY, centerX, centerY)` - Scaling matrix

## Algorithm Overview

### Simple Pixelation

1. Downscale image to `originalSize / pixelSize`
2. Optionally quantize colors
3. Upscale with nearest-neighbor interpolation

### Edge-Aware Pixelation

1. **Edge Detection**: Sobel operators with non-maximum suppression and thresholding
2. **Grid Initialization**: Regular quadrilateral grid
3. **Grid Optimization**: Moves corners to align with detected edges
4. **Color Assignment**: Blends average and median colors based on edge sharpness
5. **Rendering**: Spatial hashing for efficient pixel-to-cell mapping

Edge sharpness (0-1) controls:
- Edge detection threshold (0.1 to 0.6)
- Color blending: 0 = average (soft), 1 = median (crisp)
- Grid optimization aggressiveness

## Development

```bash
# Run tests
npm test

# Watch mode
npm run test:watch

# Coverage
npm run test:coverage
```

## Browser Support

- Modern browsers with ES6 modules
- Canvas API required
- WebGL recommended (CPU fallback available)

## Why Edge-Aware Pixelation?

Most pixelation libraries use a simple approach: downscale the image, then upscale it back. While fast, this creates pixel blocks that cut across important image features like edges, faces, and fine details, resulting in artifacts and loss of visual clarity.

**Pixel Mosaic** takes a fundamentally different approach. Instead of forcing a rigid grid onto the image, it adapts the grid to align with the image's natural structure. The result? Pixel art that preserves the essential character of the original image while achieving that distinctive low-resolution aesthetic.

### Technical Deep Dive

#### Naive Downsampling: The Traditional Approach

The naive method is straightforward:
1. **Downscale**: Reduce image dimensions by dividing by the pixel size (e.g., 1920×1080 → 384×216 for 5px blocks)
2. **Upscale**: Scale back to original size using nearest-neighbor interpolation
3. **Optional**: Apply color quantization or contrast adjustment

**Limitations:**
- Fixed grid boundaries ignore image content
- Edges get "chopped" across pixel boundaries, creating jagged artifacts
- Important features (eyes, edges, text) become distorted
- No awareness of image structure or semantics

#### Edge-Aware Algorithm: Adaptive Grid Optimization

Edge detection approach treats pixelation as an optimization problem:

1. **Edge Detection**:
   - Uses Sobel operators to compute gradient magnitude and direction
   - Applies non-maximum suppression to thin edges to single-pixel width
   - Thresholds edges using percentile-based filtering (configurable via `edgeSharpness`)
   - WebGL-accelerated for performance (CPU fallback available)

2. **Grid Initialization**:
   - Creates a regular quadrilateral grid matching the target pixel size
   - Each cell is a quadrilateral (not necessarily rectangular after optimization)

3. **Grid Optimization**:
   - Iteratively moves grid corner points to align cell boundaries with detected edges
   - Uses a search-based optimization: for each corner, tests multiple positions in a local neighborhood
   - Evaluates alignment by sampling edge strength along grid edges
   - Applies damping based on `edgeSharpness` to control how aggressively corners snap to edges
   - Runs for multiple iterations (default: 2-5) with progressively refined search

4. **Color Assignment**:
   - Samples pixels within each optimized cell
   - Blends between average color (soft) and median color (crisp) based on `edgeSharpness`
   - Uses spatial hashing for efficient pixel-to-cell mapping during rendering

5. **Rendering**:
   - Efficiently maps each output pixel to its containing cell
   - Uses point-in-quadrilateral tests with spatial hash acceleration
   - Ensures complete coverage with fallback to nearest-cell assignment

**Advantages:**
- Grid boundaries align with image edges, preserving important features
- Natural-looking pixel art that maintains image semantics
- Configurable sharpness: from soft, blended edges (0.0) to crisp, high-contrast results (1.0)
- Handles complex shapes and curved edges gracefully
- WebGL acceleration makes it practical for real-time applications

### Performance Considerations

The edge-aware algorithm is more computationally intensive than naive downsampling, but optimizations make it practical:

- **WebGL acceleration**: Edge detection runs on GPU when available (10-50x faster)
- **Spatial hashing**: O(1) average-case pixel-to-cell lookup during rendering
- **Adaptive sampling**: Color calculation samples pixels at intervals for large cells
- **Iterative refinement**: Early iterations use coarser search, later iterations refine

For most images, edge-aware pixelation completes in 100-500ms on modern hardware (with WebGL), making it suitable for interactive applications.
