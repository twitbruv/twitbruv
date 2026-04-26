import tailwindcss from "@tailwindcss/vite"
import { tanstackStart } from "@tanstack/react-start/plugin/vite"
import viteReact from "@vitejs/plugin-react"
import { nitro } from "nitro/vite"
import { defineConfig } from "vite"
import viteTsConfigPaths from "vite-tsconfig-paths"

const config = defineConfig({
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
