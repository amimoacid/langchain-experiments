import { marked } from "marked";
import { markedTerminal } from "marked-terminal";
import type { z } from "zod";

/** Body measure: 45–90 characters, or 2–3 alphabets. Cap at 66. Keep a gutter.
 * @see {@link https://practicaltypography.com/typography-in-ten-minutes.html | Butterick}
 */
const columns = process.stdout.columns || 80;
const measure = Math.min(Math.max(columns - 4, 20), 90);

marked.use(
  markedTerminal({
    reflowText: true,
    tab: 2,
    width: measure,
  }),
);

type Report = {
  title: string;
  summary: string;
  keyFindings: string[];
  sources: string[];
};

/**
 * Render a research result with a terminal markdown viewer.
 * @param schema - Zod schema used as `responseFormat`.
 * @see {@link https://github.com/mikaelbr/marked-terminal | marked-terminal}
 */
export function printReport(
  query: string,
  value: unknown,
  schema: z.ZodType<Report>,
) {
  console.log(marked.parse(toMarkdown(query, value, schema)));
}

function toMarkdown(
  query: string,
  value: unknown,
  schema: z.ZodType<Report>,
): string {
  const parsed = schema.safeParse(value);
  if (parsed.success) {
    const findings = parsed.data.keyFindings
      .map((item) => hanging("• ", item))
      .join("\n\n");
    const sources = parsed.data.sources.map(sourceLine).join("\n\n");
    return [
      `# ${parsed.data.title}`,
      "",
      `> ${query}`,
      "",
      parsed.data.summary,
      "",
      "## Findings",
      "",
      findings,
      "",
      "## Sources",
      "",
      sources,
      "",
    ].join("\n");
  }

  const body = unwrap(value);
  return [`> ${query}`, "", body, ""].join("\n");
}

function sourceLine(source: string) {
  const item = /^https?:\/\//.test(source) ? `<${source}>` : source;
  return hanging("• ", item);
}

function hanging(prefix: string, text: string): string {
  const lines = wrap(text, measure - prefix.length).split("\n");
  const pad = "\u00a0".repeat(prefix.length);
  return lines
    .map((line, i) => `${i === 0 ? prefix : pad}${line}`)
    .join("  \n");
}

function wrap(text: string, width: number): string {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return "";
  const lines: string[] = [];
  let line = words[0];
  for (const word of words.slice(1)) {
    if (`${line} ${word}`.length > width) {
      lines.push(line);
      line = word;
    } else {
      line += ` ${word}`;
    }
  }
  lines.push(line);
  return lines.join("\n");
}

function unwrap(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    const texts = value.flatMap((part) =>
      part && typeof part === "object" && "text" in part
        ? [String(part.text)]
        : [],
    );
    if (texts.length) return texts.join("\n\n");
  }
  return ["```json", JSON.stringify(value, null, 2), "```"].join("\n");
}
