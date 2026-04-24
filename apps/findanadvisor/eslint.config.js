import defaultConfig from "@epic-web/config/eslint";

/** @type {import("eslint").Linter.Config[]} */
export default [
  ...defaultConfig,
  {
    ignores: ["client/dist/**", "server/dist/**", "node_modules/**", "coverage/**"],
  },
];
