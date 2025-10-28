// webpack.main.config.js
const path = require('path');
const CopyWebpackPlugin = require('copy-webpack-plugin');

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
    'node-pty': 'commonjs2 node-pty',
    'node-addon-api': 'commonjs2 node-addon-api',
    'bufferutil': 'commonjs2 bufferutil',
    'utf-8-validate': 'commonjs2 utf-8-validate',
  },
  plugins: [
    new CopyWebpackPlugin({
      patterns: [
        {
          from: 'node_modules/node-pty',
          to: 'node_modules/node-pty',
        },
        { from: 'public/index.html', to: 'main_window/index.html' },
      ],
    }),
  ],
  target: 'electron-main',
};
