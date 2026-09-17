import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";
import { createDeepAgent } from "deepagents";

if (existsSync(".env")) {
  loadEnvFile(".env");
}

// OpenAI's built-in web search — no extra install or API key needed
const internetSearch = { type: "web_search_preview" };

// System prompt to steer the agent to be an expert researcher
const researchInstructions = `You are an expert researcher. Your job is to conduct thorough research and then write a polished report.

You have access to an internet search tool as your primary means of gathering information.

## \`internet_search\`

Use this to run an internet search for a given query. You can specify the max number of results to return, the topic, and whether raw content should be included.
`;

const agent = createDeepAgent({
  model: "openai:gpt-5.5",
  tools: [internetSearch],
  systemPrompt: researchInstructions,
});

const result = await agent.invoke({
  messages: [{ role: "user", content: "What is langgraph?" }],
});

// Print the agent's response
console.log(result.messages[result.messages.length - 1].content);
