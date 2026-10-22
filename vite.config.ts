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
    plugins: [
      {
        // tsyringe (used by the face/fingerprint library) throws on load unless the
        // reflect polyfill runs first; prepend it so the server can start.
        name: "tsyringe-reflect-polyfill",
        enforce: "pre",
        transform(code: string, id: string) {
          if (/node_modules\/tsyringe\/dist\/esm5\/index\.js/.test(id)) {
            return { code: `import "reflect-metadata";\n${code}`, map: null };
          }
          return null;
        },
      },
    ],
  },
});
