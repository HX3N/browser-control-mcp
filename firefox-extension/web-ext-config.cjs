module.exports = {
  ignoreFiles: [
    "*.ts",
    "__tests__",
    "__tests__/**",
    "types",
    "types/**",
    "node_modules/**",
    "jest.config.js",
    "tsconfig.json",
    "nx.json",
    "package.json",
    "package-lock.json",
    "web-ext-config.cjs",
  ],
  build: {
    overwriteDest: true,
  },
};
