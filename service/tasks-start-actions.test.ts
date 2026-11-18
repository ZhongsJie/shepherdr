// The row's actions live in one dropdown (mods/tasks actionMenu): no separate Start/Cancel buttons and no extra
// buttons beside Review. The method is the one in main.js, run against inert elements.
import { expect, test } from "bun:test";
import { element, handler } from "./fake-gpui";

const src = await Bun.file(new URL("../mods/tasks/main.js", import.meta.url)).text();
const method = src.match(/\n  actionMenu\(p, t\) \{[\s\S]*?\n  \}\n/)![0];
const actionMenu = new Function("h_flex", "svg", "taskKey", "refOf", "RADIUS", "TEXT", "t",
  `return ({${method}}).actionMenu`)(() => element(), () => element(), () => "k", () => "APP-2",
  { control: 4 }, { label: 12 }, { muted: 0, hover: 1, foreground: 2 });

const cx = { stop_propagation() {}, notify() {} };
const opened: any[] = [];
const self = { pins: () => new Set<string>(), rowMenu: (pin: any, at: any) => opened.push([pin, at]), statusLine: () => "Starts Today 18:00" };

test("the separate Start now / Cancel buttons are gone", () => {
  expect(src).not.toContain("startButtons");
  expect(src).not.toContain('"Start now"');
});

test("a click opens the row menu under its own button, with the task it belongs to", () => {
  opened.length = 0;
  const p = { section: "queued", list: { folder: "/tmp/repo", machine: "vm" }, task: { id: 2 } };
  const el = actionMenu.call(self, p, {});
  handler(el, "on_mouse_down")!({ bounds: { x: 10, y: 20, height: 24 } }, cx);
  handler(el, "on_click")!({}, cx);
  expect(opened).toEqual([[{ key: "k", on: false, status: "queued", machine: "vm", folder: "/tmp/repo",
    ref: "APP-2", sub: null }, { x: 10, y: 48 }]]);
});

test("a scheduled row's menu heading shows when it starts; a missing bounds falls back to the pointer", () => {
  opened.length = 0;
  const p = { section: "scheduled", list: { folder: "/tmp/repo", machine: null }, task: { id: 2 } };
  const el = actionMenu.call(self, p, {});
  handler(el, "on_click")!({}, cx);
  expect(opened[0][0]).toMatchObject({ status: "scheduled", machine: null, sub: "Starts Today 18:00" });
  expect(opened[0][1]).toBe("pointer");
});

test("the button marks the task as pinned when it is", () => {
  opened.length = 0;
  const pinned = { ...self, pins: () => new Set(["k"]) };
  const el = actionMenu.call(pinned, { section: "todo", list: { folder: "/tmp/repo", machine: null }, task: { id: 2 } }, {});
  handler(el, "on_click")!({}, cx);
  expect(opened[0][0].on).toBe(true);
});