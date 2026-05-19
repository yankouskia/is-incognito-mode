#!/usr/bin/env node
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');

const srcHtml = resolve(root, 'examples/browser/index.html');
const srcBundle = resolve(root, 'dist/index.js');
const destDir = resolve(root, 'docs-site/demo');
const destHtml = resolve(destDir, 'index.html');
const destBundle = resolve(destDir, 'is-incognito-mode.js');

mkdirSync(destDir, { recursive: true });

copyFileSync(srcBundle, destBundle);

const html = readFileSync(srcHtml, 'utf8').replace(
  /https:\/\/esm\.sh\/is-incognito-mode@\d+/g,
  './is-incognito-mode.js',
);
writeFileSync(destHtml, html);

console.log(`built docs-site/demo/ from ${srcHtml} + ${srcBundle}`);
