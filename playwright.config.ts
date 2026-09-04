import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/global-setup.ts',
  // Los tests comparten el fixture de la BD local; se ejecutan en secuencia.
  workers: 1,
  reporter: [['list']],
  // baseURL = http://localhost:3000, el dominio canónico (site_url de
  // supabase/config.toml, NEXT_PUBLIC_SITE_URL y browser client coinciden). Al
  // unificar browser + redirectTo + site_url en localhost, las cookies de
  // sesión/code_verifier (server actions) quedan en localhost y el callback los
  // recibe → el exchange PKCE no falla por mismatch de host.
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
