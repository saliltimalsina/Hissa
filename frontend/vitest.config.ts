import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// Separate config from vite.config.ts so the dev/build pipeline stays lean and
// the test runner gets its own jsdom environment + jest-dom matchers.
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    // Unit tests only — Playwright owns e2e under /e2e.
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    css: false,
  },
});
