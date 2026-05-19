#!/usr/bin/env node
import { copyFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');

const src = resolve(root, 'examples/browser/index.html');
const destDir = resolve(root, 'docs-site/demo');
const dest = resolve(destDir, 'index.html');

mkdirSync(destDir, { recursive: true });
copyFileSync(src, dest);

console.log(`copied ${src} -> ${dest}`);
