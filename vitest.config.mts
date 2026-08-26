import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // Los tests de BD comparten la misma BD local (cleanups globales);
    // se ejecutan en secuencia para evitar carreras entre archivos.
    fileParallelism: false
  }
})
