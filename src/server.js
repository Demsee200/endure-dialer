import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const PORT = Number(process.env.PORT) || 3000;
const ROOT = resolve(process.cwd());

const server = createServer(async (req, res) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");

  const url = new URL(
    req.url || "/",
    "http://localhost"
  );

  if (url.pathname === "/api/health") {
    res.writeHead(200, {
      "Content-Type": "application/json"
    });
    res.end(JSON.stringify({
      status: "online",
      application: "Endure Dialer",
      version: "0.1.0",
      callingEnabled: false
    }));
    return;
  }

  if (
    req.method !== "GET" &&
    req.method !== "HEAD"
  ) {
    res.writeHead(405);
    res.end("Method not allowed");
    return;
  }

  if (
    url.pathname !== "/" &&
    url.pathname !== "/index.html"
  ) {
    res.writeHead(404);
    res.end("Not found");
    return;
  }

  try {
    const html = await readFile(
      resolve(ROOT, "index.html")
    );

    res.writeHead(200, {
      "Content-Type": "text/html; charset=utf-8"
    });

    res.end(req.method === "HEAD" ? undefined : html);
  } catch {
    res.writeHead(500);
    res.end("Application could not load");
  }
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(
    `Endure Dialer running on port ${PORT}`
  );
});
