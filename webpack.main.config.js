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
    projectAnalysisWorker: './electron/workers/projectAnalysisWorker.ts',
  },
  module: {
    rules: [
      {
        test: /\.ts$/,
        include: [
          path.resolve(__dirname, 'electron'),
          path.resolve(__dirname, 'electron/handlers'),
          path.resolve(__dirname, 'common'),
        ],
        use: [{ loader: 'ts-loader' }],
      },
      {
        test: /\.json$/,
        include: [
          path.resolve(__dirname, 'src/config'),
        ],
        type: 'json',
      },
    ],
  },
  resolve: {
    extensions: ['.ts', '.js', '.json'],
    alias: {
      'genai-lite/utils': path.resolve(__dirname, 'node_modules/genai-lite/dist/utils/index.js'),
    },
  },
  output: {
    path: path.resolve(__dirname, '.webpack'),
    filename: '[name].js',
  },
  externals: {
    'node-addon-api': 'commonjs2 node-addon-api',
    'bufferutil': 'commonjs2 bufferutil',
    'utf-8-validate': 'commonjs2 utf-8-validate',
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
