import { invoke } from "@/lib/tauri";
import type { ThreadItem, ThreadMeta } from "@/features/agent/thread";

// Agent chat history, persisted in redb via the backend (survives restarts; the
// transcript items are stored opaquely — the UI owns their shape).

export function newThreadId(): string {
  return crypto.randomUUID();
}

// Derive a human title from the first user turn (what they asked).
export function titleFromItems(items: ThreadItem[]): string {
  const firstUser = items.find((i) => i.role === "user");
  const text = firstUser?.role === "user" ? firstUser.text.trim() : "";
  return text ? text.replace(/\s+/g, " ").slice(0, 64) : "New chat";
}

export function loadThreadList(): Promise<ThreadMeta[]> {
  return invoke("agent_threads_list");
}

export async function loadThreadItems(id: string): Promise<ThreadItem[]> {
  return (await invoke("agent_thread_load", { id })) ?? [];
}

export function saveThread(meta: ThreadMeta, items: ThreadItem[]): Promise<ThreadMeta[]> {
  return invoke("agent_thread_save", { ...meta, items });
}

export function deleteThread(id: string): Promise<ThreadMeta[]> {
  return invoke("agent_thread_delete", { id });
}
