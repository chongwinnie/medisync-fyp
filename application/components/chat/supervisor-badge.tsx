"use client"

import { SparklesIcon } from "lucide-react"

interface SupervisorBadgeProps {
  isActive: boolean
}

export function SupervisorBadge({ isActive }: SupervisorBadgeProps) {
  if (!isActive) return null

  return (
    <div
      className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold text-white animate-pulse"
      style={{ backgroundColor: "#1a007d" }}
    >
      <SparklesIcon className="size-3" />
      Supervisor Routing Active
    </div>
  )
}
