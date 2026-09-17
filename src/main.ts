import { defaultQuery, runCell, schemas } from "./run";
import { printReport } from "./util";

const query = defaultQuery;
const result = await runCell({
  query,
  schemaId: "full",
  strategyId: "provider",
  toolsId: "search",
});

if (!result.ok) {
  console.error(result.error);
  process.exitCode = 1;
} else {
  printReport(query, result.value, schemas.full);
}
