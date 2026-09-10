import js from "@eslint/js";
import tseslint from "@typescript-eslint/eslint-plugin";
import tsparser from "@typescript-eslint/parser";

export default [
  { ignores: ["dist/**", "dist-electron/**", "release/**", "node_modules/**"] },
  js.configs.recommended,
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      parser: tsparser,
      parserOptions: { ecmaVersion: "latest", sourceType: "module" },
      globals: {
        window: "readonly",
        document: "readonly",
        localStorage: "readonly",
        console: "readonly",
        crypto: "readonly",
        fetch: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly",
        AbortController: "readonly",
        URL: "readonly",
        URLSearchParams: "readonly",
        TextEncoder: "readonly",
        btoa: "readonly",
        atob: "readonly",
        escape: "readonly",
        unescape: "readonly",
        navigator: "readonly",
        HTMLInputElement: "readonly",
        __dirname: "readonly",
        process: "readonly",
        Buffer: "readonly",
        Electron: "readonly",
      },
    },
    plugins: { "@typescript-eslint": tseslint },
    rules: { ...tseslint.configs.recommended.rules },
  },
];
