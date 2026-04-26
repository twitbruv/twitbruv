import { defineConfig } from "vite"
import { tanstackStart } from "@tanstack/react-start/plugin/vite"
import viteReact from "@vitejs/plugin-react"
import viteTsConfigPaths from "vite-tsconfig-paths"
import tailwindcss from "@tailwindcss/vite"
import { nitro } from "nitro/vite"

const config = defineConfig({
  // Load .env from the monorepo root so VITE_PUBLIC_* lives in the same file
  // as the API/worker env vars instead of a separate apps/web/.env.
  envDir: "../..",
  server: {
    port: 3000,
    strictPort: true,
  },
  plugins: [
    nitro(),
    viteTsConfigPaths({
      projects: ["./tsconfig.json"],
    }),
    tailwindcss(),
    tanstackStart(),
    viteReact(),
  ],
  resolve: {
    dedupe: ["react", "react-dom"],
  },
  // @vercel/og ships its own Yoga + resvg WASM. Vite's pre-bundler cannot rewrite
  // those import.meta.url WASM references, so we keep the package external on the
  // SSR side and let Node resolve it directly at runtime. Sharp is a native module
  // and must also stay external — Node loads its prebuilt binary; bundling breaks it.
  ssr: {
    external: ["@vercel/og", "sharp"],
  },
})

export default config
