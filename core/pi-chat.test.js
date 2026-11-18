import { expect, test } from "bun:test";
import { Conversation, resultText } from "./chat-log.js";

const J = (off, o) => ({ kind: "J", off, data: JSON.stringify(o) });

test("pi's log: messages, tool calls, results and what it runs on", () => {
  const c = new Conversation("pi");
  c.feed([
    J(1, { type: "session", id: "s" }),
    J(2, { type: "model_change", provider: "p", modelId: "m" }),
    J(3, { type: "thinking_level_change", thinkingLevel: "off" }),
    J(4, { type: "message", id: "u1", message: { role: "user", content: [{ type: "text", text: "hello" }] } }),
    J(5, { type: "message", id: "a1", message: { role: "assistant", provider: "p", model: "m", thinkingLevel: "off", usage: { totalTokens: 12 },
      content: [{ type: "toolCall", id: "c1", name: "read", arguments: { path: "/x/a.txt" } }, { type: "text", text: "done" }] } }),
    { kind: "R", off: 6, data: "c1" },
  ]);
  expect(c.meta).toMatchObject({ model: "p/m", effort: "off", used: 12 });
  expect(c.items.some((i) => i.kind === "user" && i.text === "hello")).toBe(true);
  const tools = c.items.find((i) => i.kind === "tools");
  expect(tools.steps[0].kind).toBe("read");
  expect(c.items.some((i) => i.kind === "agent" && i.text === "done")).toBe(true);
  expect(c.open.has("c1")).toBe(false);
});

test("pi tool result text", () => {
  const line = JSON.stringify({ type: "message", message: { role: "toolResult", toolCallId: "c1", content: [{ type: "text", text: "file body" }] } });
  expect(resultText(line, "c1")).toBe("file body");
});
