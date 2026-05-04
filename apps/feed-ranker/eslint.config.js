// @ts-check

import { tanstackConfig } from "@tanstack/eslint-config"

export default [
  { ignores: ["dist/**", ".output/**", "eslint.config.js"] },
  ...tanstackConfig,
]
