// Prints the static SVG of a mascot (default Iris), drawn by the page's own FreeDuetMascot component with animation off.
// brand/og-image.html holds the result inline. Usage (from site/app):  node scripts/iris-markup.mjs [id] [size]
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import fs from "node:fs";
import { build } from "esbuild";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const tmp = path.join(APP, ".ssr", "iris");
fs.mkdirSync(tmp, { recursive: true });
fs.writeFileSync(
  path.join(tmp, "entry.tsx"),
  `import { renderToStaticMarkup } from "react-dom/server";
   import { FreeDuetMascot } from "${path.join(APP, "src/components/FreeDuetMascot").replace(/\\/g, "/")}";
   export const svg = (id: any, size: number) => renderToStaticMarkup(<FreeDuetMascot id={id} size={size} mood="done" animated={false} showSparkles />);`,
);
await build({
  entryPoints: [path.join(tmp, "entry.tsx")],
  outfile: path.join(tmp, "entry.mjs"),
  bundle: true, format: "esm", platform: "node", jsx: "automatic", logLevel: "error",
  external: ["react", "react-dom", "framer-motion"], absWorkingDir: APP,
});
const m = await import(pathToFileURL(path.join(tmp, "entry.mjs")).href);
process.stdout.write(m.svg(process.argv[2] || "iris", Number(process.argv[3] || 420)));
fs.rmSync(path.join(APP, ".ssr"), { recursive: true, force: true });
