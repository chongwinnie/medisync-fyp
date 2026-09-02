"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import { streamChat, SSEEvent } from "@/lib/api/chat-client";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  agent?: string | null;
}

export interface UseChatStreamOptions {
  sessionId: string;
}

export interface UseChatStreamReturn {
  messages: ChatMessage[];
  isStreaming: boolean;
  activeAgent: string | null;
  error: string | null;
  send: (text: string) => Promise<void>;
  reset: () => void;
  loadMessages: (messages: ChatMessage[]) => void;
  setMessages: Dispatch<SetStateAction<ChatMessage[]>>;
}

export function useChatStream({ sessionId }: UseChatStreamOptions): UseChatStreamReturn {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [activeAgent, setActiveAgent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const streamingMessageIdRef = useRef<string | null>(null);
  const sessionIdRef = useRef(sessionId);

  // Abort in-flight stream and clear when session id changes (parent hydrates separately).
  useEffect(() => {
    if (sessionIdRef.current === sessionId) return;
    sessionIdRef.current = sessionId;
    abortControllerRef.current?.abort();
    setIsStreaming(false);
    setActiveAgent(null);
    setError(null);
  }, [sessionId]);

  const send = useCallback(
    async (text: string) => {
      if (isStreaming) return;

      const userMessageId = crypto.randomUUID();
      const assistantMessageId = crypto.randomUUID();
      streamingMessageIdRef.current = assistantMessageId;

      setError(null);
      setIsStreaming(true);
      setActiveAgent(null);
      setMessages((prev) => [
        ...prev,
        { id: userMessageId, role: "user", content: text, agent: null },
        { id: assistantMessageId, role: "assistant", content: "", agent: null },
      ]);

      abortControllerRef.current = new AbortController();

      await streamChat({
        message: text,
        sessionId: sessionIdRef.current,
        signal: abortControllerRef.current.signal,
        onEvent: (event: SSEEvent) => {
          if (event.type === "token") {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantMessageId
                  ? { ...m, content: m.content + event.content }
                  : m
              )
            );
          } else if (event.type === "agent") {
            setActiveAgent(event.name);
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantMessageId ? { ...m, agent: event.name } : m
              )
            );
          }
        },
        onComplete: () => {
          setIsStreaming(false);
          setActiveAgent(null);
        },
        onError: (errMsg) => {
          setError(errMsg);
          setIsStreaming(false);
          setActiveAgent(null);
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantMessageId
                ? { ...m, content: `Error: ${errMsg}` }
                : m
            )
          );
        },
      });
    },
    [isStreaming]
  );

  const reset = useCallback(() => {
    abortControllerRef.current?.abort();
    setMessages([]);
    setIsStreaming(false);
    setActiveAgent(null);
    setError(null);
  }, []);

  const loadMessages = useCallback((next: ChatMessage[]) => {
    abortControllerRef.current?.abort();
    setIsStreaming(false);
    setActiveAgent(null);
    setError(null);
    setMessages(next);
  }, []);

  return {
    messages,
    isStreaming,
    activeAgent,
    error,
    send,
    reset,
    loadMessages,
    setMessages,
  };
}
