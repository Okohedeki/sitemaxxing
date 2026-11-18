import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { sitemaxxing } from '@sitemaxxing/vite-plugin';

export default defineConfig({
  plugins: [react(), sitemaxxing()],
  server: { strictPort: true },
});
