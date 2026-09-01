import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/global-setup.ts',
  // Los tests comparten el fixture de la BD local; se ejecutan en secuencia.
  workers: 1,
  reporter: [['list']],
  // baseURL = http://127.0.0.1:3000, el mismo origin canónico que el site_url
  // de supabase/config.toml y NEXT_PUBLIC_SITE_URL (ver .env.example). Si fuera
  // localhost, las cookies de sesión/code_verifier (server actions) se quedarían
  // en el dominio localhost y el callback de recuperación (que redirige a
  // http://127.0.0.1:3000/auth/reset) no las recibiría → exchange PKCE falla.
  use: {
    baseURL: 'http://127.0.0.1:3000',
    trace: 'on-first-retry'
  },
  webServer: {
    command: 'npm run build && npm start',
    port: 3000,
    reuseExistingServer: true,
    timeout: 180_000
  }
})
