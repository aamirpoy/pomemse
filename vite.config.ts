// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

export default defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
  vite: {
    build: {
      rollupOptions: {
        output: {
          // Keep the passkey libraries in their own chunk, with the reflect polyfill first,
          // so shared helpers never pull tsyringe into every page.
          manualChunks(id: string) {
            if (/node_modules\/(reflect-metadata|tsyringe|@peculiar|@simplewebauthn|asn1js|pvtsutils|pvutils|@levischuck)\//.test(id)) return "webauthn";
          },
        },
      },
    },
  },
});
