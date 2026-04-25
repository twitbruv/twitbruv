//  @ts-check

import { tanstackConfig } from "@tanstack/eslint-config"

export default [
  // public/ contains static assets (incl. the service worker) shipped as-is.
  // ESLint expects every file matched by parserOptions.project to be in the
  // tsconfig, which sw.js isn't — and we don't want it to be (it runs in a
  // ServiceWorker scope, not the app's TS pipeline). .output/ is the
  // TanStack-Start build directory and routeTree.gen.ts is generated.
  { ignores: [".output/**", "public/**", "dist/**", "src/routeTree.gen.ts"] },
  ...tanstackConfig,
]
