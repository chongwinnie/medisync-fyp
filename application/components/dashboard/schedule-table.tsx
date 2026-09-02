import { cn } from "@/lib/utils"

export interface ScheduleItem {
  time: string
  patient: string
  type: string
  room?: string
  status: "scheduled" | "in_progress" | "completed" | "cancelled"
}

const statusConfig: Record<
  ScheduleItem["status"],
  { label: string; className: string }
> = {
  scheduled: {
    label: "Scheduled",
    className: "bg-blue-100 text-blue-700",
  },
  in_progress: {
    label: "In Progress",
    className: "bg-[#0062a1]/15 text-[#0062a1]",
  },
  completed: {
    label: "Completed",
    className: "bg-[#639922]/15 text-[#639922]",
  },
  cancelled: {
    label: "Cancelled",
    className: "bg-[#E24B4A]/15 text-[#E24B4A]",
  },
}

interface ScheduleTableProps {
  items: ScheduleItem[]
}

export function ScheduleTable({ items }: ScheduleTableProps) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-100">
            <th className="text-left py-2 px-3 font-medium text-muted-foreground text-xs uppercase tracking-wide">
              Time
            </th>
            <th className="text-left py-2 px-3 font-medium text-muted-foreground text-xs uppercase tracking-wide">
              Patient
            </th>
            <th className="text-left py-2 px-3 font-medium text-muted-foreground text-xs uppercase tracking-wide">
              Type
            </th>
            <th className="text-left py-2 px-3 font-medium text-muted-foreground text-xs uppercase tracking-wide">
              Room
            </th>
            <th className="text-left py-2 px-3 font-medium text-muted-foreground text-xs uppercase tracking-wide">
              Status
            </th>
          </tr>
        </thead>
        <tbody>
          {items.map((item, index) => {
            const { label, className } = statusConfig[item.status]
            return (
              <tr
                key={index}
                className="border-b border-gray-50 hover:bg-gray-50/60 transition-colors"
              >
                <td className="py-3 px-3 font-medium text-gray-700 whitespace-nowrap">
                  {item.time}
                </td>
                <td className="py-3 px-3 text-gray-900 font-medium">{item.patient}</td>
                <td className="py-3 px-3 text-gray-600">{item.type}</td>
                <td className="py-3 px-3 text-[#0062a1] font-medium">
                  {item.room ?? "—"}
                </td>
                <td className="py-3 px-3">
                  <span
                    className={cn(
                      "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
                      className
                    )}
                  >
                    {label}
                  </span>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
