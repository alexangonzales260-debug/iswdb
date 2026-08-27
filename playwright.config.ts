import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/global-setup.ts',
  // Los tests comparten el fixture de la BD local; se ejecutan en secuencia.
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry'
  },
  webServer: {
    command: 'npm run build && npm start',
    port: 3000,
    reuseExistingServer: true,
    timeout: 180_000
  }
})
