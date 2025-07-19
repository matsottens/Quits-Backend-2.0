#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// ESM-friendly __dirname replacement
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Resolve project root (location of this script is <root>/scripts)
const root = path.resolve(__dirname, '..');
const envSrc = path.join(root, '.env');

if (!fs.existsSync(envSrc)) {
  console.error('prepare-env: No .env found at project root. Create one or copy from .env.example');
  process.exit(1);
}

// Ensure target directories exist before copying
const targets = [
  path.join(root, 'backend', '.env'),
  path.join(root, 'frontend', '.env')
];

for (const dest of targets) {
  try {
    const srcContent = fs.readFileSync(envSrc);
    let needsWrite = true;
    if (fs.existsSync(dest)) {
      const destContent = fs.readFileSync(dest);
      needsWrite = !srcContent.equals(destContent);
    }
    if (needsWrite) {
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.copyFileSync(envSrc, dest);
      console.log(`prepare-env: Copied .env → ${path.relative(root, dest)}`);
    }
  } catch (err) {
    console.error(`prepare-env: Failed to copy to ${dest}:`, err);
  }
} 