/**
 * Chat SSE client — streams via Next.js API proxy which attaches Auth0 access token.
 */

export type SSEEvent =
  | { type: "token"; content: string }
  | { type: "agent"; name: string }
  | { type: "session"; id: string }
  | { type: "done" }
  | { type: "error"; message: string };

export interface ChatStreamOptions {
  message: string;
  sessionId: string;
  onEvent: (event: SSEEvent) => void;
  onComplete: () => void;
  onError: (error: string) => void;
  signal?: AbortSignal;
}

export async function streamChat(options: ChatStreamOptions): Promise<void> {
  const { message, sessionId, onEvent, onComplete, onError, signal } = options;

  try {
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      credentials: "include",
      body: JSON.stringify({ message, session_id: sessionId }),
      signal,
    });

    if (!response.ok) {
      let errorText = `HTTP ${response.status}`;
      try {
        const payload = (await response.json()) as { error?: string; detail?: string };
        errorText = payload.error ?? errorText;
        if (payload.detail) {
          errorText = `${errorText} (${payload.detail})`;
        }
      } catch {
        errorText = (await response.text().catch(() => errorText)) || errorText;
      }
      onError(errorText);
      return;
    }

    if (!response.body) {
      onError("No response body from server");
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data: ")) continue;

        const jsonStr = trimmed.slice("data: ".length);
        if (!jsonStr) continue;

        try {
          const event = JSON.parse(jsonStr) as SSEEvent;
          onEvent(event);
          if (event.type === "done") {
            onComplete();
            return;
          }
          if (event.type === "error") {
            onError(event.message);
            return;
          }
        } catch {
          // Skip malformed JSON lines
        }
      }
    }
    onComplete();
  } catch (err: unknown) {
    // Abort still must release the input (N-001); treat as soft complete.
    if (err instanceof Error && err.name === "AbortError") {
      onComplete();
      return;
    }
    onError(err instanceof Error ? err.message : "Unknown stream error");
  }
}
