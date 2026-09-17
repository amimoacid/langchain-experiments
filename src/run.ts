import { awaitAllCallbacks } from "@langchain/core/callbacks/promises";
import { HumanMessage } from "@langchain/core/messages";
import { createDeepAgent } from "deepagents";
import { initChatModel, providerStrategy, toolStrategy } from "langchain";
import { existsSync, readFileSync } from "node:fs";
import { loadEnvFile } from "node:process";
import { z } from "zod";

if (existsSync(".env")) loadEnvFile(".env");

export const defaultQuery = "What is consciousness?";

/** Report shapes for the schema axis.
 * @see {@link https://docs.langchain.com/oss/javascript/langchain/structured-output | Structured output}
 */
export const schemas = {
  full: z.object({
    title: z.string(),
    summary: z.string(),
    keyFindings: z.array(z.string()),
    sources: z.array(z.string()),
  }),
  brief: z.object({
    summary: z.string(),
    sources: z.array(z.string()),
  }),
  prose: z.object({
    answer: z.string(),
  }),
  claims: z.object({
    claims: z.array(
      z.object({
        claim: z.string(),
        evidence: z.string(),
      }),
    ),
    sources: z.array(z.string()),
  }),
  briefing: z.object({
    headline: z.string(),
    takeaways: z.array(z.string()),
    caveats: z.array(z.string()),
    sources: z.array(z.string()),
  }),
  faq: z.object({
    items: z.array(
      z.object({
        question: z.string(),
        answer: z.string(),
      }),
    ),
    sources: z.array(z.string()),
  }),
};

const skepticSchema = z.object({
  notes: z.array(
    z.object({
      quote: z.string(),
      concern: z.string(),
    }),
  ),
});

export const schemaAxis = [
  {
    id: "full",
    label: "full",
    note: "The report must include title, summary, keyFindings, and sources.",
    value:
      "{\n  title: z.string(),\n  summary: z.string(),\n  keyFindings: z.array(z.string()),\n  sources: z.array(z.string()),\n}",
  },
  {
    id: "brief",
    label: "brief",
    note: "The report must include summary and sources.",
    value: "{\n  summary: z.string(),\n  sources: z.array(z.string()),\n}",
  },
  {
    id: "prose",
    label: "prose",
    note: "The report must include one answer string.",
    value: "{\n  answer: z.string(),\n}",
  },
  {
    id: "claims",
    label: "claims",
    note: "The report must include claim and evidence pairs, plus sources.",
    value:
      "{\n  claims: z.array({ claim: z.string(), evidence: z.string() }),\n  sources: z.array(z.string()),\n}",
  },
  {
    id: "briefing",
    label: "briefing",
    note: "The report must include headline, takeaways, caveats, and sources.",
    value:
      "{\n  headline: z.string(),\n  takeaways: z.array(z.string()),\n  caveats: z.array(z.string()),\n  sources: z.array(z.string()),\n}",
  },
  {
    id: "faq",
    label: "faq",
    note: "The report must include question and answer pairs, plus sources.",
    value:
      "{\n  items: z.array({ question: z.string(), answer: z.string() }),\n  sources: z.array(z.string()),\n}",
  },
] as const;

export const strategyAxis = [
  {
    id: "provider",
    label: "providerStrategy",
    note: "Uses native structured output. The provider enforces the JSON schema.",
  },
  {
    id: "tool",
    label: "toolStrategy",
    note: "Adds a function tool. The model fills the report as the tool arguments.",
  },
  {
    id: "none",
    label: "no responseFormat",
    note: "Omits responseFormat. The last message text is the report.",
  },
] as const;

export const toolsAxis = [
  {
    id: "search",
    label: "web_search_preview",
    note: "Passes the OpenAI built-in web search tool. Deep Agents still add filesystem tools.",
  },
  {
    id: "none",
    label: "[]",
    note: "Passes an empty user tool list. Deep Agents still add filesystem tools.",
  },
] as const;

export type SchemaId = keyof typeof schemas;
export type StrategyId = (typeof strategyAxis)[number]["id"];
export type ToolsId = (typeof toolsAxis)[number]["id"];

export type Tokens = {
  input: number;
  output: number;
  total: number;
};

export type Note = {
  quote: string;
  concern: string;
};

export type CellResult = {
  ok: boolean;
  ms: number;
  snippet: string;
  tokens: Tokens;
  value?: unknown;
  error?: string;
};

export type Phase = "research" | "skeptic" | "revise";

/**
 * Run one research cell. The query stays fixed. Schema, strategy, and tools change.
 * @see {@link https://docs.langchain.com/oss/javascript/deepagents/quickstart | createDeepAgent}
 * @see {@link https://docs.langchain.com/oss/javascript/deepagents/models#openai-and-the-responses-api | OpenAI Responses API}
 */
export async function runCell(input: {
  query: string;
  schemaId: SchemaId;
  strategyId: StrategyId;
  toolsId: ToolsId;
}): Promise<CellResult> {
  const schema = schemas[input.schemaId];
  const responseFormat =
    input.strategyId === "provider"
      ? providerStrategy(schema)
      : input.strategyId === "tool"
        ? toolStrategy(schema)
        : undefined;
  const tools =
    input.toolsId === "search" ? [{ type: "web_search_preview" }] : [];
  const snippet = [
    "createDeepAgent({",
    `  tools: ${input.toolsId === "search" ? '[{ type: "web_search_preview" }]' : "[]"},`,
    input.strategyId === "none"
      ? ""
      : `  responseFormat: ${input.strategyId}Strategy(${input.schemaId}),`,
    "})",
  ]
    .filter(Boolean)
    .join("\n");
  const started = Date.now();

  try {
    const model = await initChatModel(
      process.env.MODEL ?? "openai:gpt-5.6-luna",
      { useResponsesApi: true },
    );
    const systemPrompt = readFileSync(
      new URL("./research.md", import.meta.url),
      "utf8",
    );
    const agent =
      responseFormat === undefined
        ? createDeepAgent({ model, tools, systemPrompt })
        : createDeepAgent({ model, tools, systemPrompt, responseFormat });
    const result = (await agent.invoke({
      messages: [new HumanMessage(input.query)],
    })) as {
      structuredResponse?: unknown;
      messages: unknown[];
    };
    await awaitAllCallbacks();
    return {
      ok: true,
      ms: Date.now() - started,
      snippet,
      tokens: tokensOf(result.messages),
      value: result.structuredResponse ?? contentOf(result.messages.at(-1)),
    };
  } catch (error) {
    return fail(started, snippet, error);
  }
}

/**
 * Mark weak spans in a draft. Quotes must match the draft text.
 * @see {@link https://docs.langchain.com/oss/javascript/langchain/structured-output | Structured output}
 */
export async function runSkeptic(input: {
  query: string;
  draft: unknown;
  toolsId: ToolsId;
}): Promise<CellResult> {
  const tools =
    input.toolsId === "search" ? [{ type: "web_search_preview" }] : [];
  const snippet =
    "createDeepAgent({ responseFormat: providerStrategy(notes) })";
  const started = Date.now();
  try {
    const model = await initChatModel(
      process.env.MODEL ?? "openai:gpt-5.6-luna",
      { useResponsesApi: true },
    );
    const agent = createDeepAgent({
      model,
      tools,
      systemPrompt: readFileSync(
        new URL("./skeptic.md", import.meta.url),
        "utf8",
      ),
      responseFormat: providerStrategy(skepticSchema),
    });
    const result = (await agent.invoke({
      messages: [
        new HumanMessage(
          `Query: ${input.query}\n\nDraft:\n${dump(input.draft)}`,
        ),
      ],
    })) as { structuredResponse?: { notes?: Note[] }; messages: unknown[] };
    await awaitAllCallbacks();
    return {
      ok: true,
      ms: Date.now() - started,
      snippet,
      tokens: tokensOf(result.messages),
      value: result.structuredResponse ?? { notes: [] },
    };
  } catch (error) {
    return fail(started, snippet, error);
  }
}

/**
 * Rewrite the draft after the skeptic notes.
 * @see {@link https://docs.langchain.com/oss/javascript/deepagents/quickstart | createDeepAgent}
 */
export async function runRevise(input: {
  query: string;
  draft: unknown;
  notes: Note[];
  schemaId: SchemaId;
  strategyId: StrategyId;
  toolsId: ToolsId;
}): Promise<CellResult> {
  const schema = schemas[input.schemaId];
  const responseFormat =
    input.strategyId === "provider"
      ? providerStrategy(schema)
      : input.strategyId === "tool"
        ? toolStrategy(schema)
        : undefined;
  const tools =
    input.toolsId === "search" ? [{ type: "web_search_preview" }] : [];
  const snippet = "createDeepAgent({ /* revise */ })";
  const started = Date.now();
  const notes = input.notes
    .map((note) => `- "${note.quote}": ${note.concern}`)
    .join("\n");
  const systemPrompt = readFileSync(
    new URL("./revise.md", import.meta.url),
    "utf8",
  );
  try {
    const model = await initChatModel(
      process.env.MODEL ?? "openai:gpt-5.6-luna",
      { useResponsesApi: true },
    );
    const agent =
      responseFormat === undefined
        ? createDeepAgent({ model, tools, systemPrompt })
        : createDeepAgent({ model, tools, systemPrompt, responseFormat });
    const result = (await agent.invoke({
      messages: [
        new HumanMessage(
          `Query: ${input.query}\n\nDraft:\n${dump(input.draft)}\n\nEditor notes:\n${notes || "(none)"}`,
        ),
      ],
    })) as { structuredResponse?: unknown; messages: unknown[] };
    await awaitAllCallbacks();
    return {
      ok: true,
      ms: Date.now() - started,
      snippet,
      tokens: tokensOf(result.messages),
      value: result.structuredResponse ?? contentOf(result.messages.at(-1)),
    };
  } catch (error) {
    return fail(started, snippet, error);
  }
}

function fail(started: number, snippet: string, error: unknown): CellResult {
  return {
    ok: false,
    ms: Date.now() - started,
    snippet,
    tokens: { input: 0, output: 0, total: 0 },
    error: error instanceof Error ? error.message : String(error),
  };
}

function dump(value: unknown) {
  return typeof value === "string" ? value : JSON.stringify(value, null, 2);
}

function contentOf(message: unknown) {
  if (!message || typeof message !== "object" || !("content" in message)) {
    return undefined;
  }
  return message.content;
}

function tokensOf(messages: unknown[]): Tokens {
  let input = 0;
  let output = 0;
  let total = 0;
  for (const message of messages) {
    const usage = usageOf(message);
    if (!usage) continue;
    input += usage.input;
    output += usage.output;
    total += usage.total;
  }
  return { input, output, total };
}

function usageOf(message: unknown): Tokens | undefined {
  if (!message || typeof message !== "object") return;
  const raw =
    "usage_metadata" in message
      ? (message as { usage_metadata?: Record<string, unknown> }).usage_metadata
      : undefined;
  const fallback =
    !raw && "response_metadata" in message
      ? tokenUsageOf(
          (message as { response_metadata?: Record<string, unknown> })
            .response_metadata,
        )
      : undefined;
  const source = raw ?? fallback;
  if (!source) return;
  const input = num(source.input_tokens ?? source.promptTokens);
  const output = num(source.output_tokens ?? source.completionTokens);
  const total =
    num(source.total_tokens ?? source.totalTokens) || input + output;
  if (!input && !output && !total) return;
  return { input, output, total };
}

function tokenUsageOf(metadata: Record<string, unknown> | undefined) {
  if (!metadata) return;
  const usage = metadata.usage ?? metadata.tokenUsage ?? metadata.token_usage;
  if (!usage || typeof usage !== "object") return;
  return usage as Record<string, unknown>;
}

function num(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

export function isSchemaId(value: string): value is SchemaId {
  return value in schemas;
}

export function isStrategyId(value: string): value is StrategyId {
  return strategyAxis.some((item) => item.id === value);
}

export function isToolsId(value: string): value is ToolsId {
  return toolsAxis.some((item) => item.id === value);
}

export function isPhase(value: string): value is Phase {
  return value === "research" || value === "skeptic" || value === "revise";
}
