module.exports = {
  root: true,
  env: {
    node: true,
    es2022: true,
  },
  extends: [
    "eslint:recommended",
    "@typescript-eslint/recommended",
    "prettier",
  ],
  parser: "@typescript-eslint/parser",
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: "module",
  },
  plugins: ["@typescript-eslint"],
  rules: {
    "@typescript-eslint/no-unused-vars": "error",
    "@typescript-eslint/no-explicit-any": "warn",
    "prefer-const": "error",
    "no-var": "error",
  },
  ignorePatterns: ["dist/", "node_modules/"],
};