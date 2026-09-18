import { awaitAllCallbacks } from "@langchain/core/callbacks/promises";
import { HumanMessage } from "@langchain/core/messages";
import { createDeepAgent } from "deepagents";
import { initChatModel, providerStrategy } from "langchain";
import { readFileSync } from "node:fs";
import { z } from "zod";
import { aggregateFhir } from "./health/stats";
import { healthTools } from "./health/tools";
import { dump, fail, tokensOf, type CellResult, type Note } from "./run";

export const defaultHealthQuery =
  "What does my redacted study record show this month, and what should I do next?";

export const healthPersona = {
  name: "Elena",
  ageBand: "45-49",
  condition: "Myasthenia gravis",
  place: "Chicago, IL",
  need: "Tell me what you need from me. Use plain words. Respect my energy.",
};

export const healthTracks = ["clinical", "evidence", "participation"] as const;

export type HealthTrack = (typeof healthTracks)[number];
export type HealthPhase =
  | "stats"
  | "plan"
  | HealthTrack
  | "skeptic"
  | "merge"
  | "exec"
  | "glossary";

const trackBrief = z.object({
  focus: z.string(),
  queries: z.array(z.string()),
});

const planSchema = z.object({
  approach: z.string(),
  tracks: z.object({
    clinical: trackBrief,
    evidence: trackBrief,
    participation: trackBrief,
  }),
});

const researchSchema = z.object({
  headline: z.string(),
  takeaways: z.array(z.string()),
  caveats: z.array(z.string()),
  sources: z.array(z.string()),
});

const skepticSchema = z.object({
  notes: z.array(
    z.object({
      quote: z.string(),
      concern: z.string(),
    }),
  ),
});

const mergeSchema = z.object({
  title: z.string(),
  recommendation: z.string(),
  consensus: z.array(z.string()),
  disputes: z.array(z.string()),
  nextSteps: z.array(z.string()),
});

const execSchema = z.object({
  headline: z.string(),
  salient: z.array(z.string()),
  caution: z.array(z.string()),
});

const glossarySchema = z.object({
  terms: z.array(
    z.object({
      term: z.string(),
      definition: z.string(),
    }),
  ),
});

const searchTools = [{ type: "web_search_preview" }];

const trackPrompt: Record<HealthTrack, string> = {
  clinical: "./health/clinical.md",
  evidence: "./health/evidence.md",
  participation: "./health/participation.md",
};

export function runHealthStats(): CellResult {
  return aggregateFhir();
}

/**
 * Split Elena's question across clinical, evidence, and participation tracks.
 * @see {@link https://docs.langchain.com/oss/javascript/deepagents/quickstart | createDeepAgent}
 */
export async function runHealthPlan(input: {
  query: string;
  stats: unknown;
}): Promise<CellResult> {
  return ask({
    snippet: "createDeepAgent({ responseFormat: providerStrategy(plan) })",
    prompt: "./health/plan.md",
    schema: planSchema,
    tools: [],
    message: `Question: ${input.query}\n\nDeterministic FHIR counts:\n${dump(input.stats)}`,
  });
}

/**
 * Run one insight track with FHIR tools and, for evidence, internet search.
 * @see {@link https://docs.langchain.com/oss/javascript/langchain/tools | Tools}
 */
export async function runHealthTrack(input: {
  query: string;
  track: HealthTrack;
  plan: unknown;
  stats: unknown;
}): Promise<CellResult> {
  const tools =
    input.track === "evidence"
      ? [...healthTools(), ...searchTools]
      : healthTools();
  return ask({
    snippet: `createDeepAgent({ tools: [fhir_aggregate, code_lookup${input.track === "evidence" ? ", web_search_preview" : ""}], track: "${input.track}" })`,
    prompt: trackPrompt[input.track],
    schema: researchSchema,
    tools,
    message: `Question: ${input.query}\n\nPlan:\n${dump(input.plan)}\n\nDeterministic FHIR counts:\n${dump(input.stats)}`,
  });
}

export async function runHealthSkeptic(input: {
  query: string;
  tracks: unknown;
}): Promise<CellResult> {
  return ask({
    snippet: "createDeepAgent({ responseFormat: providerStrategy(notes) })",
    prompt: "./health/skeptic.md",
    schema: skepticSchema,
    tools: [],
    message: `Question: ${input.query}\n\nTracks:\n${dump(input.tracks)}`,
  });
}

export async function runHealthMerge(input: {
  query: string;
  tracks: unknown;
  notes: Note[];
  comment?: string;
}): Promise<CellResult> {
  const notes = input.notes
    .map((note) => `- "${note.quote}": ${note.concern}`)
    .join("\n");
  const extra = input.comment?.trim()
    ? `\n\nHuman revision notes:\n${input.comment.trim()}`
    : "";
  return ask({
    snippet: "createDeepAgent({ responseFormat: providerStrategy(merge) })",
    prompt: "./health/merge.md",
    schema: mergeSchema,
    tools: [],
    message: `Question: ${input.query}\n\nTracks:\n${dump(input.tracks)}\n\nSkeptic notes:\n${notes || "(none)"}${extra}`,
  });
}

export async function runHealthExec(input: {
  query: string;
  merge: unknown;
  tracks: unknown;
  notes: Note[];
}): Promise<CellResult> {
  const notes = input.notes
    .map((note) => `- "${note.quote}": ${note.concern}`)
    .join("\n");
  return ask({
    snippet: "createDeepAgent({ responseFormat: providerStrategy(exec) })",
    prompt: "./health/exec.md",
    schema: execSchema,
    tools: [],
    message: `Question: ${input.query}\n\nMerge brief:\n${dump(input.merge)}\n\nTracks:\n${dump(input.tracks)}\n\nSkeptic notes:\n${notes || "(none)"}`,
  });
}

export async function runHealthGlossary(input: {
  query: string;
  corpus: unknown;
}): Promise<CellResult> {
  return ask({
    snippet: "createDeepAgent({ responseFormat: providerStrategy(glossary) })",
    prompt: "./health/glossary.md",
    schema: glossarySchema,
    tools: [],
    message: `Question: ${input.query}\n\nCorpus:\n${dump(input.corpus)}`,
  });
}

export function isHealthPhase(value: string): value is HealthPhase {
  return (
    value === "stats" ||
    value === "plan" ||
    value === "skeptic" ||
    value === "merge" ||
    value === "exec" ||
    value === "glossary" ||
    healthTracks.includes(value as HealthTrack)
  );
}

export function isHealthTrack(value: string): value is HealthTrack {
  return healthTracks.includes(value as HealthTrack);
}

async function ask(input: {
  snippet: string;
  prompt: string;
  schema: z.ZodType;
  tools: unknown[];
  message: string;
}): Promise<CellResult> {
  const started = Date.now();
  const persona = readFileSync(
    new URL("./health/persona.md", import.meta.url),
    "utf8",
  );
  const body = readFileSync(new URL(input.prompt, import.meta.url), "utf8");
  try {
    const model = await initChatModel(
      process.env.MODEL ?? "openai:gpt-5.6-luna",
      { useResponsesApi: true },
    );
    const agent = createDeepAgent({
      model,
      tools: input.tools as never,
      systemPrompt: `${persona}\n\n${body}`,
      responseFormat: providerStrategy(input.schema),
    });
    const result = (await agent.invoke({
      messages: [new HumanMessage(input.message)],
    })) as { structuredResponse?: unknown; messages: unknown[] };
    await awaitAllCallbacks();
    return {
      ok: true,
      ms: Date.now() - started,
      snippet: input.snippet,
      tokens: tokensOf(result.messages),
      value: result.structuredResponse,
    };
  } catch (error) {
    return fail(started, input.snippet, error);
  }
}
