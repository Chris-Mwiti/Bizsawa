import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig(({ command }) => ({
  plugins: [react(), tailwindcss()],
  envPrefix: ['VITE_', 'CLERK_'],
  // Production bundles ship without console/debugger statements. Dev keeps
  // full logging.
  build:
    command === 'build'
      ? {
          minify: 'oxc',
          rolldownOptions: {
            output: {
              minify: {
                compress: {
                  dropConsole: true,
                  dropDebugger: true,
                },
              },
            },
          },
        }
      : {},
}))
