import js from "@eslint/js";
import globals from "globals";

export default [
  js.configs.recommended,
  {
    files: ["src/**/*.js"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: { ...globals.browser, ...globals.worker, JSZip: "readonly", gather: "readonly" }
    },
    rules: {
      "no-unused-vars": ["warn", { args: "none", caughtErrors: "none", varsIgnorePattern: "^_" }],
      "no-console": "off",
      "no-empty": ["error", { allowEmptyCatch: true }],
      eqeqeq: ["warn", "smart"],
      "prefer-const": "warn"
    }
  },
  {
    files: ["build.js", "tools/**/*.js"],
    languageOptions: { ecmaVersion: 2022, sourceType: "module", globals: { ...globals.node } },
    rules: { "no-unused-vars": ["warn", { args: "none", caughtErrors: "none" }] }
  },
  {
    files: ["tests/**/*.js"],
    languageOptions: { ecmaVersion: 2022, sourceType: "module", globals: { ...globals.node, ...globals.browser } },
    rules: { "no-unused-vars": ["warn", { args: "none", caughtErrors: "none" }] }
  },
  { ignores: ["node_modules/", "index.html", "worker.js", "vendor/", "test-results/", "playwright-report/"] }
];
