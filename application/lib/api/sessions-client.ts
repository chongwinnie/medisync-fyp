/**
 * Chat sessions API client — proxies through Next.js BFF (/api/sessions).
 */

export interface ChatSessionSummary {
  id: string;
  title: string;
  role?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  last_message_at?: string | null;
}

export interface SessionMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  metadata?: Record<string, unknown>;
  created_at?: string | null;
}

async function parseError(response: Response): Promise<string> {
  try {
    const payload = (await response.json()) as { error?: string; detail?: string };
    if (payload.error) {
      return payload.detail ? `${payload.error} (${payload.detail})` : payload.error;
    }
  } catch {
    // fall through
  }
  return `HTTP ${response.status}`;
}

export async function listSessions(): Promise<ChatSessionSummary[]> {
  const response = await fetch("/api/sessions", {
    method: "GET",
    credentials: "include",
  });
  if (!response.ok) {
    throw new Error(await parseError(response));
  }
  const data = (await response.json()) as { sessions?: ChatSessionSummary[] };
  return Array.isArray(data.sessions) ? data.sessions : [];
}

export async function createSession(options?: {
  title?: string;
  id?: string;
}): Promise<ChatSessionSummary> {
  const response = await fetch("/api/sessions", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      title: options?.title,
      id: options?.id,
    }),
  });
  if (!response.ok) {
    throw new Error(await parseError(response));
  }
  return (await response.json()) as ChatSessionSummary;
}

export async function fetchSessionMessages(
  sessionId: string
): Promise<SessionMessage[]> {
  const response = await fetch(`/api/sessions/${encodeURIComponent(sessionId)}/messages`, {
    method: "GET",
    credentials: "include",
  });
  if (!response.ok) {
    throw new Error(await parseError(response));
  }
  const data = (await response.json()) as { messages?: SessionMessage[] };
  return Array.isArray(data.messages) ? data.messages : [];
}

export async function deleteSession(sessionId: string): Promise<void> {
  const response = await fetch(`/api/sessions/${encodeURIComponent(sessionId)}`, {
    method: "DELETE",
    credentials: "include",
  });
  if (!response.ok) {
    throw new Error(await parseError(response));
  }
}

/** Relative-ish timestamp for Recent Sessions rail. */
export function formatSessionTimestamp(iso: string | null | undefined): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const diffMs = Date.now() - date.getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString();
}
