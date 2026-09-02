"use client"

import {
  UsersIcon,
  ClipboardListIcon,
  CalendarCheckIcon,
  PackageIcon,
  CalendarDaysIcon,
  BanknoteIcon,
} from "lucide-react"
import { useAuth } from "@/hooks/use-auth"

type Role = "doctor" | "nurse" | "admin"

const QUICK_ACTIONS: Array<{
  icon: typeof UsersIcon
  title: string
  description: string
  roles: Role[]
}> = [
  {
    icon: UsersIcon,
    title: "Summarize my patients today",
    description: "Get a quick briefing of today's patient roster and status.",
    roles: ["doctor", "nurse", "admin"],
  },
  {
    icon: ClipboardListIcon,
    title: "Draft a treatment plan for [patient]",
    description: "Generate a structured treatment plan template.",
    roles: ["doctor", "nurse", "admin"],
  },
  {
    icon: CalendarCheckIcon,
    title: "Check appointment conflicts",
    description: "Review scheduling conflicts for the upcoming session.",
    roles: ["admin"],
  },
  {
    icon: PackageIcon,
    title: "Review inventory alerts",
    description: "Check low-stock and expiry alerts for medical supplies.",
    roles: ["nurse", "admin"],
  },
  {
    icon: CalendarDaysIcon,
    title: "Show today's staff schedule",
    description: "Display shift assignments and coverage for today.",
    roles: ["admin"],
  },
  {
    icon: BanknoteIcon,
    title: "Generate payroll summary",
    description: "Compile this period's payroll report for staff.",
    roles: ["admin"],
  },
]

interface QuickActionCardsProps {
  onSelect: (text: string) => void
}

export function QuickActionCards({ onSelect }: QuickActionCardsProps) {
  const { role } = useAuth()
  const actions = QUICK_ACTIONS.filter((action) =>
    role ? action.roles.includes(role) : action.roles.includes("doctor")
  )

  return (
    <div className="grid grid-cols-1 gap-3 px-4 sm:grid-cols-2 lg:grid-cols-3">
      {actions.map(({ icon: Icon, title, description }) => (
        <button
          key={title}
          onClick={() => onSelect(title)}
          className="flex flex-col gap-2 rounded-xl border border-gray-200 bg-white p-4 text-left shadow-sm transition-all duration-150 hover:border-[#0062a1] hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1a007d]"
        >
          <div
            className="flex size-8 items-center justify-center rounded-lg"
            style={{ backgroundColor: "#0062a115" }}
          >
            <Icon className="size-4" style={{ color: "#0062a1" }} />
          </div>
          <p className="text-sm font-semibold text-gray-900">{title}</p>
          <p className="text-xs text-gray-500 leading-relaxed">{description}</p>
        </button>
      ))}
    </div>
  )
}
