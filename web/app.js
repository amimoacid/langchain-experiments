import { marked } from "/marked.esm.js";

marked.use({
  gfm: true,
  renderer: {
    html() {
      return "";
    },
  },
});

const bands = ["title", "body", "findings", "sources"];

const form = document.querySelector("#sweep");
const count = document.querySelector("#count");
const board = document.querySelector("#board");
const storageKey = "sweep:v4";
const views = new Map();

const axes = await fetch("/api/axes").then((response) => response.json());
form.query.value = axes.query;
count.textContent = `${axes.cells} cells. Two cells run at a time.`;

const schemasList = axes.schemas;
const strategies = axes.strategies;
const toolsList = axes.tools;
const jobs = toolsList.flatMap((tools) =>
  strategies.flatMap((strategy) =>
    schemasList.map((schema) => ({
      key: `${schema.id}:${strategy.id}:${tools.id}`,
      schemaId: schema.id,
      strategyId: strategy.id,
      toolsId: tools.id,
    })),
  ),
);

board.style.setProperty("--cols", String(schemasList.length));
board.innerHTML = `${key()}${head()}${toolsList.map((tools) => group(tools)).join("")}`;
const tip = document.createElement("div");
tip.id = "tip";
tip.hidden = true;
document.body.append(tip);

function key() {
  return `<section class="key">${[
    ["tools", toolsList],
    ["responseFormat", strategies],
    ["schema", schemasList],
  ]
    .map(
      ([name, items]) =>
        `<div class="key-group${name === "schema" ? " key-schemas" : ""}"><p class="axis-name">${esc(name)}</p>${items
          .map((item) => `<div class="key-item">${blurb(item)}</div>`)
          .join("")}</div>`,
    )
    .join("")}</section>`;
}

function head() {
  return `<div class="axis-head"><div></div>${schemasList
    .map((schema) => `<p class="axis-name">${esc(schema.label)}</p>`)
    .join("")}</div>`;
}

function group(tools) {
  return `<section class="layer"><p class="layer-name">${esc(tools.label)}</p>${strategies
    .map(
      (strategy) =>
        `<section class="axis-row"><p class="axis-name">${esc(strategy.label)}</p>${schemasList
          .map((schema) =>
            card({
              key: `${schema.id}:${strategy.id}:${tools.id}`,
              schemaId: schema.id,
              strategyId: strategy.id,
              toolsId: tools.id,
            }),
          )
          .join("")}</section>`,
    )
    .join("")}</section>`;
}

function blurb(item) {
  const value = item.value
    ? `<pre class="axis-value">${esc(item.value)}</pre>`
    : "";
  return `<p class="axis-name">${esc(item.label)}</p><p class="axis-note">${esc(item.note)}</p>${value}`;
}

const cells = new Map(
  [...board.querySelectorAll("[data-cell]")].map((node) => [
    node.dataset.cell,
    node,
  ]),
);

restore(form.query.value);
normalize();
document.fonts?.ready.then(normalize);
window.addEventListener("resize", normalize);
window.addEventListener("scroll", hideTip, true);

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const query = form.query.value.trim();
  const fresh = event.submitter?.value === "fresh";
  if (!query) return;

  busy(true);
  try {
    await pool(jobs, 2, async (job) => {
      const cell = cells.get(job.key);
      const view = { state: "run", ms: 0, tokens: zero(), notes: [] };
      paint(cell, view);

      const draft = await post({
        phase: "research",
        query,
        schemaId: job.schemaId,
        strategyId: job.strategyId,
        toolsId: job.toolsId,
        fresh,
      });
      fold(view, draft);
      if (!draft.ok) {
        view.state = "error";
        view.error = draft.error;
        finish(query, job.key, cell, view);
        return;
      }
      view.draft = draft.value;
      view.state = "review";
      paint(cell, view);
      normalize();

      const review = await post({
        phase: "skeptic",
        query,
        toolsId: job.toolsId,
        draft: view.draft,
        fresh,
      });
      fold(view, review);
      if (review.ok) view.notes = notesOf(review.value);
      view.state = "revise";
      paint(cell, view);
      mark(cell, view.notes);
      normalize();

      const revision = await post({
        phase: "revise",
        query,
        schemaId: job.schemaId,
        strategyId: job.strategyId,
        toolsId: job.toolsId,
        draft: view.draft,
        notes: view.notes,
        fresh,
      });
      fold(view, revision);
      if (!revision.ok) {
        view.state = "error";
        view.error = revision.error;
        finish(query, job.key, cell, view);
        return;
      }
      view.value = revision.value;
      view.state = "ok";
      finish(query, job.key, cell, view);
    });
  } finally {
    busy(false);
    recount();
    normalize();
  }
});

document.querySelector("#clear").addEventListener("click", () => {
  sessionStorage.removeItem(storageKey);
  views.clear();
  for (const cell of cells.values()) paint(cell, { state: "idle" });
  recount();
  normalize();
});

function card(job) {
  return `<article class="card" data-state="idle" data-cell="${job.key}">${idle()}</article>`;
}

function idle() {
  return `${meta("Ready")}${slots({})}`;
}

function meta(status) {
  return `<div class="meta">${status}</div>`;
}

function paint(cell, view) {
  cell.dataset.state = view.state;
  hideTip();
  if (view.state === "idle") {
    cell.innerHTML = idle();
    return;
  }
  const status = line(view);
  if (view.state === "run") {
    cell.innerHTML = `${meta(status)}${pass("draft", skeleton())}`;
    return;
  }
  if (view.state === "error" && view.draft === undefined) {
    cell.innerHTML = `${meta(status)}${slots({ body: view.error, bodyName: "error" })}`;
    return;
  }
  const draft = pass("draft", report(view.draft));
  if (view.state === "review") {
    cell.innerHTML = `${meta(status)}${draft}${pass("skeptic", skeleton())}`;
    mark(cell, view.notes);
    return;
  }
  if (view.state === "revise") {
    cell.innerHTML = `${meta(status)}${draft}${pass("revision", skeleton())}`;
    mark(cell, view.notes);
    return;
  }
  if (view.state === "error") {
    cell.innerHTML = `${meta(status)}${draft}${pass("revision", slots({ body: view.error, bodyName: "error" }))}`;
    mark(cell, view.notes);
    return;
  }
  if (view.value === undefined) {
    cell.innerHTML = `${meta(status)}${draft}`;
    mark(cell, view.notes);
    return;
  }
  cell.innerHTML = `${meta(status)}${draft}${pass("revision", report(view.value))}`;
  mark(cell, view.notes);
}

function pass(name, inner) {
  return `<section class="pass" data-pass="${name}"><p class="pass-name">${esc(name)}</p>${inner}</section>`;
}

function skeleton() {
  const lines = {
    title: ["68%"],
    body: ["100%", "100%", "94%", "58%"],
    findings: ["100%", "86%", "72%"],
    sources: ["78%", "70%"],
  };
  return bands
    .map((name) => {
      const bars = lines[name]
        .map((width) => `<span class="bar" style="width:${width}"></span>`)
        .join("");
      return `<section class="field" data-band="${name}"><p class="field-name">${esc(name)}</p><div class="skeleton">${bars}</div></section>`;
    })
    .join("");
}

function report(value) {
  const data = unwrap(value);
  if (typeof data === "string") {
    return slots({ body: data, bodyName: "content" });
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return slots({ body: fence(data), bodyName: "value" });
  }

  const parts = {};
  if (data.title) parts.title = String(data.title);
  if (data.headline) parts.title = String(data.headline);
  if (data.summary) {
    parts.body = String(data.summary);
    parts.bodyName = "summary";
  } else if (data.answer) {
    parts.body = String(data.answer);
    parts.bodyName = "answer";
  } else if (data.content) {
    parts.body = String(data.content);
    parts.bodyName = "content";
  } else if (Array.isArray(data.caveats) && data.caveats.length) {
    parts.body = data.caveats.map((item) => `- ${item}`).join("\n");
    parts.bodyName = "caveats";
  } else if (Array.isArray(data.items) && data.items.length) {
    parts.body = data.items
      .map((item) => `**${item.question}**\n\n${item.answer}`)
      .join("\n\n");
    parts.bodyName = "faq";
  }
  if (Array.isArray(data.keyFindings) && data.keyFindings.length) {
    parts.findings = data.keyFindings.map((item) => `- ${item}`).join("\n");
  } else if (Array.isArray(data.takeaways) && data.takeaways.length) {
    parts.findings = data.takeaways.map((item) => `- ${item}`).join("\n");
  } else if (Array.isArray(data.claims) && data.claims.length) {
    parts.findings = data.claims
      .map((item) => `- **${item.claim}**: ${item.evidence}`)
      .join("\n");
  }
  if (Array.isArray(data.sources) && data.sources.length) {
    parts.sources = data.sources
      .map((item) => {
        const text = String(item);
        return /^https?:\/\//.test(text) ? `- <${text}>` : `- ${text}`;
      })
      .join("\n");
  }
  if (!parts.title && !parts.body && !parts.findings && !parts.sources) {
    parts.body = fence(data);
    parts.bodyName = "value";
  }
  return slots(parts);
}

function slots(parts) {
  return bands
    .map((name) => {
      const text = parts[name];
      const label = name === "body" ? parts.bodyName || "body" : name;
      const inner = text
        ? `<p class="field-name">${esc(label)}</p><div class="md">${name === "title" ? md(`# ${text}`) : md(text)}</div>`
        : "";
      return `<section class="field" data-band="${name}">${inner}</section>`;
    })
    .join("");
}

function normalize() {
  const schemaGroup = document.querySelector(".key-schemas");
  if (schemaGroup) equalize(schemaGroup.querySelectorAll(".axis-value"));
  for (const row of document.querySelectorAll(".axis-row")) {
    for (const passName of ["draft", "revision"]) {
      for (const name of bands) {
        equalize(
          row.querySelectorAll(
            `[data-pass="${passName}"] [data-band="${name}"]`,
          ),
        );
      }
    }
  }
}

function equalize(nodes) {
  const list = [...nodes];
  if (!list.length) return;
  for (const node of list) node.style.minHeight = "";
  const max = Math.max(
    ...list.map((node) => node.getBoundingClientRect().height),
  );
  for (const node of list) node.style.minHeight = `${max}px`;
}

function fence(value) {
  return "```json\n" + JSON.stringify(value, null, 2) + "\n```";
}

function md(text) {
  return marked.parse(String(text), { async: false });
}

function unwrap(value) {
  if (Array.isArray(value)) {
    const texts = value.flatMap((part) =>
      part && typeof part === "object" && "text" in part
        ? [String(part.text)]
        : [],
    );
    if (texts.length) return texts.join("\n\n");
  }
  return value;
}

function remember(query, key, view) {
  const store = readStore() ?? { query, results: {} };
  if (store.query !== query) {
    store.query = query;
    store.results = {};
  }
  store.results[key] = view;
  sessionStorage.setItem(storageKey, JSON.stringify(store));
}

function restore(query) {
  const store = readStore();
  if (!store || store.query !== query) return;
  for (const job of jobs) {
    const view = store.results[job.key];
    if (!view) continue;
    views.set(job.key, view);
    paint(cells.get(job.key), view);
  }
  recount();
}

function recount() {
  let spent = 0;
  let have = 0;
  for (const view of views.values()) {
    const total = view.tokens?.total;
    if (!total) continue;
    spent += total;
    have += 1;
  }
  const extra = have ? ` ${fmtTok(spent)} spent.` : "";
  count.textContent = `${axes.cells} cells. Two cells run at a time.${extra}`;
}

function busy(on) {
  for (const button of form.querySelectorAll("button")) button.disabled = on;
}

function line(view) {
  if (view.state === "run") return "Research";
  if (view.state === "review") return "Skeptic";
  if (view.state === "revise") return "Revise";
  const head = view.state === "error" ? "Failed" : fmt(view.ms);
  return [head, fmtTok(view.tokens?.total), view.cached ? "cache" : ""]
    .filter(Boolean)
    .join(" · ");
}

function post(body) {
  return fetch("/api/run", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }).then((response) => response.json());
}

function fold(view, result) {
  view.ms = (view.ms ?? 0) + (result.ms ?? 0);
  view.tokens = addTokens(view.tokens, result.tokens);
  if (result.cached) view.cached = true;
}

function finish(query, key, cell, view) {
  views.set(key, view);
  paint(cell, view);
  remember(query, key, view);
  recount();
  normalize();
}

function notesOf(value) {
  const data = unwrap(value);
  if (!data || typeof data !== "object" || !Array.isArray(data.notes))
    return [];
  return data.notes.flatMap((note) =>
    note && note.quote && note.concern
      ? [{ quote: String(note.quote), concern: String(note.concern) }]
      : [],
  );
}

function mark(cell, notes) {
  const root = cell.querySelector('[data-pass="draft"]');
  if (!root || !notes?.length) return;
  for (const note of notes) highlight(root, note.quote, note.concern);
  for (const node of root.querySelectorAll("mark.tip")) {
    node.tabIndex = 0;
    node.addEventListener("mouseenter", showTip);
    node.addEventListener("focus", showTip);
    node.addEventListener("mouseleave", hideTip);
    node.addEventListener("blur", hideTip);
  }
}

function highlight(root, quote, concern) {
  const needle = String(quote).trim();
  if (!needle) return;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  for (const node of nodes) {
    const hay = node.textContent ?? "";
    let index = hay.indexOf(needle);
    if (index < 0) index = hay.toLowerCase().indexOf(needle.toLowerCase());
    if (index < 0) continue;
    const range = document.createRange();
    range.setStart(node, index);
    range.setEnd(node, index + needle.length);
    const markNode = document.createElement("mark");
    markNode.className = "tip";
    markNode.dataset.note = concern;
    try {
      range.surroundContents(markNode);
    } catch {
      return;
    }
    return;
  }
}

function showTip(event) {
  const markNode = event.currentTarget;
  tip.textContent = markNode.dataset.note ?? "";
  tip.hidden = false;
  const box = markNode.getBoundingClientRect();
  const top = box.bottom + window.scrollY + 8;
  const left = Math.min(
    box.left + window.scrollX,
    window.scrollX + document.documentElement.clientWidth - 240,
  );
  tip.style.top = `${top}px`;
  tip.style.left = `${Math.max(window.scrollX + 8, left)}px`;
}

function hideTip() {
  tip.hidden = true;
}

function addTokens(left, right) {
  return {
    input: (left?.input ?? 0) + (right?.input ?? 0),
    output: (left?.output ?? 0) + (right?.output ?? 0),
    total: (left?.total ?? 0) + (right?.total ?? 0),
  };
}

function zero() {
  return { input: 0, output: 0, total: 0 };
}

function fmtTok(n) {
  if (!n) return "";
  return `${n.toLocaleString("en-US")} tok`;
}

function readStore() {
  try {
    return JSON.parse(sessionStorage.getItem(storageKey) ?? "null");
  } catch {
    return null;
  }
}

function fmt(ms) {
  if (!ms && ms !== 0) return "Done";
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms}ms`;
}

function esc(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

async function pool(items, limit, work) {
  let index = 0;
  async function worker() {
    while (index < items.length) {
      const current = items[index];
      index += 1;
      await work(current);
    }
  }
  await Promise.all(Array.from({ length: limit }, worker));
}
