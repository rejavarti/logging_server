#!/usr/bin/env node
/**
 * Sync selected frontend library distribution assets into public/vendor
 * Enables offline/container operation without external CDNs (Font Awesome, Muuri, ECharts, Chart.js, chartjs-chart-matrix)
 */
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const pubVendor = path.join(root, 'public', 'vendor');

function ensureDir(p){ if(!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true }); }
ensureDir(pubVendor);

function copyFile(src, dest){
  if(!fs.existsSync(src)) { console.warn('Missing asset:', src); return; }
  ensureDir(path.dirname(dest));
  fs.copyFileSync(src, dest);
  console.log('Copied', path.relative(root, src), '->', path.relative(root, dest));
}

// Asset map: source (node_modules) -> destination (public/vendor)
const assets = [
  // Font Awesome CSS
  ['node_modules/@fortawesome/fontawesome-free/css/all.min.css', 'public/vendor/fontawesome/css/all.min.css'],
  // Muuri
  ['node_modules/muuri/dist/muuri.min.js', 'public/vendor/muuri/muuri.min.js'],
  // ECharts
  ['node_modules/echarts/dist/echarts.min.js', 'public/vendor/echarts/echarts.min.js'],
  // Chart.js (both UMD variants for flexibility)
  ['node_modules/chart.js/dist/chart.umd.min.js', 'public/vendor/chart.js/chart.umd.min.js'],
  ['node_modules/chart.js/dist/chart.umd.js', 'public/vendor/chart.js/chart.umd.js'],
  // Chart.js Matrix Plugin
  ['node_modules/chartjs-chart-matrix/dist/chartjs-chart-matrix.min.js', 'public/vendor/chartjs-chart-matrix/chartjs-chart-matrix.min.js'],
];

assets.forEach(([src, dest]) => copyFile(path.join(root, src), path.join(root, dest)));

// Copy Font Awesome webfonts directory
const faFontsSrc = path.join(root, 'node_modules/@fortawesome/fontawesome-free/webfonts');
const faFontsDest = path.join(pubVendor, 'fontawesome', 'webfonts');
ensureDir(faFontsDest);
if (fs.existsSync(faFontsSrc)) {
  for (const file of fs.readdirSync(faFontsSrc)) {
    copyFile(path.join(faFontsSrc, file), path.join(faFontsDest, file));
  }
} else {
  console.warn('Font Awesome webfonts directory missing:', faFontsSrc);
}

console.log('Vendor asset sync complete.');
