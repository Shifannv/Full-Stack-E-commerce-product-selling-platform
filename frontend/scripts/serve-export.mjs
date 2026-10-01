// Local-only static export server for browser verification. No request/URL logging.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../out/", import.meta.url));
const types = {
  ".html": "text/html",
  ".css": "text/css",
  ".js": "application/javascript",
  ".json": "application/json",
  ".txt": "text/plain",
  ".woff2": "font/woff2",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
};
createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(
      new URL(request.url, "http://127.0.0.1").pathname,
    );
    const base = resolve(root, `.${pathname}`);
    if (base !== resolve(root) && !base.startsWith(resolve(root) + sep)) {
      response.writeHead(403).end();
      return;
    }
    for (const file of [base, base + ".html", resolve(base, "index.html")]) {
      if (!file.startsWith(resolve(root) + sep)) continue;
      try {
        const body = await readFile(file);
        response
          .writeHead(200, {
            "Content-Type": types[extname(file)] ?? "application/octet-stream",
            "Referrer-Policy": "no-referrer",
          })
          .end(body);
        return;
      } catch (error) {
        if (!["ENOENT", "EISDIR", "EPERM", "ENOTDIR"].includes(error.code))
          throw error;
      }
    }
    response.writeHead(404).end("Not found");
  } catch {
    response.writeHead(400).end("Invalid request");
  }
}).listen(3000, "127.0.0.1", () =>
  console.log("Static export verification server: http://127.0.0.1:3000"),
);
