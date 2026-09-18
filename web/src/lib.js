import { marked } from "marked";

marked.use({
  gfm: true,
  renderer: {
    html() {
      return "";
    },
  },
});

export const bands = ["title", "body", "findings", "sources"];
export const storageKey = "sweep:v6";

const skeletonLines = {
  title: ["68%"],
  body: ["100%", "100%", "94%", "58%"],
  findings: ["100%", "86%", "72%"],
  sources: ["78%", "70%"],
};

export function jobsOf(axes) {
  return axes.schemas.map((schema) => ({
    key: schema.id,
    schemaId: schema.id,
    strategyId: axes.strategyId ?? "provider",
    toolsId: axes.toolsId ?? "search",
  }));
}

export function reportParts(value) {
  const data = unwrap(value);
  if (typeof data === "string") {
    return { body: data, bodyName: "content" };
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return { body: fence(data), bodyName: "value" };
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
  } else if (Array.isArray(data.items) && data.items[0]?.question) {
    parts.body = data.items
      .map((item) => `**${item.question}**\n\n${item.answer}`)
      .join("\n\n");
    parts.bodyName = "faq";
  } else if (Array.isArray(data.items) && data.items[0]?.point) {
    parts.findings = data.items
      .map((item) => `- **${item.count}×** ${item.point}`)
      .join("\n");
    const variants = data.items.flatMap((item) => item.variants ?? []);
    if (variants.length) {
      parts.body = variants.map((item) => `- ${item}`).join("\n");
      parts.bodyName = "variants";
    }
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
  return parts;
}

export function skeletonBands() {
  return skeletonLines;
}

export function notesOf(value) {
  const data = unwrap(value);
  if (!data || typeof data !== "object" || !Array.isArray(data.notes)) {
    return [];
  }
  return data.notes.flatMap((note) =>
    note && note.quote && note.concern
      ? [{ quote: String(note.quote), concern: String(note.concern) }]
      : [],
  );
}

export function md(text) {
  return marked.parse(String(text), { async: false });
}

export function unwrap(value) {
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

export function fence(value) {
  return "```json\n" + JSON.stringify(value, null, 2) + "\n```";
}

export function line(view) {
  if (!view || view.state === "idle") return "Ready";
  if (view.state === "run") return "Research";
  if (view.state === "review") return "Skeptic";
  if (view.state === "revise") return "Revise";
  const head = view.state === "error" ? "Failed" : fmt(view.ms);
  return [head, fmtTok(view.tokens?.total), view.cached ? "cache" : ""]
    .filter(Boolean)
    .join(" · ");
}

export function fold(view, result) {
  return {
    ...view,
    ms: (view.ms ?? 0) + (result.ms ?? 0),
    tokens: addTokens(view.tokens, result.tokens),
    cached: Boolean(view.cached || result.cached),
  };
}

export function addTokens(left, right) {
  return {
    input: (left?.input ?? 0) + (right?.input ?? 0),
    output: (left?.output ?? 0) + (right?.output ?? 0),
    total: (left?.total ?? 0) + (right?.total ?? 0),
  };
}

export function zero() {
  return { input: 0, output: 0, total: 0 };
}

export function spentLine(cells, views, brief) {
  let spent = 0;
  let have = 0;
  for (const view of Object.values(views)) {
    const total = view.tokens?.total;
    if (!total) continue;
    spent += total;
    have += 1;
  }
  if (brief?.tokens?.total) {
    spent += brief.tokens.total;
    have += 1;
  }
  const extra = have ? ` ${fmtTok(spent)} spent.` : "";
  return `${cells} report shapes. All shapes run at the same time.${extra}`;
}

export function fmtTok(n) {
  if (!n) return "";
  return `${n.toLocaleString("en-US")} tok`;
}

export function fmt(ms) {
  if (!ms && ms !== 0) return "Done";
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms}ms`;
}

export function remember(query, views, brief) {
  sessionStorage.setItem(
    storageKey,
    JSON.stringify({ query, results: views, brief }),
  );
}

export function restore(query, jobs) {
  const store = readStore();
  if (!store || store.query !== query) return { views: {}, brief: null };
  const views = {};
  for (const job of jobs) {
    const view = store.results?.[job.key];
    if (view) views[job.key] = view;
  }
  return { views, brief: store.brief ?? null };
}

export function corpusOf(views) {
  const drafts = [];
  const notes = [];
  const revisions = [];
  for (const [key, view] of Object.entries(views)) {
    if (view.draft !== undefined) drafts.push({ cell: key, value: view.draft });
    if (view.notes?.length) notes.push({ cell: key, notes: view.notes });
    if (view.value !== undefined) {
      revisions.push({ cell: key, value: view.value });
    }
  }
  return { drafts, notes, revisions };
}

export function readStore() {
  try {
    return JSON.parse(sessionStorage.getItem(storageKey) ?? "null");
  } catch {
    return null;
  }
}

export function highlight(root, notes) {
  if (!root || !notes?.length) return;
  for (const note of notes) wrapQuote(root, note.quote, note.concern);
}

export function termsOf(value) {
  const data = unwrap(value);
  if (!data || typeof data !== "object" || !Array.isArray(data.terms)) {
    return [];
  }
  return data.terms.flatMap((item) =>
    item && item.term && item.definition
      ? [{ term: String(item.term), definition: String(item.definition) }]
      : [],
  );
}

export function highlightGlossary(root, terms) {
  if (!root) return;
  for (const mark of root.querySelectorAll("mark.glossary")) {
    const text = document.createTextNode(mark.textContent ?? "");
    mark.replaceWith(text);
  }
  root.normalize();
  if (!terms?.length) return;
  const sorted = [...terms].sort((a, b) => b.term.length - a.term.length);
  for (const item of sorted) wrapTerm(root, item.term, item.definition);
}

function wrapQuote(root, quote, concern) {
  wrapOnce(root, quote, concern, "tip");
}

function wrapTerm(root, term, definition) {
  let guard = 0;
  while (guard < 40 && wrapOnce(root, term, definition, "tip glossary")) {
    guard += 1;
  }
}

function wrapOnce(root, quote, note, className) {
  const needle = String(quote).trim();
  if (!needle) return false;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  for (const node of nodes) {
    if (!safeText(node)) continue;
    const hay = node.textContent ?? "";
    const index = findTerm(hay, needle);
    if (index < 0) continue;
    const range = document.createRange();
    range.setStart(node, index);
    range.setEnd(node, index + needle.length);
    const mark = document.createElement("mark");
    mark.className = className;
    mark.dataset.note = note;
    mark.dataset.link = needle.toLowerCase();
    mark.tabIndex = 0;
    try {
      range.surroundContents(mark);
    } catch {
      return false;
    }
    return true;
  }
  return false;
}

function safeText(node) {
  const el = node.parentElement;
  if (!el) return false;
  if (el.closest("mark")) return false;
  if (el.closest(".field-name, .pass-name, .meta, .lede, label, .nav, button")) {
    return false;
  }
  return true;
}

function findTerm(hay, needle) {
  const lower = hay.toLowerCase();
  const n = needle.toLowerCase();
  let from = 0;
  while (from <= lower.length) {
    const index = lower.indexOf(n, from);
    if (index < 0) return -1;
    const before = index === 0 || !/\w/.test(hay[index - 1] ?? "");
    const after =
      index + needle.length >= hay.length ||
      !/\w/.test(hay[index + needle.length] ?? "");
    if (before && after) return index;
    from = index + 1;
  }
  return -1;
}

export function equalize(nodes) {
  const list = [...nodes];
  if (!list.length) return;
  for (const node of list) node.style.minHeight = "";
  const max = Math.max(
    ...list.map((node) => node.getBoundingClientRect().height),
  );
  for (const node of list) node.style.minHeight = `${max}px`;
}

export function normalize(root) {
  if (!root) return;
  equalize(root.querySelectorAll(".axis-head .axis-note"));
  equalize(root.querySelectorAll(".axis-head .axis-value"));
  for (const row of root.querySelectorAll(".axis-row")) {
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

export function post(body) {
  return fetch("/api/run", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }).then((response) => response.json());
}

export function postBrief(body) {
  return fetch("/api/brief", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }).then((response) => response.json());
}

export function postBriefing(body) {
  return fetch("/api/briefing", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }).then((response) => response.json());
}

export function postHealth(body) {
  return fetch("/api/health", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }).then((response) => response.json());
}

export async function pool(items, limit, work) {
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
