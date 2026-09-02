"use client"

import { PatientCardEmbed } from "./patient-card-embed"

export interface ChatMessage {
  id: string
  role: "user" | "assistant" | "system"
  content: string
  agent?: string | null
}

const AGENT_LABELS: Record<string, string> = {
  supervisor: "Supervisor",
  patient_management: "Patient Management Agent",
  medical_diagnostics: "Medical Diagnostics Agent",
  appointment_scheduling: "Appointment Agent",
  appointment: "Appointment Agent",
  inventory_resource: "Inventory Agent",
  inventory: "Inventory Agent",
  staff_management: "Staff Management Agent",
  staff: "Staff Management Agent",
}

const AGENT_COLORS: Record<string, string> = {
  supervisor: "#1a007d",
  patient_management: "#0062a1",
  medical_diagnostics: "#639922",
  appointment_scheduling: "#BA7517",
  appointment: "#BA7517",
  inventory_resource: "#E24B4A",
  inventory: "#E24B4A",
  staff_management: "#002444",
  staff: "#002444",
}

// Matches [patient_card:some-id]
const PATIENT_CARD_RE = /\[patient_card:([^\]]+)\]/g

function renderContent(content: string) {
  const parts: React.ReactNode[] = []
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = PATIENT_CARD_RE.exec(content)) !== null) {
    if (match.index > lastIndex) {
      parts.push(
        <span key={lastIndex}>{content.slice(lastIndex, match.index)}</span>
      )
    }
    parts.push(<PatientCardEmbed key={match.index} patientId={match[1]} />)
    lastIndex = match.index + match[0].length
  }

  if (lastIndex < content.length) {
    parts.push(<span key={lastIndex}>{content.slice(lastIndex)}</span>)
  }

  return parts.length > 0 ? parts : content
}

interface MessageBubbleProps {
  message: ChatMessage
  isStreaming?: boolean
}

export function MessageBubble({ message, isStreaming }: MessageBubbleProps) {
  const { role, content, agent } = message

  if (role === "system") return null

  if (role === "user") {
    return (
      <div className="flex justify-end px-4 py-1">
        <div
          className="max-w-[70%] rounded-2xl rounded-br-sm px-4 py-3 text-sm text-white shadow-sm"
          style={{ backgroundColor: "#0062a1" }}
        >
          {content}
        </div>
      </div>
    )
  }

  // assistant
  const agentKey = agent ?? "supervisor"
  const agentLabel = AGENT_LABELS[agentKey] ?? agentKey
  const agentColor = AGENT_COLORS[agentKey] ?? "#1a007d"

  return (
    <div className="flex flex-col gap-1 px-4 py-1">
      <div className="flex items-center gap-1.5 ml-1">
        <span
          className="text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full"
          style={{ backgroundColor: `${agentColor}18`, color: agentColor }}
        >
          {agentLabel}
        </span>
      </div>
      <div className="max-w-[75%] rounded-2xl rounded-tl-sm border border-gray-200 bg-white px-4 py-3 text-sm text-gray-800 shadow-sm">
        {renderContent(content)}
        {isStreaming && role === "assistant" && (
          <span className="ml-1 inline-flex items-end gap-0.5">
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                className="inline-block size-1.5 rounded-full bg-gray-400 animate-bounce"
                style={{ animationDelay: `${i * 150}ms` }}
              />
            ))}
          </span>
        )}
      </div>
    </div>
  )
}
