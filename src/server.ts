import { existsSync, readFileSync } from "node:fs";
import { createServer } from "node:http";
import { extname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  defaultQuery,
  isPhase,
  isSchemaId,
  isStrategyId,
  isToolsId,
  runCell,
  runRevise,
  runSkeptic,
  schemaAxis,
  strategyAxis,
  toolsAxis,
  type Note,
} from "./run";

const port = Number(process.env.PORT) || 3000;
const webRoot = fileURLToPath(new URL("../web", import.meta.url));
const cache = new Map<string, Awaited<ReturnType<typeof runCell>>>();

const types: Record<string, string> = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
};

const server = createServer(async (request, response) => {
  const url = new URL(request.url ?? "/", `http://127.0.0.1:${port}`);

  if (request.method === "GET" && url.pathname === "/api/axes") {
    send(response, 200, {
      query: defaultQuery,
      schemas: schemaAxis,
      strategies: strategyAxis,
      tools: toolsAxis,
      cells: schemaAxis.length * strategyAxis.length * toolsAxis.length,
    });
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/run") {
    const body = await readJson(request);
    const query = String(body.query ?? "").trim();
    const schemaId = String(body.schemaId ?? "");
    const strategyId = String(body.strategyId ?? "");
    const toolsId = String(body.toolsId ?? "");
    const phase = String(body.phase ?? "research");
    const draft = body.draft;
    const notes = Array.isArray(body.notes) ? (body.notes as Note[]) : [];
    if (!query || !isPhase(phase) || !isToolsId(toolsId)) {
      send(response, 400, {
        error: "Need query, phase, and toolsId.",
      });
      return;
    }

    const key = [
      phase,
      query,
      schemaId,
      strategyId,
      toolsId,
      JSON.stringify(draft ?? null),
      JSON.stringify(notes),
    ].join("\0");
    if (!body.fresh && cache.has(key)) {
      send(response, 200, { ...cache.get(key), cached: true });
      return;
    }

    if (phase === "skeptic") {
      const result = await runSkeptic({ query, draft, toolsId });
      cache.set(key, result);
      send(response, 200, { ...result, cached: false });
      return;
    }

    if (!isSchemaId(schemaId) || !isStrategyId(strategyId)) {
      send(response, 400, {
        error: "Need schemaId and strategyId.",
      });
      return;
    }

    const result =
      phase === "revise"
        ? await runRevise({
            query,
            draft,
            notes,
            schemaId,
            strategyId,
            toolsId,
          })
        : await runCell({ query, schemaId, strategyId, toolsId });
    cache.set(key, result);
    send(response, 200, { ...result, cached: false });
    return;
  }

  if (request.method === "GET") {
    const file =
      url.pathname === "/" ? "/index.html" : decodeURIComponent(url.pathname);
    const path = fileURLToPath(new URL(`.${file}`, `file://${webRoot}/`));
    if (!path.startsWith(webRoot) || !existsSync(path)) {
      response.writeHead(404);
      response.end("Not found");
      return;
    }
    response.writeHead(200, {
      "content-type": types[extname(path)] ?? "application/octet-stream",
    });
    response.end(readFileSync(path));
    return;
  }

  response.writeHead(405);
  response.end();
});

server.requestTimeout = 0;
server.listen(port, "127.0.0.1", () => {
  console.log(`http://127.0.0.1:${port}`);
});

function send(
  response: import("node:http").ServerResponse,
  status: number,
  value: unknown,
) {
  const body = JSON.stringify(value);
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
  });
  response.end(body);
}

function readJson(
  request: import("node:http").IncomingMessage,
): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk) => chunks.push(chunk));
    request.on("end", () => {
      if (!chunks.length) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      } catch (error) {
        reject(error);
      }
    });
    request.on("error", reject);
  });
}
