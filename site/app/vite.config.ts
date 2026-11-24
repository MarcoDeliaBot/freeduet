import path from "path";
import { fileURLToPath } from "url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// This file is for `npm run dev` (English only, no prerender). The built pages come from scripts/build.mjs
// (`npm run build`), which sets up its own client and server builds.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  publicDir: false,
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
});
