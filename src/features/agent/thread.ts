import type { AgentSessionUpdate } from "@/types";

// A turn in the transcript: either something the user sent, or one streamed agent
// update. Distinct roles let the panel render prompts apart from replies.
export type ThreadItem =
  | { role: "user"; text: string }
  | { role: "agent"; update: AgentSessionUpdate };

// Metadata for a saved conversation; the transcript items are loaded on demand.
export interface ThreadMeta {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
}
