import { defineConfig } from 'vite';

// La simulación vive en un Web Worker como módulo ES (mismo código que luego
// correrá en el servidor Node para multiplayer, sin reescritura).
export default defineConfig({
  worker: { format: 'es' },
  build: { target: 'es2020' },
});
