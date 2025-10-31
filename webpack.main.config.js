// webpack.main.config.js
const path = require('path');
const webpack = require('webpack');
const { execSync } = require('child_process');
const CopyWebpackPlugin = require('copy-webpack-plugin');

// Get git version
let gitVersion = `v${require('./package.json').version}`;
try {
  gitVersion = execSync('git describe --tags').toString().trim();
} catch (e) {
  console.warn('Could not get git describe output. Falling back to package.json version.');
}

module.exports = {
  entry: {
    'main/index': './electron/main.ts',
  },
  module: {
    rules: [
      {
        test: /\.ts$/,
        include: [
          path.resolve(__dirname, 'electron'),
          path.resolve(__dirname, 'electron/handlers'),
          path.resolve(__dirname, 'common'),
          path.resolve(__dirname, 'src'),
        ],
        use: [{ loader: 'ts-loader' }],
      },
    ],
  },
  resolve: {
    extensions: ['.ts', '.js', '.json'],
  },
  output: {
    path: path.resolve(__dirname, '.webpack'),
    filename: '[name].js',
  },
  externals: {
    'node-addon-api': 'commonjs2 node-addon-api',
  },
  plugins: [
    new CopyWebpackPlugin({
      patterns: [
        { from: 'public/index.html', to: 'main_window/index.html' },
      ],
    }),
    new webpack.DefinePlugin({
      'GIT_VERSION': JSON.stringify(gitVersion),
    }),
  ],
  target: 'electron-main',
};
