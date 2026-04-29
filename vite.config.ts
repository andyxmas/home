import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { manualSyncApiPlugin } from './src/server/dev-manual-sync-api-plugin'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), manualSyncApiPlugin()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
  },
})
