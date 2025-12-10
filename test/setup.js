// Setup file for Vitest to provide ImageData in jsdom environment
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
  url: 'http://localhost',
  pretendToBeVisual: true,
  resources: 'usable',
});

global.window = dom.window;
global.document = dom.window.document;
global.ImageData = dom.window.ImageData;
global.HTMLImageElement = dom.window.HTMLImageElement;
global.HTMLCanvasElement = dom.window.HTMLCanvasElement;

// Make ImageData available globally
if (typeof global.ImageData === 'undefined') {
  // Fallback: create ImageData from canvas context
  const canvas = dom.window.document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  global.ImageData = ctx.createImageData(1, 1).constructor;
}

