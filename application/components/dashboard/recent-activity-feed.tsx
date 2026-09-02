import Link from "next/link"
import { Stethoscope, Settings, Calendar } from "lucide-react"

export interface ActivityItem {
  id: string
  message: string
  timestamp: string
  type: "clinical" | "system" | "appointment"
}

const typeConfig: Record<
  ActivityItem["type"],
  { icon: typeof Stethoscope; bg: string; color: string }
> = {
  clinical: {
    icon: Stethoscope,
    bg: "bg-[#0062a1]/10",
    color: "text-[#0062a1]",
  },
  system: {
    icon: Settings,
    bg: "bg-gray-100",
    color: "text-gray-500",
  },
  appointment: {
    icon: Calendar,
    bg: "bg-[#639922]/10",
    color: "text-[#639922]",
  },
}

interface RecentActivityFeedProps {
  items: ActivityItem[]
}

export function RecentActivityFeed({ items }: RecentActivityFeedProps) {
  const displayed = items.slice(0, 6)

  return (
    <div className="flex flex-col gap-1">
      {displayed.map((item) => {
        const { icon: Icon, bg, color } = typeConfig[item.type]
        return (
          <div key={item.id} className="flex items-start gap-3 py-2.5 border-b border-gray-50 last:border-0">
            <div className={`flex items-center justify-center rounded-full w-8 h-8 shrink-0 ${bg}`}>
              <Icon size={15} className={color} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm text-gray-800 leading-snug">{item.message}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{item.timestamp}</p>
            </div>
          </div>
        )
      })}
      <Link
        href="/dashboard"
        className="text-xs text-[#0062a1] hover:underline mt-2 self-start font-medium"
      >
        View all activity →
      </Link>
    </div>
  )
}
