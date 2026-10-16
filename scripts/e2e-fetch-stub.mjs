// Loaded into the MCP server child process via NODE_OPTIONS=--import. Stubs
// globalThis.fetch so run_benchmark exercises the real OpenRouter adapter and
// the real bin command without network or a key. Replies with the canonical
// reference drawing for every prompt.
import { readFileSync } from "node:fs";
const answer = JSON.parse(readFileSync("data/tasks.jsonl", "utf8").split("\n")[0]).expected;
const upstream = globalThis.fetch;
globalThis.fetch = async (url, init) => {
  if (String(url).includes("openrouter.ai")) {
    return new Response(JSON.stringify({
      choices: [{ message: { role: "assistant", content: answer } }],
      usage: { prompt_tokens: 40, completion_tokens: 120, total_tokens: 160, cost: 0 },
    }), { status: 200, headers: { "content-type": "application/json" } });
  }
  return upstream(url, init);
};
