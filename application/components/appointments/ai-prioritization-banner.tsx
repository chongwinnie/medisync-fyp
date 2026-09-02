"use client";

import { useState } from "react";
import { XIcon, BotIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

interface AIPrioritizationBannerProps {
  waitingCount?: number;
}

export function AIPrioritizationBanner({
  waitingCount = 0,
}: AIPrioritizationBannerProps) {
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) return null;

  const label =
    waitingCount > 0
      ? `${waitingCount} patient${waitingCount === 1 ? "" : "s"} waiting — call next in queue order`
      : "Queue is clear — no waiting patients right now";

  return (
    <div
      className="flex items-center justify-between rounded-xl px-4 py-3"
      style={{ backgroundColor: "#1a007d" }}
    >
      <div className="flex items-center gap-3">
        <BotIcon className="size-4 shrink-0 text-white/80" />
        <p className="text-sm font-medium text-white">
          Queue assist — <span className="font-semibold">{label}</span>
        </p>
      </div>
      <Button
        variant="ghost"
        size="icon-sm"
        className="text-white/70 hover:bg-white/10 hover:text-white"
        onClick={() => setDismissed(true)}
        aria-label="Dismiss AI banner"
      >
        <XIcon className="size-4" />
      </Button>
    </div>
  );
}
