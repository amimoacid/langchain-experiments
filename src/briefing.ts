import { awaitAllCallbacks } from "@langchain/core/callbacks/promises";
import { HumanMessage } from "@langchain/core/messages";
import { createDeepAgent } from "deepagents";
import { initChatModel, providerStrategy } from "langchain";
import { readFileSync } from "node:fs";
import { z } from "zod";
import {
  dump,
  fail,
  tokensOf,
  type CellResult,
  type Note,
} from "./run";

export const defaultBriefingQuery =
  "Should a neighborhood bakery start a weekday lunch box subscription?";

export const briefingTracks = [
  "customer",
  "competitor",
  "distribution",
] as const;

export type BriefingTrack = (typeof briefingTracks)[number];
export type BriefingPhase =
  | "plan"
  | BriefingTrack
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
    customer: trackBrief,
    competitor: trackBrief,
    distribution: trackBrief,
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

const trackPrompt: Record<BriefingTrack, string> = {
  customer: "./track-customer.md",
  competitor: "./track-competitor.md",
  distribution: "./track-distribution.md",
};

/**
 * Split one question into customer, competitor, and distribution tracks.
 * @see {@link https://docs.langchain.com/oss/javascript/deepagents/quickstart | createDeepAgent}
 */
export async function runPlan(query: string): Promise<CellResult> {
  return ask({
    snippet: "createDeepAgent({ responseFormat: providerStrategy(plan) })",
    prompt: "./plan.md",
    schema: planSchema,
    tools: [],
    message: query,
  });
}

/**
 * Research one track with internet search.
 * @see {@link https://docs.langchain.com/oss/javascript/deepagents/models#openai-and-the-responses-api | OpenAI Responses API}
 */
export async function runTrack(input: {
  query: string;
  track: BriefingTrack;
  plan: unknown;
}): Promise<CellResult> {
  return ask({
    snippet: `createDeepAgent({ tools: [{ type: "web_search_preview" }], track: "${input.track}" })`,
    prompt: trackPrompt[input.track],
    schema: researchSchema,
    tools: searchTools,
    message: `Question: ${input.query}\n\nPlan:\n${dump(input.plan)}`,
  });
}

/**
 * Mark weak spans across the three tracks.
 * @see {@link https://docs.langchain.com/oss/javascript/langchain/structured-output | Structured output}
 */
export async function runBriefingSkeptic(input: {
  query: string;
  tracks: unknown;
}): Promise<CellResult> {
  return ask({
    snippet: "createDeepAgent({ responseFormat: providerStrategy(notes) })",
    prompt: "./briefing-skeptic.md",
    schema: skepticSchema,
    tools: searchTools,
    message: `Question: ${input.query}\n\nTracks:\n${dump(input.tracks)}`,
  });
}

/**
 * Merge the tracks and skeptic notes into one brief for human approval.
 * @see {@link https://docs.langchain.com/oss/javascript/deepagents/quickstart | createDeepAgent}
 */
export async function runMerge(input: {
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
    prompt: "./merge.md",
    schema: mergeSchema,
    tools: [],
    message: `Question: ${input.query}\n\nTracks:\n${dump(input.tracks)}\n\nSkeptic notes:\n${notes || "(none)"}${extra}`,
  });
}

/**
 * Highlight the few points a decision maker must see.
 * @see {@link https://docs.langchain.com/oss/javascript/deepagents/quickstart | createDeepAgent}
 */
export async function runExecutive(input: {
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
    prompt: "./exec.md",
    schema: execSchema,
    tools: [],
    message: `Question: ${input.query}\n\nMerge brief:\n${dump(input.merge)}\n\nTracks:\n${dump(input.tracks)}\n\nSkeptic notes:\n${notes || "(none)"}`,
  });
}

/**
 * Build a plain-language glossary from the briefing corpus.
 * @see {@link https://docs.langchain.com/oss/javascript/langchain/structured-output | Structured output}
 */
export async function runGlossary(input: {
  query: string;
  corpus: unknown;
}): Promise<CellResult> {
  return ask({
    snippet: "createDeepAgent({ responseFormat: providerStrategy(glossary) })",
    prompt: "./glossary.md",
    schema: glossarySchema,
    tools: [],
    message: `Question: ${input.query}\n\nCorpus:\n${dump(input.corpus)}`,
  });
}

export function isBriefingPhase(value: string): value is BriefingPhase {
  return (
    value === "plan" ||
    value === "skeptic" ||
    value === "merge" ||
    value === "exec" ||
    value === "glossary" ||
    briefingTracks.includes(value as BriefingTrack)
  );
}

export function isBriefingTrack(value: string): value is BriefingTrack {
  return briefingTracks.includes(value as BriefingTrack);
}

async function ask(input: {
  snippet: string;
  prompt: string;
  schema: z.ZodType;
  tools: { type: string }[];
  message: string;
}): Promise<CellResult> {
  const started = Date.now();
  try {
    const model = await initChatModel(
      process.env.MODEL ?? "openai:gpt-5.6-luna",
      { useResponsesApi: true },
    );
    const agent = createDeepAgent({
      model,
      tools: input.tools,
      systemPrompt: readFileSync(new URL(input.prompt, import.meta.url), "utf8"),
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
