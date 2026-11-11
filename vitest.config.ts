import { defineConfig } from 'vitest/config'

/**
 * The checkout had no client test stack (README: "npm test is not defined").
 * Phase F of the AI-assistant web session requires API-client, UI and
 * integration tests, so Vitest + jsdom + React Testing Library are added as
 * devDependencies. Nothing here touches the app bundle: tests live outside
 * the Vite build entry and are never imported by src/main.tsx.
 */
export default defineConfig({
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    restoreMocks: true,
    clearMocks: true,
    // Globals so Testing Library can auto-register its DOM cleanup hook.
    globals: true,
  },
})
