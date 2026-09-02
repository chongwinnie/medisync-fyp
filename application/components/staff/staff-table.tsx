"use client"

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Button } from "@/components/ui/button"

export interface StaffMember {
  id: string
  staff_code: string
  full_name: string
  role: "doctor" | "nurse" | "admin"
  department?: string
  specialization?: string
  phone?: string
  is_active: boolean
}

const ROLE_COLORS: Record<StaffMember["role"], { bg: string; text: string }> = {
  doctor: { bg: "#0F6E56", text: "#fff" },
  nurse: { bg: "#993556", text: "#fff" },
  admin: { bg: "#3C3489", text: "#fff" },
}

interface StaffTableProps {
  staff: StaffMember[]
}

export function StaffTable({ staff }: StaffTableProps) {
  return (
    <div className="rounded-xl bg-white shadow-sm overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="bg-gray-50">
            <TableHead className="font-semibold text-xs uppercase tracking-wide text-gray-500">Code</TableHead>
            <TableHead className="font-semibold text-xs uppercase tracking-wide text-gray-500">Name</TableHead>
            <TableHead className="font-semibold text-xs uppercase tracking-wide text-gray-500">Role</TableHead>
            <TableHead className="font-semibold text-xs uppercase tracking-wide text-gray-500">Department</TableHead>
            <TableHead className="font-semibold text-xs uppercase tracking-wide text-gray-500">Specialization</TableHead>
            <TableHead className="font-semibold text-xs uppercase tracking-wide text-gray-500">Active</TableHead>
            <TableHead className="font-semibold text-xs uppercase tracking-wide text-gray-500 text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {staff.map((member) => {
            const roleColor = ROLE_COLORS[member.role]
            return (
              <TableRow key={member.id} className="hover:bg-gray-50/60">
                <TableCell className="font-mono text-sm text-gray-500">{member.staff_code}</TableCell>
                <TableCell className="font-medium text-gray-900">{member.full_name}</TableCell>
                <TableCell>
                  <span
                    className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium capitalize"
                    style={{ backgroundColor: roleColor.bg, color: roleColor.text }}
                  >
                    {member.role}
                  </span>
                </TableCell>
                <TableCell className="text-gray-700">{member.department ?? "—"}</TableCell>
                <TableCell className="text-gray-700">{member.specialization ?? "—"}</TableCell>
                <TableCell>
                  {member.is_active ? (
                    <span className="inline-flex items-center gap-1 text-xs font-medium text-white px-2.5 py-0.5 rounded-full" style={{ backgroundColor: "#639922" }}>
                      Active
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-xs font-medium text-white px-2.5 py-0.5 rounded-full" style={{ backgroundColor: "#E24B4A" }}>
                      Inactive
                    </span>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => { /* TODO: wire in Phase 2 */ }}
                    >
                      Edit
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-red-600 border-red-200 hover:bg-red-50 hover:text-red-700"
                      onClick={() => { /* TODO: wire in Phase 2 */ }}
                    >
                      Deactivate
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            )
          })}
          {staff.length === 0 && (
            <TableRow>
              <TableCell colSpan={7} className="text-center py-8 text-gray-400">
                No staff members found.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  )
}
