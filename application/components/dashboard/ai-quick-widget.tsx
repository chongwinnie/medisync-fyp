"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Sparkles, ArrowRight } from "lucide-react";

const QUICK_ACTIONS = [
  "Summarize my patients",
  "Draft a treatment plan",
  "Check inventory",
];

export function AiQuickWidget() {
  const router = useRouter();
  const [query, setQuery] = useState("");

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const text = query.trim();
    router.push(text ? `/chat?q=${encodeURIComponent(text)}` : "/chat");
  }

  return (
    <div className="bg-white rounded-xl shadow-sm overflow-hidden">
      <div
        className="flex items-center gap-2 px-5 py-3"
        style={{ backgroundColor: "#1a007d" }}
      >
        <Sparkles size={16} className="text-white/80" />
        <span className="text-sm font-semibold text-white tracking-wide">
          MediSync AI
        </span>
      </div>

      <div className="p-5 flex flex-col gap-4">
        <form
          onSubmit={handleSubmit}
          className="flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2.5 bg-gray-50 transition-colors focus-within:border-[#1a007d]/40 focus-within:bg-white"
        >
          <input
            type="text"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Ask anything about today&apos;s patients…"
            aria-label="Ask MediSync AI"
            className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
          />
          <button
            type="submit"
            aria-label="Send to MediSync AI"
            className="shrink-0 text-[#1a007d] transition-opacity hover:opacity-80"
          >
            <ArrowRight size={16} />
          </button>
        </form>

        <div className="flex flex-wrap gap-2">
          {QUICK_ACTIONS.map((action) => (
            <Link
              key={action}
              href={`/chat?q=${encodeURIComponent(action)}`}
              className="inline-flex items-center rounded-full border border-[#1a007d]/20 bg-[#1a007d]/5 px-3 py-1 text-xs font-medium text-[#1a007d] hover:bg-[#1a007d]/10 transition-colors"
            >
              {action}
            </Link>
          ))}
        </div>

        <Link
          href="/chat"
          className="inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:opacity-90"
          style={{ backgroundColor: "#1a007d" }}
        >
          Chat with MediSync AI
          <ArrowRight size={15} />
        </Link>
      </div>
    </div>
  );
}
