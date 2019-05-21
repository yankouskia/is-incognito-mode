const path = require('path');

module.exports = {
  mode: process.env.NODE_ENV === 'production' ? 'production' : 'development',
  entry: {
    isIncognito: './index.js',
  },
  output: {
    library: 'isIncognito',
    libraryTarget: 'umd',
    filename: '[name].js',
    path: __dirname + '/dist',
  },
  module: {
    rules: [
      {
        test: /\.js$/,
        exclude: /node_modules/,
        use: {
          loader: 'babel-loader',
          options: {
            presets: [['@babel/preset-env', {
              targets: {
                browsers: ['> 0.25%'],
              }
            }]]
          }
        }
      }
    ]
  }
}
