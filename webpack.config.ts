import type { Configuration } from 'webpack';
import path from 'node:path';

const config: Configuration = {
  entry: './src/index.ts', // Entry point of MAIDR application
  output: {
    filename: 'maidr.js', // Output file
    path: path.resolve(__dirname, 'dist'), // Output directory
    clean: true, // Remove `dist` before building
  },
  resolve: {
    extensions: ['.ts', '.js', '.tsx'], // Resolve TypeScript and JavaScript files
    alias: {
      '@command': path.resolve(__dirname, 'src/command'),
      '@model': path.resolve(__dirname, 'src/model'),
      '@state': path.resolve(__dirname, 'src/state'),
      '@service': path.resolve(__dirname, 'src/service'),
      '@type': path.resolve(__dirname, 'src/type'),
      '@ui': path.resolve(__dirname, 'src/ui'),
      '@util': path.resolve(__dirname, 'src/util'),
    },
  },
  module: {
    rules: [
      {
        test: /\.(ts|tsx)$/, // Apply this rule to .ts and .tsx files
        use: 'ts-loader', // Use ts-loader to transpile TypeScript files
        exclude: /node_modules/, // Exclude node_modules from transpilation
      },
      {
        test: /\.css$/, // Apply this rule to .css files
        use: ['style-loader', 'css-loader'], // Use style-loader and css-loader
      },
    ],
  },
  devtool: 'source-map', // Enable source maps for debugging
  mode: 'development', // Set the mode (development or production)
};

export default config;
