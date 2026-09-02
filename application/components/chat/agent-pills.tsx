"use client"

import { useServerRole } from "@/components/providers/role-provider"
import type { Role } from "@/lib/auth/role-guard"

const ALL_AGENTS = [
  { key: "supervisor", label: "Supervisor", color: "#1a007d", roles: ["doctor", "nurse", "admin"] as Role[] },
  { key: "patient_management", label: "Patient Management", color: "#0062a1", roles: ["doctor", "nurse", "admin"] as Role[] },
  { key: "medical_diagnostics", label: "Medical Diagnostics", color: "#639922", roles: ["doctor", "nurse", "admin"] as Role[] },
  { key: "appointment", label: "Appointments", color: "#BA7517", roles: ["admin"] as Role[] },
  { key: "inventory", label: "Inventory", color: "#E24B4A", roles: ["nurse", "admin"] as Role[] },
  { key: "staff", label: "Staff", color: "#002444", roles: ["admin"] as Role[] },
]

interface AgentPillsProps {
  activeAgent: string | null
}

export function AgentPills({ activeAgent }: AgentPillsProps) {
  const role = useServerRole()
  const agents = role
    ? ALL_AGENTS.filter((agent) => agent.roles.includes(role))
    : ALL_AGENTS

  return (
    <div className="flex items-center gap-2 flex-wrap px-4 py-2 border-b border-gray-100 bg-white">
      <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 mr-1 shrink-0">
        Available Agents:
      </span>
      {agents.map((agent) => {
        const isActive = activeAgent === agent.key
        return (
          <span
            key={agent.key}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-all duration-200"
            style={
              isActive
                ? {
                    backgroundColor: agent.color,
                    borderColor: agent.color,
                    color: "#fff",
                  }
                : {
                    backgroundColor: `${agent.color}12`,
                    borderColor: `${agent.color}40`,
                    color: agent.color,
                  }
            }
          >
            <span
              className="size-1.5 rounded-full"
              style={{ backgroundColor: isActive ? "#fff" : agent.color }}
            />
            {agent.label}
          </span>
        )
      })}
    </div>
  )
}
