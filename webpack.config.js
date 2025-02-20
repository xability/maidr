const path = require('node:path');

module.exports = {
  entry: './src/index.ts',
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: 'ts-loader',
        exclude: /node_modules/,
      },
    ],
  },
  resolve: {
    extensions: ['.tsx', '.ts', '.js'],
    alias: {
      '@command': path.resolve(__dirname, 'src/command'),
      '@model': path.resolve(__dirname, 'src/model'),
      '@redux': path.resolve(__dirname, 'src/redux'),
      '@service': path.resolve(__dirname, 'src/service'),
      '@ui': path.resolve(__dirname, 'src/ui'),
      '@util': path.resolve(__dirname, 'src/util'),
    },
  },
  output: {
    filename: 'maidr.js',
    path: path.resolve(__dirname, 'dist'),
  },
  devServer: {
    static: {
      directory: path.join(__dirname),
    },
    compress: true,
    port: 9000,
  },
};
