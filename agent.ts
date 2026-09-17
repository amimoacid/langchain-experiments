import { awaitAllCallbacks } from "@langchain/core/callbacks/promises";
import { createDeepAgent } from "deepagents";
import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";

if (existsSync(".env")) {
  loadEnvFile(".env");
}

if (process.env.LANGSMITH_TRACING === "true") {
  const project = process.env.LANGSMITH_PROJECT ?? "default";
  console.log(
    `LangSmith tracing is on. Open https://smith.langchain.com and look at project "${project}".`,
  );
}

const internetSearch = { type: "web_search_preview" };

// System prompt to steer the agent to be an expert researcher
const researchInstructions = `

You are an EXPERT RESEARCHER. 
Your job is to conduct thorough RESEARCH and then write a polished REPORT.

You have access to an internet SEARCH tool as your primary means of gathering information.

## \`internet_search\`

Use this to run an internet search for a given query. 

You can specify: 
- max number of returned RESULTS
- TOPIC
- whether to incude RAW CONTENT
`;

const agent = createDeepAgent({
  model: "openai:gpt-5.6-luna",
  tools: [internetSearch],
  systemPrompt: researchInstructions,
});

const result = await agent.invoke({
  messages: [{ role: "user", content: "What is langgraph?" }],
});

console.log(result.messages[result.messages.length - 1].content);

await awaitAllCallbacks();
