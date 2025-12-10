import { build } from 'esbuild';
import { minify } from 'html-minifier-terser';
import { readFileSync, writeFileSync, mkdirSync, cpSync, existsSync, unlinkSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const distDir = join(__dirname, 'dist');

// Create dist directory
if (!existsSync(distDir)) {
  mkdirSync(distDir, { recursive: true });
}

// Read the HTML file
const htmlContent = readFileSync(join(__dirname, 'index.html'), 'utf8');

// Extract the inline script
const scriptMatch = htmlContent.match(/<script type="module">([\s\S]*?)<\/script>/);
if (!scriptMatch) {
  throw new Error('Could not find inline script in HTML');
}

const inlineScript = scriptMatch[1];

// Create a temporary entry file that includes the inline script
const tempEntryFile = join(__dirname, '.temp-entry.js');
writeFileSync(tempEntryFile, inlineScript);

try {
  // Step 1: Bundle all JavaScript (including inline script and imports)
  console.log('Bundling JavaScript...');
  const bundleResult = await build({
    entryPoints: [tempEntryFile],
    bundle: true,
    minify: true,
    format: 'esm',
    write: false,
    resolveExtensions: ['.js', '.mjs'],
    absWorkingDir: __dirname
  });

  const bundledJs = bundleResult.outputFiles[0].text;

  // Step 2: Replace inline script with bundled version
  const newHtml = htmlContent.replace(
    /<script type="module">[\s\S]*?<\/script>/,
    `<script type="module">\n${bundledJs}\n</script>`
  );

  // Step 3: Minify HTML
  console.log('Minifying HTML...');
  const minifiedHtml = await minify(newHtml, {
    collapseWhitespace: true,
    removeComments: true,
    minifyCSS: true,
    minifyJS: false, // Already minified by esbuild
    removeAttributeQuotes: true,
    removeRedundantAttributes: true,
    removeScriptTypeAttributes: true,
    removeStyleLinkTypeAttributes: true,
    useShortDoctype: true
  });

  // Write minified HTML
  writeFileSync(join(distDir, 'index.html'), minifiedHtml);

  // Step 4: Copy image assets
  console.log('Copying image assets...');
  if (existsSync(join(__dirname, 'img'))) {
    cpSync(join(__dirname, 'img'), join(distDir, 'img'), { recursive: true });
  }

  console.log('✓ Build complete! Output in dist/ folder');
} finally {
  // Clean up temp file
  if (existsSync(tempEntryFile)) {
    unlinkSync(tempEntryFile);
  }
}
