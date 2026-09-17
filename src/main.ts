import { awaitAllCallbacks } from "@langchain/core/callbacks/promises";
import { HumanMessage } from "@langchain/core/messages";
import { createDeepAgent } from "deepagents";
import { initChatModel, providerStrategy } from "langchain";
import { existsSync, readFileSync } from "node:fs";
import { loadEnvFile } from "node:process";
import { z } from "zod";
import { printReport } from "./util";

if (existsSync(".env")) loadEnvFile(".env");

const query = "What is consciousness?";

const model = await initChatModel(process.env.MODEL ?? "openai:gpt-5.6-luna");

const tools = [{ type: "web_search_preview" }];

const report = z.object({
  title: z.string(),
  summary: z.string(),
  keyFindings: z.array(z.string()),
  sources: z.array(z.string()),
});

const agent = createDeepAgent({
  model,
  tools,
  systemPrompt: readFileSync(new URL("./research.md", import.meta.url), "utf8"),
  responseFormat: providerStrategy(report),
});

const result = await agent.invoke({
  messages: [new HumanMessage(query)],
});

printReport(
  query,
  result.structuredResponse ?? result.messages.at(-1)?.content,
  report,
);
await awaitAllCallbacks();
