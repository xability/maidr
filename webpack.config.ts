import path from "path";
import { Configuration } from "webpack";

const config: Configuration = {
  entry: "./src/index.ts", // Entry point of MAIDR application
  output: {
    filename: "bundle.js", // Output file
    path: path.resolve(__dirname, "dist"), // Output directory
  },
  resolve: {
    extensions: [".ts", ".js", ".tsx"], // Resolve TypeScript and JavaScript files
  },
  module: {
    rules: [
      {
        test: /\.(ts|tsx)$/, // Apply this rule to .ts and .tsx files
        use: "ts-loader", // Use ts-loader to transpile TypeScript files
        exclude: /node_modules/, // Exclude node_modules from transpilation
      },
    ],
  },
  devtool: "source-map", // Enable source maps for debugging
  mode: "development", // Set the mode (development or production)
};

export default config;
