import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import { createServer as createVite } from "vite";
import {
  defaultBriefingQuery,
  isBriefingPhase,
  isBriefingTrack,
  runBriefingSkeptic,
  runExecutive,
  runGlossary,
  runMerge,
  runPlan,
  runTrack,
} from "./briefing";
import {
  defaultHealthQuery,
  healthPersona,
  isHealthPhase,
  isHealthTrack,
  runHealthExec,
  runHealthGlossary,
  runHealthMerge,
  runHealthPlan,
  runHealthSkeptic,
  runHealthStats,
  runHealthTrack,
} from "./health";
import {
  defaultQuery,
  isBriefPhase,
  isPhase,
  isSchemaId,
  isStrategyId,
  isToolsId,
  runCell,
  runChief,
  runReduceResearch,
  runRevise,
  runSkeptic,
  schemaAxis,
  type Note,
} from "./run";

const port = Number(process.env.PORT) || 3000;
const webRoot = fileURLToPath(new URL("../web", import.meta.url));
const cache = new Map<string, Awaited<ReturnType<typeof runCell>>>();

const server = createServer();
const vite = await createVite({
  configFile: fileURLToPath(new URL("../web/vite.config.js", import.meta.url)),
  root: webRoot,
  appType: "spa",
  server: { middlewareMode: true, hmr: { server } },
});

server.on("request", (request, response) => {
  void handle(request, response);
});

async function handle(
  request: import("node:http").IncomingMessage,
  response: import("node:http").ServerResponse,
) {
  const url = new URL(request.url ?? "/", `http://127.0.0.1:${port}`);

  if (request.method === "GET" && url.pathname === "/api/axes") {
    send(response, 200, {
      query: defaultQuery,
      schemas: schemaAxis,
      strategyId: "provider",
      toolsId: "search",
      cells: schemaAxis.length,
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

  if (request.method === "GET" && url.pathname === "/api/briefing") {
    send(response, 200, { query: defaultBriefingQuery });
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/briefing") {
    const body = await readJson(request);
    const query = String(body.query ?? "").trim();
    const phase = String(body.phase ?? "");
    const notes = Array.isArray(body.notes) ? (body.notes as Note[]) : [];
    const comment = String(body.comment ?? "");
    if (!query || !isBriefingPhase(phase)) {
      send(response, 400, { error: "Need query and briefing phase." });
      return;
    }

    const key = [
      "briefing",
      phase,
      query,
      JSON.stringify(body.plan ?? null),
      JSON.stringify(body.tracks ?? null),
      JSON.stringify(body.merge ?? null),
      JSON.stringify(body.corpus ?? null),
      JSON.stringify(notes),
      comment,
    ].join("\0");
    if (!body.fresh && cache.has(key)) {
      send(response, 200, { ...cache.get(key), cached: true });
      return;
    }

    const result =
      phase === "plan"
        ? await runPlan(query)
        : isBriefingTrack(phase)
          ? await runTrack({
              query,
              track: phase,
              plan: body.plan,
            })
          : phase === "skeptic"
            ? await runBriefingSkeptic({ query, tracks: body.tracks })
            : phase === "exec"
              ? await runExecutive({
                  query,
                  merge: body.merge,
                  tracks: body.tracks,
                  notes,
                })
              : phase === "glossary"
                ? await runGlossary({ query, corpus: body.corpus })
                : await runMerge({
                  query,
                  tracks: body.tracks,
                  notes,
                  comment,
                });
    cache.set(key, result);
    send(response, 200, { ...result, cached: false });
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/health") {
    send(response, 200, {
      query: defaultHealthQuery,
      persona: healthPersona,
      stats: runHealthStats(),
    });
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/health") {
    const body = await readJson(request);
    const query = String(body.query ?? "").trim();
    const phase = String(body.phase ?? "");
    const notes = Array.isArray(body.notes) ? (body.notes as Note[]) : [];
    const comment = String(body.comment ?? "");
    if (!query || !isHealthPhase(phase)) {
      send(response, 400, { error: "Need query and health phase." });
      return;
    }

    const key = [
      "health",
      phase,
      query,
      JSON.stringify(body.stats ?? null),
      JSON.stringify(body.plan ?? null),
      JSON.stringify(body.tracks ?? null),
      JSON.stringify(body.merge ?? null),
      JSON.stringify(body.corpus ?? null),
      JSON.stringify(notes),
      comment,
    ].join("\0");
    if (!body.fresh && cache.has(key)) {
      send(response, 200, { ...cache.get(key), cached: true });
      return;
    }

    const result =
      phase === "stats"
        ? runHealthStats()
        : phase === "plan"
          ? await runHealthPlan({ query, stats: body.stats })
          : isHealthTrack(phase)
            ? await runHealthTrack({
                query,
                track: phase,
                plan: body.plan,
                stats: body.stats,
              })
            : phase === "skeptic"
              ? await runHealthSkeptic({ query, tracks: body.tracks })
              : phase === "exec"
                ? await runHealthExec({
                    query,
                    merge: body.merge,
                    tracks: body.tracks,
                    notes,
                  })
                : phase === "glossary"
                  ? await runHealthGlossary({ query, corpus: body.corpus })
                  : await runHealthMerge({
                      query,
                      tracks: body.tracks,
                      notes,
                      comment,
                    });
    cache.set(key, result);
    send(response, 200, { ...result, cached: false });
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/brief") {
    const body = await readJson(request);
    const query = String(body.query ?? "").trim();
    const phase = String(body.phase ?? "");
    const corpus = body.corpus;
    if (!query || !isBriefPhase(phase)) {
      send(response, 400, { error: "Need query and brief phase." });
      return;
    }

    const key = [phase, query, JSON.stringify(corpus ?? null)].join("\0");
    if (!body.fresh && cache.has(key)) {
      send(response, 200, { ...cache.get(key), cached: true });
      return;
    }

    const result =
      phase === "reduce"
        ? await runReduceResearch({ query, corpus })
        : await runChief({ query, tally: corpus });
    cache.set(key, result);
    send(response, 200, { ...result, cached: false });
    return;
  }

  vite.middlewares(request, response);
}

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
