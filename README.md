# Pixel Mosaic

![CI](https://github.com/yogthos/pixel-mosaic/actions/workflows/main.yml/badge.svg)

A canvas-based library for pixelating images and applying projective transformations. Create pixel art effects with color quantization and advanced image warping.

This library implements canvas-based techniques for pixelating images, including an advanced edge-aware algorithm that aligns pixel boundaries with image edges.

## Features

- **Simple Pixelation**: Scale down and up images with nearest-neighbor interpolation for crisp pixel art effects
- **Edge-Aware Pixelation**: Advanced algorithm that detects image edges and aligns pixel grid boundaries with them for sharper, more natural-looking pixel art
- **WebGL Acceleration**: GPU-accelerated edge detection for faster processing (with CPU fallback)
- **Color Quantization**: Reduce color palette using an improved diversity-maximizing algorithm
- **Contrast Adjustment**: Adjust image contrast to enhance pixel art effects
- **Projective Transformation**: Apply homography transformations for advanced image warping
- **Zero Dependencies**: Uses only native Canvas and WebGL APIs - no external libraries required

## Demo

![](img/dino.jpg)

using naive approach to pixelate the image

![](img/dino_px_naive.png)

using edge detection approach

![](img/dino_px.png)


## Installation

### NPM

```bash
npm install @yogthos/pixel-mosaic
```

### From Source

Clone or download this repository:

```bash
git clone https://git.sr.ht/~yogthos/pixel-mosaic
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

2. Open `index.html` in your browser:
   ```
   http://localhost:8000/index.html
   ```

3. Upload an image and adjust the controls:
   - **Pixel Size**: Size of pixel blocks (higher = larger pixels)
   - **Color Limit**: Maximum number of colors in the palette
   - **Contrast**: Adjust image contrast (1.0 = no change, < 1.0 = reduce, > 1.0 = increase)
   - **Edge-Aware Pixelation**: Enable advanced edge-aligned pixelation
   - **Optimization Iterations**: Number of grid optimization steps (when edge-aware is enabled)

### Using as an NPM Package

```javascript
import { pixelateImage, pixelateImageEdgeAware, loadImage } from '@yogthos/pixel-mosaic';

// Load an image
const img = await loadImage('path/to/image.jpg');

// Simple pixelation
const pixelated = pixelateImage(img, 5, {
  returnCanvas: true,
  colorLimit: 32,
  contrast: 1.2  // Increase contrast by 20%
});

// Edge-aware pixelation (advanced)
const edgeAwarePixelated = await pixelateImageEdgeAware(img, 8, {
  returnCanvas: true,
  colorLimit: 32,
  contrast: 1.1,
  numIterations: 3,
  searchSteps: 9,
  onProgress: (info) => {
    console.log('Using GPU:', info.usingGPU);
  }
});

// Use the pixelated canvas
document.body.appendChild(edgeAwarePixelated);
```

### Using from Source

```javascript
import { pixelateImage, loadImage } from './src/pixelate.js';

// Load an image
const img = await loadImage('path/to/image.jpg');

// Pixelate it
const pixelated = pixelateImage(img, 5, {
  returnCanvas: true,
  colorLimit: 32
});

// Use the pixelated canvas
document.body.appendChild(pixelated);
```

## API Reference

### Pixelation Module (`src/pixelate.js`)

#### `pixelateImage(image, pixelSize, options)`

Pixelates an image by scaling it down and then back up with nearest-neighbor interpolation.

**Parameters:**
- `image` (HTMLImageElement|HTMLCanvasElement|ImageData) - Source image to pixelate
- `pixelSize` (number) - Size of each pixel block (e.g., 3 = 3x3 pixel blocks)
- `options` (Object, optional) - Configuration options:
  - `returnCanvas` (boolean, default: false) - If true, returns canvas element; otherwise returns ImageData
  - `colorLimit` (number, optional) - Limit the number of colors for color quantization
  - `contrast` (number, default: 1.0) - Contrast adjustment factor (1.0 = no change, < 1.0 = reduce contrast, > 1.0 = increase contrast)

**Returns:** `HTMLCanvasElement|ImageData` - Pixelated image

**Example:**
```javascript
const pixelated = pixelateImage(myImage, 4, {
  returnCanvas: true,
  colorLimit: 16,
  contrast: 1.2  // Increase contrast
});
```

#### `pixelateImageEdgeAware(image, pixelizationFactor, options)`

Pixelates an image using an edge-aware algorithm that aligns pixel grid boundaries with image edges for sharper results.

**Parameters:**
- `image` (HTMLImageElement|HTMLCanvasElement|ImageData) - Source image to pixelate
- `pixelizationFactor` (number) - Approximate size of each pixel block (e.g., 8 = ~8x8 pixel blocks)
- `options` (Object, optional) - Configuration options:
  - `returnCanvas` (boolean, default: false) - If true, returns canvas element; otherwise returns ImageData
  - `colorLimit` (number, optional) - Limit the number of colors for color quantization
  - `contrast` (number, default: 1.0) - Contrast adjustment factor (1.0 = no change, < 1.0 = reduce contrast, > 1.0 = increase contrast)
  - `searchSteps` (number, default: 9) - Number of search positions per corner (3x3 grid = 9)
  - `numIterations` (number, default: 2) - Number of optimization iterations
  - `onProgress` (function, optional) - Callback with progress info: `{ usingGPU: boolean }`

**Returns:** `Promise<HTMLCanvasElement|ImageData>` - Pixelated image

**Example:**
```javascript
const pixelated = await pixelateImageEdgeAware(myImage, 10, {
  returnCanvas: true,
  colorLimit: 16,
  contrast: 1.1,
  numIterations: 3,
  onProgress: (info) => {
    console.log('GPU acceleration:', info.usingGPU);
  }
});
```

#### `loadImage(source)`

Loads an image from a URL or File object.

**Parameters:**
- `source` (string|File) - URL string or File object

**Returns:** `Promise<HTMLImageElement>` - Promise that resolves with the loaded image

**Example:**
```javascript
// From URL
const img = await loadImage('https://example.com/image.jpg');

// From file input
const file = document.querySelector('input[type="file"]').files[0];
const img = await loadImage(file);
```

### Projection Module (`src/projection.js`)

#### `applyProjection(image, transformMatrix, options)`

Applies a projective transformation (homography) to an image using a 3x3 transformation matrix.

**Parameters:**
- `image` (HTMLImageElement|HTMLCanvasElement|ImageData) - Source image
- `transformMatrix` (Array<number>) - 8-element array `[a1, a2, a3, b1, b2, b3, c1, c2]` representing the 3x3 matrix:
  ```
  [a1 a2 a3]
  [b1 b2 b3]
  [c1 c2  1]
  ```
- `options` (Object, optional) - Configuration options:
  - `interpolation` (string, default: 'nearest') - 'nearest' or 'bilinear'
  - `fillMode` (string, default: 'constant') - 'constant', 'reflect', 'wrap', or 'nearest'
  - `fillValue` (number, default: 0) - Fill value for out-of-bounds pixels
  - `returnCanvas` (boolean, default: false) - If true, returns canvas element

**Returns:** `HTMLCanvasElement|ImageData` - Transformed image

**Example:**
```javascript
// Identity transformation (no change)
const identity = identityMatrix();
const transformed = applyProjection(myImage, identity);

// Rotation
const rotation = rotationMatrix(Math.PI / 4, width / 2, height / 2);
const rotated = applyProjection(myImage, rotation);
```

#### Helper Functions

- `identityMatrix()` - Returns identity transformation matrix `[1, 0, 0, 0, 1, 0, 0, 0]`
- `rotationMatrix(angle, centerX, centerY)` - Creates rotation transformation matrix
- `scaleMatrix(scaleX, scaleY, centerX, centerY)` - Creates scaling transformation matrix

## Examples

### Basic Pixelation

```javascript
import { pixelateImage, loadImage } from '@yogthos/pixel-mosaic';

const img = await loadImage('photo.jpg');
const pixelated = pixelateImage(img, 8, { returnCanvas: true });
document.body.appendChild(pixelated);
```

### Pixelation with Color Limiting and Contrast

```javascript
import { pixelateImage, loadImage } from '@yogthos/pixel-mosaic';

const img = await loadImage('photo.jpg');
const pixelated = pixelateImage(img, 6, {
  returnCanvas: true,
  colorLimit: 16,  // Reduce to 16 colors
  contrast: 1.3     // Increase contrast by 30%
});
```

### Edge-Aware Pixelation

```javascript
import { pixelateImageEdgeAware, loadImage } from '@yogthos/pixel-mosaic';

const img = await loadImage('photo.jpg');
const pixelated = await pixelateImageEdgeAware(img, 10, {
  returnCanvas: true,
  colorLimit: 32,
  contrast: 1.2,    // Increase contrast
  numIterations: 3,  // More iterations = better edge alignment
  onProgress: (info) => {
    if (info.usingGPU) {
      console.log('Using GPU acceleration');
    }
  }
});
document.body.appendChild(pixelated);
```

### Combining Pixelation and Projection

```javascript
import { pixelateImage, loadImage, applyProjection, rotationMatrix } from '@yogthos/pixel-mosaic';

const img = await loadImage('photo.jpg');

// First pixelate
const pixelated = pixelateImage(img, 5, { returnCanvas: true });

// Then apply transformation
const width = pixelated.width;
const height = pixelated.height;
const rotation = rotationMatrix(Math.PI / 6, width / 2, height / 2);
const transformed = applyProjection(pixelated, rotation, { returnCanvas: true });
```

### Using Sub-modules

You can also import from specific sub-modules:

```javascript
// Import only pixelation functions
import { pixelateImage, pixelateImageEdgeAware, loadImage } from '@yogthos/pixel-mosaic/pixelate';

// Import edge detection functions
import { calculateEdgeMap, calculateEdgeMapWebGL } from '@yogthos/pixel-mosaic/edgeDetection';

// Import grid optimization functions
import { createInitialGrid, optimizeGridCorners, renderGrid } from '@yogthos/pixel-mosaic/gridOptimization';

// Import only projection functions
import { applyProjection, rotationMatrix } from '@yogthos/pixel-mosaic/projection';
```

## Technical Details

### Simple Pixelation Algorithm

The simple pixelation process works by:

1. **Downscaling**: The source image is drawn to a smaller canvas (original size / pixelSize)
2. **Color Quantization** (optional): Colors are reduced using an improved diversity-maximizing algorithm
3. **Upscaling**: The scaled-down image is drawn back to the original size with nearest-neighbor interpolation (image smoothing disabled)

This creates the characteristic blocky pixel art effect.

### Edge-Aware Pixelation Algorithm

The edge-aware pixelation algorithm provides superior results by aligning pixel boundaries with image edges:

1. **Edge Detection**: Uses Sobel operators to detect edges in the image (GPU-accelerated via WebGL when available)
2. **Grid Initialization**: Creates a regular grid of quadrilateral cells over the image
3. **Grid Optimization**: Iteratively moves grid corners to align cell edges with detected image edges:
   - For each corner, searches nearby positions
   - Evaluates edge alignment for all connected cell edges
   - Moves corner to position with best edge alignment
   - Uses adaptive damping to prevent oscillation
4. **Color Assignment**: Calculates average color for each optimized cell
5. **Rendering**: Renders each pixel by determining which cell it belongs to (using spatial hashing for efficiency)
6. **Color Quantization** (optional): Applies color limiting to the final result

This creates pixel art that preserves sharp edges and important image features while maintaining the pixelated aesthetic.

### Projective Transformation

The projection module implements homography transformations using a 3x3 matrix. The transformation maps points using:

```
x' = (a1*x + a2*y + a3) / (c1*x + c2*y + 1)
y' = (b1*x + b2*y + b3) / (c1*x + c2*y + 1)
```

This allows for perspective transformations, rotations, scaling, and other affine transformations.

### Color Quantization

When `colorLimit` is specified, the algorithm uses an improved diversity-maximizing approach:

1. Samples colors from the image (for performance on large images)
2. Selects the most common color as the first palette entry
3. Iteratively adds colors that are most different from the existing palette (maximizing color diversity)
4. Maps each pixel to its nearest color in the reduced palette

This ensures the color palette represents the full range of colors in the image, preventing monocolor artifacts and creating more authentic pixel art with limited color palettes.

## Browser Compatibility

- Modern browsers with ES6 module support
- Canvas API support required
- WebGL support recommended for GPU acceleration (falls back to CPU if unavailable)
- File API support for file uploads

## Development

The code is written in vanilla JavaScript with ES6 modules. No build step is required - just serve the files through a local web server.

### Running Tests

```bash
# Run tests once
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage
```

## Testing

The project uses [Vitest](https://vitest.dev/) for testing. All core functionality is covered by unit tests:

- Pixelation functions (pixelateImage, pixelateImageEdgeAware, loadImage)
- Edge detection (calculateEdgeMap, calculateEdgeMapWebGL)
- Grid optimization (createInitialGrid, optimizeGridCorners, renderGrid)
- Projection transformations (applyProjection)
- Helper functions (identityMatrix, rotationMatrix, scaleMatrix)

Test files are located in the `test/` directory.
