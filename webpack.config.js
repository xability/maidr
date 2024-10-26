const path = require('path');

module.exports = {
  entry: './src/index.ts', // Entry point of your application
  output: {
    filename: 'bundle.js', // Output file
    path: path.resolve(__dirname, 'dist'), // Output directory
  },
  resolve: {
    extensions: ['.ts', '.js'], // Resolve TypeScript and JavaScript files
  },
  module: {
    rules: [
      {
        test: /\.ts$/, // Apply this rule to .ts files
        use: 'ts-loader', // Use ts-loader to transpile TypeScript files
        exclude: /node_modules/, // Exclude node_modules from transpilation
      },
      {
        test: /\.html$/,
        use: 'html-loader',
      },
    ],
  },
  devtool: 'source-map', // Enable source maps for debugging
  mode: 'development', // Set the mode (development or production)
};
