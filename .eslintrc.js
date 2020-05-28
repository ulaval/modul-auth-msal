module.exports = {
  ignorePatterns: ["node_modules", "dist", "*.d.ts"],
  extends: ["eslint:recommended", "plugin:prettier/recommended"],
  plugins: ["prettier"],
  parserOptions: {
    ecmaVersion: 2015,
  },
  env: {
    es6: true,
    node: true,
  },
  overrides: [
    {
      files: ["*.ts"],
      parser: "@typescript-eslint/parser",
      extends: [
        "eslint:recommended",
        "plugin:@typescript-eslint/eslint-recommended",
        "plugin:@typescript-eslint/recommended",
        "plugin:prettier/recommended",
      ],
      plugins: ["@typescript-eslint", "prettier"],
      rules: {
        "prettier/prettier": "error",
        "no-console": "error",
        "@typescript-eslint/interface-name-prefix": "off", // Helps differentiate interfaces from classes
      },
    },
  ],
};
