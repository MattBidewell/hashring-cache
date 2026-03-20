import { cp, mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const docsDir = path.join(root, "docs");
const docsExampleDir = path.join(docsDir, "example");
const exampleDir = path.join(root, "example");

await rm(docsDir, { recursive: true, force: true });
await mkdir(docsExampleDir, { recursive: true });

await cp(exampleDir, docsExampleDir, { recursive: true });

await writeFile(path.join(docsDir, "index.html"), buildRedirectPage("./example/"), "utf8");
await writeFile(path.join(docsDir, ".nojekyll"), "", "utf8");

console.log(`GitHub Pages assets written to ${path.relative(root, docsDir)}`);

function buildRedirectPage(target) {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta http-equiv="refresh" content="0; url=${target}" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Hash Ring Visualizer</title>
  </head>
  <body>
    <p>Redirecting to <a href="${target}">the visualizer</a>...</p>
  </body>
</html>
`;
}
