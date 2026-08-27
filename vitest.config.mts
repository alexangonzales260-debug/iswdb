import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      '@': resolve(fileURLToPath(new URL('.', import.meta.url)))
    }
  },
  test: {
    // Los tests de BD comparten la misma BD local (cleanups globales);
    // se ejecutan en secuencia para evitar carreras entre archivos.
    fileParallelism: false
  }
})
