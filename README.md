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

original image

![](img/dino.jpg)

using naive approach to pixelate the image

![](img/dino_px_naive.png)

using edge detection approach

![](img/dino_px.png)

using edge detection approach with edge sharpening

![](img/dino_px_sharp.png)

## Installation

```bash
npm install @yogthos/pixel-mosaic
```

## Quick Start

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
