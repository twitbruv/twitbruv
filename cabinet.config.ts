import { defineConfig } from '@cabinetdocs/cli'

export default defineConfig({
  title: 'twitbruv',
  description: 'UI Component Library',
  framework: 'react',
  content: './docs/content',
  examples: './docs/examples',
  styles: './packages/ui/src/styles/globals.css',
  componentLib: '@workspace/ui',
  componentLibDir: './packages/ui/src',
  staticDirs: ['./docs/public'],
})
