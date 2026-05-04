/**
 * Build script for tree-sitter-actionscript native binding.
 *
 * Compiles the vendored tree-sitter-actionscript grammar into a native
 * Node.js addon. Runs as part of npm install (optional dependency).
 *
 * Exit code 0 on success, 1 on failure (non-fatal — ActionScript parsing
 * falls back to standalone regex processor).
 */

const { execFileSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const GRAMMAR_DIR = path.resolve(__dirname, '..', 'vendor', 'tree-sitter-actionscript');

if (!fs.existsSync(path.join(GRAMMAR_DIR, 'package.json'))) {
  console.log('[actionscript] Vendored grammar not found — skipping native build.');
  process.exit(0);
}

try {
  console.log('[actionscript] Building tree-sitter-actionscript native binding...');
  execFileSync('npx', ['node-gyp', 'rebuild'], {
    cwd: GRAMMAR_DIR,
    timeout: 180_000,
    stdio: 'pipe',
  });
  console.log('[actionscript] Native binding built successfully.');
} catch (err) {
  console.warn(
    '[actionscript] Native binding build failed — falling back to standalone regex parser.',
  );
  console.warn('[actionscript] Error:', err.message || err);
  process.exit(0); // Non-fatal
}
