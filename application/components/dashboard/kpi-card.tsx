import type { LucideIcon } from "lucide-react"

interface KpiCardProps {
  title: string
  value: string | number
  change?: string
  icon: LucideIcon
  color?: string
}

export function KpiCard({
  title,
  value,
  change,
  icon: Icon,
  color = "#0062a1",
}: KpiCardProps) {
  return (
    <div className="bg-white rounded-xl shadow-sm p-5 flex items-start gap-4 min-w-0">
      <div
        className="flex items-center justify-center rounded-full w-11 h-11 shrink-0"
        style={{ backgroundColor: `${color}1a` }}
      >
        <Icon size={22} style={{ color }} />
      </div>
      <div className="min-w-0">
        <p className="text-sm text-muted-foreground font-medium truncate">{title}</p>
        <p className="text-2xl font-bold text-gray-900 leading-tight mt-0.5">{value}</p>
        {change && (
          <p className="text-xs text-muted-foreground mt-0.5">{change}</p>
        )}
      </div>
    </div>
  )
}
