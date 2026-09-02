"use client";

import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { PlusIcon, MessageSquareIcon, SparklesIcon } from "lucide-react";
import { AgentPills } from "@/components/chat/agent-pills";
import { SupervisorBadge } from "@/components/chat/supervisor-badge";
import { MessageBubble } from "@/components/chat/message-bubble";
import type { ChatMessage } from "@/components/chat/message-bubble";
import { QuickActionCards } from "@/components/chat/quick-action-cards";
import { ChatInput } from "@/components/chat/chat-input";
import { useChatStream } from "@/hooks/use-chat-stream";
import { useRequireRole } from "@/hooks/use-require-role";
import {
  fetchSessionMessages,
  formatSessionTimestamp,
  listSessions,
  type ChatSessionSummary,
} from "@/lib/api/sessions-client";

export type { ChatMessage };

function activeSessionStorageKey(auth0Sub: string): string {
  // Scope by Auth0 sub so concurrent role browsers on one machine don't clash.
  return `medisync.chat.activeSession.${auth0Sub || "anon"}`;
}

interface ChatPageClientProps {
  aiApiUrl: string;
  initialPrompt?: string | null;
  auth0Sub: string;
}

function newSessionId(): string {
  return crypto.randomUUID();
}

export function ChatPageClient({
  aiApiUrl,
  initialPrompt,
  auth0Sub,
}: ChatPageClientProps) {
  const { isLoading, isAllowed } = useRequireRole(["doctor", "nurse", "admin"]);
  const useLiveChat = Boolean(aiApiUrl);
  const sessionKey = activeSessionStorageKey(auth0Sub);

  const [activeSession, setActiveSession] = useState(() => {
    if (typeof window === "undefined") return newSessionId();
    try {
      const params = new URLSearchParams(window.location.search);
      const fromUrl = params.get("session");
      if (fromUrl) return fromUrl;
      const stored = localStorage.getItem(sessionKey);
      if (stored) return stored;
      // Migrate legacy unscoped key once, then clear it.
      const legacy = localStorage.getItem("medisync.chat.activeSession");
      if (legacy) {
        localStorage.removeItem("medisync.chat.activeSession");
        return legacy;
      }
    } catch {
      // ignore
    }
    return newSessionId();
  });

  const streamHook = useChatStream({ sessionId: activeSession });

  const [mockMessages, setMockMessages] = useState<ChatMessage[]>([]);
  const [mockStreaming] = useState(false);
  const [sessions, setSessions] = useState<ChatSessionSummary[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [sessionsError, setSessionsError] = useState<string | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);

  const messages = useLiveChat ? streamHook.messages : mockMessages;
  const isStreaming = useLiveChat ? streamHook.isStreaming : mockStreaming;

  const onSend = useMemo(
    () =>
      useLiveChat
        ? streamHook.send
        : async (text: string) => {
            const userMsg: ChatMessage = {
              id: crypto.randomUUID(),
              role: "user",
              content: text,
              agent: null,
            };
            const aiMsg: ChatMessage = {
              id: crypto.randomUUID(),
              role: "assistant",
              content:
                "Live chat requires NEXT_PUBLIC_AI_API_URL in your environment. Start the FastAPI backend on port 8000.",
              agent: "supervisor",
            };
            setMockMessages((prev) => [...prev, userMsg, aiMsg]);
          },
    [useLiveChat, streamHook.send],
  );

  const bottomRef = useRef<HTMLDivElement>(null);
  const hydratedSessionRef = useRef<string | null>(null);

  const lastAssistant = [...messages]
    .reverse()
    .find((message) => message.role === "assistant");
  const activeAgent = lastAssistant?.agent ?? null;

  const refreshSessions = useCallback(async () => {
    if (!useLiveChat) return;
    setSessionsLoading(true);
    setSessionsError(null);
    try {
      const rows = await listSessions();
      setSessions(rows);
    } catch (err) {
      setSessionsError(err instanceof Error ? err.message : "Failed to load sessions");
    } finally {
      setSessionsLoading(false);
    }
  }, [useLiveChat]);

  // Persist active session id for reload resume (scoped per Auth0 user)
  useEffect(() => {
    try {
      localStorage.setItem(sessionKey, activeSession);
    } catch {
      // ignore
    }
  }, [activeSession, sessionKey]);

  // Load server session list on mount (async callback — avoids sync setState-in-effect lint)
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (!useLiveChat || cancelled) return;
      await refreshSessions();
    })();
    return () => {
      cancelled = true;
    };
  }, [refreshSessions, useLiveChat]);

  // Hydrate transcript when switching / restoring a session
  useEffect(() => {
    if (!useLiveChat) return;
    if (hydratedSessionRef.current === activeSession) return;
    if (streamHook.isStreaming) return;
    // Wait for session list so we can skip GET on unknown/stale ids (BUG-MEM0-4)
    if (sessionsLoading) return;

    let cancelled = false;
    hydratedSessionRef.current = activeSession;

    void (async () => {
      const knownOnServer = sessions.some((s) => s.id === activeSession);
      if (!knownOnServer) {
        // Empty local shell or stale localStorage id — no messages fetch (avoids 404 noise)
        if (!cancelled) {
          streamHook.loadMessages([]);
          setHistoryLoading(false);
        }
        return;
      }

      setHistoryLoading(true);
      try {
        const rows = await fetchSessionMessages(activeSession);
        if (cancelled) return;
        const mapped: ChatMessage[] = rows
          .filter((m) => m.role === "user" || m.role === "assistant")
          .map((m) => ({
            id: m.id || crypto.randomUUID(),
            role: m.role as "user" | "assistant",
            content: m.content,
            agent:
              typeof m.metadata?.agent === "string"
                ? (m.metadata.agent as string)
                : null,
          }));
        streamHook.loadMessages(mapped);
      } catch {
        // Session vanished / offline — clear stale id and start empty (BUG-MEM0-4)
        if (!cancelled) {
          streamHook.loadMessages([]);
          try {
            const stored = localStorage.getItem(sessionKey);
            if (stored === activeSession) {
              localStorage.removeItem(sessionKey);
            }
          } catch {
            // ignore
          }
        }
      } finally {
        if (!cancelled) setHistoryLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
    // Intentionally only re-run on activeSession / live flag / sessions load — not streamHook identity
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSession, useLiveChat, sessionsLoading, sessions]);

  // After a completed turn, refresh server session list (title / ordering)
  const prevStreamingRef = useRef(false);
  useEffect(() => {
    const wasStreaming = prevStreamingRef.current;
    prevStreamingRef.current = streamHook.isStreaming;
    if (!useLiveChat || streamHook.isStreaming || !wasStreaming) return;
    if (messages.length === 0) return;
    void (async () => {
      await refreshSessions();
    })();
  }, [useLiveChat, streamHook.isStreaming, messages.length, refreshSessions]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Auto-send a prompt prefilled from the dashboard AI widget (/chat?q=...).
  const sentInitialRef = useRef(false);
  useEffect(() => {
    if (initialPrompt && !sentInitialRef.current && !historyLoading) {
      sentInitialRef.current = true;
      void onSend(initialPrompt.trim());
    }
  }, [initialPrompt, onSend, historyLoading]);

  async function handleNewChat() {
    // Lazy PG create on first message (write_back) — avoid empty sidebar shells (BUG-MEM0-3)
    const nextId = newSessionId();
    hydratedSessionRef.current = nextId;
    streamHook.reset();
    setMockMessages([]);
    setActiveSession(nextId);
  }

  async function handleSelectSession(sessionId: string) {
    if (sessionId === activeSession) return;
    hydratedSessionRef.current = null;
    setActiveSession(sessionId);
  }

  if (isLoading || !isAllowed) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
        Loading...
      </div>
    );
  }

  const isEmpty = messages.length === 0 && !historyLoading;

  return (
    <div
      className="flex h-full overflow-hidden"
      style={{ backgroundColor: "#E8F3FC" }}
    >
      <aside
        className="flex w-60 shrink-0 flex-col border-r border-gray-200 bg-white"
        style={{ minWidth: "240px" }}
      >
        <div className="border-b border-gray-100 p-3">
          <button
            type="button"
            onClick={() => void handleNewChat()}
            className="flex w-full items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90"
            style={{ backgroundColor: "#1a007d" }}
          >
            <PlusIcon className="size-4" />
            New Chat
          </button>
        </div>

        <div className="flex-1 overflow-y-auto py-2">
          <p className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wide text-gray-400">
            Recent Sessions
          </p>
          {sessionsLoading && sessions.length === 0 ? (
            <p className="px-3 py-4 text-xs text-gray-400">Loading sessions…</p>
          ) : sessionsError && sessions.length === 0 ? (
            <p className="px-3 py-4 text-xs text-amber-700">{sessionsError}</p>
          ) : sessions.length === 0 ? (
            <p className="px-3 py-4 text-xs text-gray-400">No sessions yet</p>
          ) : (
            sessions.map((session) => (
              <button
                key={session.id}
                type="button"
                onClick={() => void handleSelectSession(session.id)}
                className={`flex w-full flex-col gap-0.5 px-3 py-2.5 text-left transition-colors hover:bg-gray-50 ${
                  activeSession === session.id
                    ? "bg-blue-50 border-r-2 border-[#0062a1]"
                    : ""
                }`}
              >
                <div className="flex items-start gap-2">
                  <MessageSquareIcon className="mt-0.5 size-3.5 shrink-0 text-gray-400" />
                  <span className="text-xs font-medium text-gray-800 leading-snug line-clamp-2">
                    {session.title || "Conversation"}
                  </span>
                </div>
                <span className="ml-5 text-[10px] text-gray-400">
                  {formatSessionTimestamp(
                    session.last_message_at || session.updated_at || session.created_at
                  )}
                </span>
              </button>
            ))
          )}
        </div>
      </aside>

      <div className="flex flex-1 flex-col overflow-hidden">
        <AgentPills activeAgent={activeAgent} />

        {isStreaming && (
          <div className="flex items-center gap-2 border-b border-gray-100 bg-white px-4 py-1.5">
            <SupervisorBadge isActive={isStreaming} />
          </div>
        )}

        {!useLiveChat && (
          <div className="border-b border-amber-100 bg-amber-50 px-4 py-2 text-xs text-amber-800">
            Offline mode — set NEXT_PUBLIC_AI_API_URL and start the FastAPI backend
            (cd AI && uvicorn main:app --reload --port 8000).
          </div>
        )}

        {useLiveChat && streamHook.error && (
          <div className="border-b border-amber-100 bg-amber-50 px-4 py-2 text-xs text-amber-800">
            {streamHook.error}
          </div>
        )}

        {historyLoading && (
          <div className="border-b border-gray-100 bg-white px-4 py-2 text-xs text-gray-500">
            Loading conversation…
          </div>
        )}

        <div className="flex-1 overflow-y-auto py-4">
          {isEmpty ? (
            <WelcomeState onQuickAction={(text) => void onSend(text)} />
          ) : (
            <>
              <WelcomeHeader />
              <div className="mt-2 flex flex-col gap-1">
                {messages.map((msg) => (
                  <MessageBubble
                    key={msg.id}
                    message={msg as ChatMessage}
                    isStreaming={
                      isStreaming && msg === messages[messages.length - 1]
                    }
                  />
                ))}
              </div>
            </>
          )}
          <div ref={bottomRef} />
        </div>

        <ChatInput
          onSend={(text) => void onSend(text)}
          isDisabled={isStreaming || historyLoading}
        />
      </div>
    </div>
  );
}

function WelcomeHeader() {
  return (
    <div className="flex flex-col items-center gap-1 px-4 pb-4 pt-2">
      <div
        className="flex size-12 items-center justify-center rounded-full"
        style={{ backgroundColor: "#1a007d18" }}
      >
        <SparklesIcon className="size-6" style={{ color: "#1a007d" }} />
      </div>
    </div>
  );
}

function WelcomeState({
  onQuickAction,
}: {
  onQuickAction: (text: string) => void;
}) {
  return (
    <div className="flex flex-col items-center gap-6 px-4 pt-10">
      <div
        className="flex size-16 items-center justify-center rounded-full"
        style={{ backgroundColor: "#1a007d18" }}
      >
        <SparklesIcon className="size-8" style={{ color: "#1a007d" }} />
      </div>
      <div className="text-center">
        <h2 className="text-xl font-bold text-gray-900">
          How can I help you today?
        </h2>
        <p className="mt-1 text-sm text-gray-500 max-w-md">
          I can assist with patient records, diagnostic interpretations,
          scheduling, and coordinating with specialized hospital agents.
        </p>
      </div>
      <QuickActionCards onSelect={onQuickAction} />
    </div>
  );
}
