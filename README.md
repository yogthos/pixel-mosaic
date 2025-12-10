# Pixel Art Generator

This project implementats a canvas-based techniques for pixelating images.

## Features

- **Simple Pixelation**: Scale down and up images with nearest-neighbor interpolation for crisp pixel art effects
- **Color Quantization**: Reduce color palette using a median cut algorithm
- **Projective Transformation**: Apply homography transformations for advanced image warping
- **Zero Dependencies**: Uses only native Canvas API - no external libraries required

## Installation

No installation required! Just clone or download this repository:

```bash
git clone https://git.sr.ht/~yogthos/pixel-mosaic
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

3. Upload an image and adjust the pixel size and color limit sliders

### Using as a Module

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

**Returns:** `HTMLCanvasElement|ImageData` - Pixelated image

**Example:**
```javascript
const pixelated = pixelateImage(myImage, 4, {
  returnCanvas: true,
  colorLimit: 16
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
import { pixelateImage, loadImage } from './src/pixelate.js';

const img = await loadImage('photo.jpg');
const pixelated = pixelateImage(img, 8, { returnCanvas: true });
document.body.appendChild(pixelated);
```

### Pixelation with Color Limiting

```javascript
const pixelated = pixelateImage(img, 6, {
  returnCanvas: true,
  colorLimit: 16  // Reduce to 16 colors
});
```

### Combining Pixelation and Projection

```javascript
import { pixelateImage } from './src/pixelate.js';
import { applyProjection, rotationMatrix } from './src/projection.js';

// First pixelate
const pixelated = pixelateImage(img, 5, { returnCanvas: true });

// Then apply transformation
const width = pixelated.width;
const height = pixelated.height;
const rotation = rotationMatrix(Math.PI / 6, width / 2, height / 2);
const transformed = applyProjection(pixelated, rotation, { returnCanvas: true });
```

## Technical Details

### Pixelation Algorithm

The pixelation process works by:

1. **Downscaling**: The source image is drawn to a smaller canvas (original size / pixelSize)
2. **Color Quantization** (optional): Colors are reduced using a median cut algorithm
3. **Upscaling**: The scaled-down image is drawn back to the original size with nearest-neighbor interpolation (image smoothing disabled)

This creates the characteristic blocky pixel art effect.

### Projective Transformation

The projection module implements homography transformations using a 3x3 matrix. The transformation maps points using:

```
x' = (a1*x + a2*y + a3) / (c1*x + c2*y + 1)
y' = (b1*x + b2*y + b3) / (c1*x + c2*y + 1)
```

This allows for perspective transformations, rotations, scaling, and other affine transformations.

### Color Quantization

When `colorLimit` is specified, the algorithm:

1. Builds a frequency map of all colors in the image
2. Selects the N most common colors (where N = colorLimit)
3. Maps each pixel to its nearest color in the reduced palette

This creates a more authentic pixel art look with limited color palettes.

## Browser Compatibility

- Modern browsers with ES6 module support
- Canvas API support required
- File API support for file uploads

## Development

The code is written in vanilla JavaScript with ES6 modules. No build step is required - just serve the files through a local web server.
