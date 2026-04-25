import { defineConfig } from "vite"
import { tanstackStart } from "@tanstack/react-start/plugin/vite"
import viteReact from "@vitejs/plugin-react"
import viteTsConfigPaths from "vite-tsconfig-paths"
import tailwindcss from "@tailwindcss/vite"
import { nitro } from "nitro/vite"

const config = defineConfig({
  plugins: [
    nitro(),
    viteTsConfigPaths({
      projects: ["./tsconfig.json"],
    }),
    tailwindcss(),
    tanstackStart(),
    viteReact(),
  ],
  // @vercel/og ships its own Yoga + resvg WASM. Vite's pre-bundler cannot rewrite
  // those import.meta.url WASM references, so we keep the package external on the
  // SSR side and let Node resolve it directly at runtime.
  ssr: {
    external: ["@vercel/og"],
  },
})

export default config
