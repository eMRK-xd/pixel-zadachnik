#!/usr/bin/env node
// MCP server for «Пиксельный задачник».
// The desktop app (Tauri) exchanges two files in %APPDATA%\com.pixel.zadachnik:
//   tasks.json  — snapshot the app writes after every change (read here)
//   inbox.json  — queue this server appends to; the app picks it up every ~2.5 s and applies it.
//                 Items without "op" are tasks to add/upsert; others are {op:"update"|"complete"|"add_subtasks"|"delete"|"calendar", ...}
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const DIR = process.env.ZADACHNIK_DIR ||
  path.join(process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming"), "com.pixel.zadachnik");
const SNAPSHOT = path.join(DIR, "tasks.json");
const INBOX = path.join(DIR, "inbox.json");
const COLUMNS = ["inbox", "possum", "camp", "merch", "plush", "other"];
const SOURCES = ["yougile", "notion", "daily", "obsidian", "claude", "calendar"];

const readJSON = (p, fallback) => { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return fallback; } };
const norm = t => String(t || "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
const reply = text => ({ content: [{ type: "text", text }] });

function enqueue(items) {
  fs.mkdirSync(DIR, { recursive: true });
  const queue = readJSON(INBOX, []);
  const next = (Array.isArray(queue) ? queue : []).concat(items.map(i => ({ ...i, at: new Date().toISOString() })));
  const tmp = INBOX + "." + process.pid + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(next, null, 1));
  fs.renameSync(tmp, INBOX); // atomic swap so the app never reads a half-written file
}
const appNote = () => fs.existsSync(SNAPSHOT) ? "" : " Приложение ещё не запускалось — изменения применятся при его старте.";

// resolve a reference against the last snapshot (the app resolves again when applying; this is for feedback)
function resolve(snap, m) {
  const tasks = snap?.tasks || [];
  if (m.id) for (const t of tasks) { if (t.id === m.id) return t; for (const s of t.subtasks || []) if (s.id === m.id) return { ...s, parent: t }; }
  if (m.external_id) { const t = tasks.find(t => (t.external_id || "").toLowerCase() === m.external_id.toLowerCase()); if (t) return t; }
  if (m.text) {
    const n = norm(m.text); const t = tasks.find(t => norm(t.text) === n); if (t) return t;
    for (const t of tasks) for (const s of t.subtasks || []) if (norm(s.text) === n) return { ...s, parent: t };
  }
  return null;
}
const label = m => m.id || m.external_id || `«${m.text}»`;

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const ref = {
  id: z.string().optional().describe("Task id (t12) or subtask id (t12.3) from list_tasks"),
  external_id: z.string().optional().describe("Id in the external system, e.g. CRASH-402"),
  text: z.string().optional().describe("Exact task/subtask text (used when no id is known)"),
};
const refObj = z.object(ref);
const subtask = z.object({
  text: z.string().min(1).max(300),
  done: z.boolean().optional(),
  due: date.nullable().optional().describe("YYYY-MM-DD; null clears"),
  assignees: z.array(z.string()).optional(),
  url: z.string().url().optional().describe("Direct link to this subtask/checklist item if it has its own page"),
});

const server = new McpServer(
  { name: "zadachnik", version: "0.3.0" },
  {
    instructions:
      "Pixel task tracker (desktop app). Tasks have: text, column, source, url, due (YYYY-MM-DD), description, assignees, subtasks (each with done/due/assignees) and external_id (e.g. a YouGile key like CRASH-402). " +
      "To collect tasks: 1) call list_tasks; 2) gather tasks from the places the user names (YouGile, the latest daily notes, Notion mentions…) with your other tools; " +
      "3) call add_tasks once with all items — short imperative text in the user's language, source, due, subtasks and external_id when known. " +
      "LINKS ARE REQUIRED: give every task a url that opens the exact item it came from — the YouGile task page (with its key, e.g. …#CRASH-402), the Notion page or block where the user was mentioned, the Telegram/Slack message link, the daily-notes document. " +
      "If the exact item has no link, use the closest page that contains it (the board, the document) — never leave url empty when you read the task from somewhere that has an address. Give subtasks their own url when they have one. " +
      "When updating tasks that have no link yet, add it with update_task (set.url). " +
      "An item with an external_id that already exists updates that task (upsert). To attach an external task to an existing card worded differently, pass that card's id. " +
      "If something that is a subtask in the source exists as a separate card, add it as a subtask and remove the card with delete_tasks. " +
      "Use complete_tasks to tick tasks/subtasks, update_task to edit, add_subtasks to extend a task. Never touch tasks the user added from daily notes unless asked. " +
      "Calendar: to show the user's Google Calendar events in the app's Calendar tab, read them with your calendar tools and pass them to sync_calendar; " +
      "if the user asks to put deadlines into Google Calendar, create the events with your calendar tools. Changes reach the running app within a few seconds.",
  },
);

server.registerTool(
  "list_tasks",
  {
    title: "Список задач в трекере",
    description: "Current tasks (with ids, deadlines, subtasks, external ids), weekly goals and daily notes from the pixel tracker.",
    inputSchema: {
      include_done: z.boolean().optional().describe("Also list finished tasks (default false)"),
      column: z.enum(COLUMNS).optional().describe("Only this column"),
    },
  },
  async ({ include_done, column }) => {
    const snap = readJSON(SNAPSHOT, null);
    if (!snap) return reply("Снимка задач нет: запусти приложение «Задачник» хотя бы раз.");
    const lines = [`Обновлено: ${snap.updated}`];
    for (const col of snap.columns || []) {
      if (column && col.id !== column) continue;
      const ts = (snap.tasks || []).filter(t => t.column === col.id && (include_done || !t.done));
      if (!ts.length) continue;
      lines.push(`\n## ${col.name} (${col.id})`);
      for (const t of ts) {
        const subs = t.subtasks || [];
        const meta = [t.id, t.external_id, t.source, t.due && "до " + t.due, t.assignees?.length && "@" + t.assignees.join(", "),
          subs.length && `${subs.filter(s => s.done).length}/${subs.length}`, t.url].filter(Boolean).join(" · ");
        lines.push(`- [${t.done ? "x" : " "}] ${t.text} · ${meta}`);
        if (t.description) lines.push(`  > ${t.description.replace(/\s+/g, " ").slice(0, 160)}${t.description.length > 160 ? "…" : ""}`);
        for (const s of subs) {
          if (!include_done && s.done && subs.length > 12) continue;
          lines.push(`  - [${s.done ? "x" : " "}] ${s.text} · ${[s.id, s.due && "до " + s.due, s.assignees?.length && "@" + s.assignees.join(", "), s.url].filter(Boolean).join(" · ")}`);
        }
      }
    }
    if (snap.goals?.length) lines.push("\n## Цели недели", ...snap.goals.map((g, i) => `${i + 1}. ${g}`));
    if (snap.daily?.length) lines.push("\n## Заметки дейлика", ...snap.daily.map(d => `- ${d}`));
    return reply(lines.join("\n"));
  },
);

server.registerTool(
  "add_tasks",
  {
    title: "Добавить / обновить задачи",
    description: "Add tasks to the tracker (Inbox unless a column is given). An item whose external_id or id matches an existing task updates it instead (subtasks are merged by text). Plain duplicates (same text or link, no ids) are skipped.",
    inputSchema: {
      tasks: z.array(z.object({
        text: z.string().min(1).max(300).describe("Short task, imperative, in the user's language"),
        id: z.string().optional().describe("Existing card id to update/attach to (when the card is worded differently)"),
        external_id: z.string().optional().describe("Key in the source system, e.g. CRASH-402 — enables upsert on re-import"),
        source: z.enum(SOURCES).optional().describe("Where the task came from (badge on the card)"),
        url: z.string().url().optional().describe("REQUIRED when the source has an address: direct link to the exact task / page / message, so the user can open it from the card"),
        column: z.enum(COLUMNS).optional().describe("Target column if obvious; default inbox"),
        due: date.nullable().optional().describe("Deadline YYYY-MM-DD; null clears"),
        description: z.string().max(4000).optional(),
        assignees: z.array(z.string()).optional(),
        subtasks: z.array(subtask).optional().describe("Ordered subtasks"),
        done: z.boolean().optional(),
      })).min(1).max(100),
    },
  },
  async ({ tasks }) => {
    const snap = readJSON(SNAPSHOT, { tasks: [] });
    const queued = readJSON(INBOX, []);
    const known = [...(snap.tasks || []), ...(Array.isArray(queued) ? queued.filter(q => !q.op) : [])];
    const fresh = [], updates = [], skipped = [];
    for (const t of tasks) {
      const hit = (t.id && known.find(k => k.id === t.id)) || (t.external_id && known.find(k => (k.external_id || "").toLowerCase() === t.external_id.toLowerCase()));
      if (hit) { updates.push(t); continue; }
      if (!t.external_id && !t.id && known.some(k => (t.url && k.url === t.url) || norm(k.text) === norm(t.text))) { skipped.push(t); continue; }
      fresh.push(t); known.push(t);
    }
    const items = [...fresh, ...updates].map(t => ({ ...t, source: t.source || "claude" }));
    if (items.length) enqueue(items);
    return reply([
      fresh.length ? `Новых: ${fresh.length}.` : "",
      updates.length ? `Обновлю существующие: ${updates.map(t => t.external_id || t.id).join(", ")}.` : "",
      skipped.length ? `Уже были на доске, пропустил: ${skipped.map(t => "«" + t.text + "»").join(", ")}.` : "",
      !items.length ? "Изменений нет." : appNote(),
    ].filter(Boolean).join(" "));
  },
);

server.registerTool(
  "update_task",
  {
    title: "Изменить задачу",
    description: "Edit one task or subtask found by id, external_id or exact text.",
    inputSchema: {
      ...ref,
      set: z.object({
        text: z.string().min(1).max(300).optional(),
        column: z.enum(COLUMNS).optional(),
        due: date.nullable().optional().describe("YYYY-MM-DD; null clears"),
        description: z.string().max(4000).nullable().optional(),
        done: z.boolean().optional(),
        assignees: z.array(z.string()).optional(),
        url: z.string().url().optional(),
        external_id: z.string().optional(),
      }),
    },
  },
  async ({ id, external_id, text, set }) => {
    const m = { id, external_id, text };
    if (!id && !external_id && !text) return reply("Укажи id, external_id или text.");
    const hit = resolve(readJSON(SNAPSHOT, null), m);
    enqueue([{ op: "update", match: m, set }]);
    return reply(hit ? `Обновляю «${hit.text}»${hit.parent ? ` (подзадача «${hit.parent.text}»)` : ""}.${appNote()}` : `В снимке не нашёл ${label(m)} — отправил всё равно, приложение проверит.`);
  },
);

server.registerTool(
  "complete_tasks",
  {
    title: "Отметить выполненными",
    description: "Tick (or untick with done:false) tasks and/or subtasks by id, external_id or exact text.",
    inputSchema: { items: z.array(refObj).min(1).max(200), done: z.boolean().optional().describe("Default true") },
  },
  async ({ items, done }) => {
    const snap = readJSON(SNAPSHOT, null);
    const found = [], missing = [];
    for (const m of items) { const h = resolve(snap, m); (h ? found : missing).push(h ? h.text : label(m)); }
    enqueue([{ op: "complete", items, done: done !== false }]);
    return reply([`${done === false ? "Снимаю отметку" : "Отмечаю"}: ${found.length ? found.map(t => "«" + t + "»").join(", ") : "—"}.`,
      missing.length ? `Не нашёл в снимке: ${missing.join(", ")}.` : "", appNote()].filter(Boolean).join(" "));
  },
);

server.registerTool(
  "add_subtasks",
  {
    title: "Добавить подзадачи",
    description: "Append subtasks to an existing task (found by id, external_id or exact text). Existing subtasks with the same text are updated instead.",
    inputSchema: { ...ref, subtasks: z.array(subtask).min(1).max(100) },
  },
  async ({ id, external_id, text, subtasks }) => {
    const m = { id, external_id, text };
    const hit = resolve(readJSON(SNAPSHOT, null), m);
    if (hit?.parent) return reply("Это подзадача — подзадачи можно добавлять только к задаче.");
    enqueue([{ op: "add_subtasks", match: m, subtasks }]);
    return reply(hit ? `Добавляю ${subtasks.length} к «${hit.text}».${appNote()}` : `В снимке не нашёл ${label(m)} — отправил, приложение проверит.`);
  },
);

server.registerTool(
  "delete_tasks",
  {
    title: "Удалить задачи",
    description: "Remove tasks or subtasks (by id, external_id or exact text). Use for duplicates, e.g. a card that now lives as a subtask.",
    inputSchema: { items: z.array(refObj).min(1).max(100) },
  },
  async ({ items }) => {
    const snap = readJSON(SNAPSHOT, null);
    const found = items.map(m => resolve(snap, m)).filter(Boolean);
    enqueue([{ op: "delete", items }]);
    return reply(`Удаляю: ${found.map(t => "«" + t.text + "»").join(", ") || "—"}${found.length < items.length ? ` (не нашёл ${items.length - found.length})` : ""}.${appNote()}`);
  },
);

server.registerTool(
  "sync_calendar",
  {
    title: "Показать события календаря в задачнике",
    description: "Replace the events shown in the app's Calendar tab (pass the next ~2–4 weeks from Google Calendar). Tasks with deadlines are shown there automatically.",
    inputSchema: {
      events: z.array(z.object({
        title: z.string().min(1).max(300),
        start: z.string().describe("YYYY-MM-DD for all-day, or ISO date-time"),
        end: z.string().optional(),
        id: z.string().optional(),
        url: z.string().url().optional(),
      })).max(500),
    },
  },
  async ({ events }) => {
    enqueue([{ op: "calendar", events }]);
    return reply(`Передал ${events.length} событий во вкладку «Календарь».${appNote()}`);
  },
);

await server.connect(new StdioServerTransport());
