import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const host = "127.0.0.1";
const port = 4173;

const contentTypes = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".mjs", "text/javascript; charset=utf-8"],
  [".svg", "image/svg+xml"],
  [".ts", "text/plain; charset=utf-8"],
]);

function resolveRequestPath(requestUrl) {
  const url = new URL(requestUrl, `http://${host}:${port}`);
  const relativePath = decodeURIComponent(url.pathname);
  const requestedPath = path.normalize(path.join(root, relativePath));

  if (!requestedPath.startsWith(root)) {
    return null;
  }

  return requestedPath;
}

async function getFilePath(requestPath) {
  const details = await stat(requestPath).catch(() => null);

  if (!details) {
    return null;
  }

  if (details.isDirectory()) {
    const indexPath = path.join(requestPath, "index.html");
    const indexDetails = await stat(indexPath).catch(() => null);
    return indexDetails?.isFile() ? indexPath : null;
  }

  return details.isFile() ? requestPath : null;
}

const server = createServer(async (request, response) => {
  if (!request.url) {
    response.writeHead(400).end("Bad Request");
    return;
  }

  const requestPath = resolveRequestPath(request.url);

  if (!requestPath) {
    response.writeHead(403).end("Forbidden");
    return;
  }

  const filePath = await getFilePath(requestPath);

  if (!filePath) {
    response.writeHead(404).end("Not Found");
    return;
  }

  const contentType = contentTypes.get(path.extname(filePath)) ?? "application/octet-stream";

  response.writeHead(200, {
    "Cache-Control": "no-store",
    "Content-Type": contentType,
  });

  createReadStream(filePath).pipe(response);
});

server.on("error", (error) => {
  if (error.code === "EADDRINUSE") {
    console.error(
      `Port ${port} is already in use. If the visualizer is already running, open http://${host}:${port}/example/`,
    );
    process.exit(1);
  }

  throw error;
});

server.listen(port, host, () => {
  console.log(`Visualizer server running at http://${host}:${port}/example/`);
});
