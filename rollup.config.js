'use strict';

const babel = require('rollup-plugin-babel');
const { builtinModules } = require('module');
const commonjs = require('rollup-plugin-commonjs');
const path = require('path');
const pkg = require('./package.json');
const resolve = require('rollup-plugin-node-resolve');
const { terser } = require('rollup-plugin-terser');

/** @type {import('rollup').RollupOptions} */
const baseConfig = {
  input: './index.js',
  external: Object.keys(pkg.dependencies).concat(builtinModules),
  plugins: [
    resolve(),
    commonjs(),
    babel({
      exclude: ['node_modules/**']
    })
  ]
};

/** @type {Array<import('rollup').RollupOptions>} */
const config = [{
  ...baseConfig,
  output: {
    format: 'esm',
    file: path.join(__dirname, './dist/isIncognito.esm.js')
  }
}, {
  ...baseConfig,
  output: {
    format: 'cjs',
    file: path.join(__dirname, './dist/isIncognito.js')
  }
}, {
  ...baseConfig,
  output: {
    format: 'umd',
    name: 'isIncognito',
    file: path.join(__dirname, './dist/isIncognito.umd.min.js')
  },
  external: [],
  plugins: baseConfig.plugins.concat(terser())
}];

module.exports = config;
