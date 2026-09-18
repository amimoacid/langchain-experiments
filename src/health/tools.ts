import { tool } from "langchain";
import { z } from "zod";
import { codeBook } from "./fhir";
import { aggregateFhir } from "./stats";

/**
 * Deterministic tools over the redacted FHIR bundle.
 * @see {@link https://docs.langchain.com/oss/javascript/langchain/tools | Tools}
 */
export function healthTools() {
  const stats = aggregateFhir().value;
  return [
    tool(
      async ({ reason }: { reason: string }) => {
        return JSON.stringify({ reason, stats });
      },
      {
        name: "fhir_aggregate",
        description:
          "Return deterministic counts from the redacted FHIR file. Includes doses, dated scores, labs, surveys, and study tasks. No names.",
        schema: z.object({
          reason: z.string().describe("Why you need the counts."),
        }),
      },
    ),
    tool(
      async ({ code }: { code: string }) => {
        const key = code.trim();
        return codeBook[key] ?? `No local definition for ${key}.`;
      },
      {
        name: "code_lookup",
        description:
          "Look up one clinical code in the local dictionary. Use this before you guess a meaning.",
        schema: z.object({
          code: z.string().describe("An ICD-10, RxNorm, or LOINC code."),
        }),
      },
    ),
  ];
}
