const path = require('path');
const webpack = require('webpack');
const { execSync } = require('child_process');
const isEnvDevelopment = process.env.NODE_ENV === 'development';

// Get git version
let gitVersion = `v${require('./package.json').version}`;
try {
  gitVersion = execSync('git describe --tags').toString().trim();
} catch (e) {
  console.warn('Could not get git describe output. Falling back to package.json version.');
}

module.exports = {
  mode: isEnvDevelopment ? 'development' : 'production',
  entry: ['./src/index.tsx'],
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        include: [/src/, path.resolve(__dirname, 'electron')],
        use: [{ loader: 'ts-loader' }],
      },
      {
        test: /\.css$/,
        use: ['style-loader', 'css-loader', 'postcss-loader'],
      },
    ],
  },
  plugins: [
    new webpack.DefinePlugin({
      'GIT_VERSION': JSON.stringify(gitVersion),
    }),
  ],
  resolve: {
    extensions: ['.tsx', '.ts', '.js'],
    fallback: {
      buffer: false,
      stream: require.resolve('stream-browserify'),
      timers: require.resolve('timers-browserify'),
    },
  },
  target: 'web',
  performance: {
    hints: isEnvDevelopment ? false : 'warning',
  },

  devServer: {
    hot: true,
    client: {
      overlay: {
        errors: true, // Show overlay for errors
        warnings: false, // Do NOT show overlay for warnings
      },
    },
  },
};
