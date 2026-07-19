import eslint from "@eslint/js";

export default [
  {
    ignores: [
      "dist/**",
      "assets/**",
      ".agents/**",
      ".ai/**",
      ".claude/**",
      ".codex/**",
    ],
  },
  eslint.configs.recommended,
  {
    files: ["**/*.mjs"],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: "module",
      globals: {
        AbortSignal: "readonly",
        Buffer: "readonly",
        Headers: "readonly",
        URL: "readonly",
        console: "readonly",
        fetch: "readonly",
        process: "readonly",
        setTimeout: "readonly",
      },
    },
    rules: {
      "no-console": "off",
      "no-control-regex": "off"
    }
  },
  {
    files: ["scripts/ai-engineering-analytics.mjs", "scripts/generate-engineering-analytics.mjs"],
    rules: {
      "no-unused-vars": "off"
    }
  }
];
