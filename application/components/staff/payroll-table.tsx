"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { processPayrollAction } from "@/lib/actions/staff"

export interface PayrollRecord {
  id: string
  staff_name: string
  pay_month: number
  pay_year: number
  days_worked: number
  base_salary: number
  overtime_pay: number
  deductions: number
  net_pay: number
  status: "draft" | "processed" | "paid" | "cancelled"
}

const STATUS_STYLES: Record<
  PayrollRecord["status"],
  { bg: string; text: string; label: string }
> = {
  draft: { bg: "#f3f4f6", text: "#6b7280", label: "Draft" },
  processed: { bg: "#dbeafe", text: "#0062a1", label: "Processed" },
  paid: { bg: "#639922", text: "#fff", label: "Paid" },
  cancelled: { bg: "#E24B4A", text: "#fff", label: "Cancelled" },
}

const MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
]

function formatCurrency(amount: number): string {
  return `RM ${amount.toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

interface PayrollTableProps {
  records: PayrollRecord[]
}

export function PayrollTable({ records }: PayrollTableProps) {
  const router = useRouter()
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleProcess(payrollId: string) {
    setError(null)
    setBusyId(payrollId)
    startTransition(async () => {
      const result = await processPayrollAction({ payrollId })
      setBusyId(null)
      if (!result.success) {
        setError(result.error ?? "Failed to process payroll")
        return
      }
      if (result.stripeStatus === "skipped" && result.error) {
        setError(result.error)
      }
      router.refresh()
    })
  }

  return (
    <div className="rounded-xl bg-white shadow-sm overflow-hidden">
      {error && (
        <p className="px-4 py-2 text-sm text-red-600 border-b border-red-100" role="alert">
          {error}
        </p>
      )}
      <Table>
        <TableHeader>
          <TableRow className="bg-gray-50">
            <TableHead className="font-semibold text-xs uppercase tracking-wide text-gray-500">Staff</TableHead>
            <TableHead className="font-semibold text-xs uppercase tracking-wide text-gray-500">Period</TableHead>
            <TableHead className="font-semibold text-xs uppercase tracking-wide text-gray-500 text-right">Days</TableHead>
            <TableHead className="font-semibold text-xs uppercase tracking-wide text-gray-500 text-right">Base Salary</TableHead>
            <TableHead className="font-semibold text-xs uppercase tracking-wide text-gray-500 text-right">Overtime</TableHead>
            <TableHead className="font-semibold text-xs uppercase tracking-wide text-gray-500 text-right">Deductions</TableHead>
            <TableHead className="font-semibold text-xs uppercase tracking-wide text-gray-500 text-right">Net Pay</TableHead>
            <TableHead className="font-semibold text-xs uppercase tracking-wide text-gray-500">Status</TableHead>
            <TableHead className="font-semibold text-xs uppercase tracking-wide text-gray-500 text-right">Action</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {records.map((record) => {
            const style = STATUS_STYLES[record.status]
            return (
              <TableRow key={record.id} className="hover:bg-gray-50/60">
                <TableCell className="font-medium text-gray-900">{record.staff_name}</TableCell>
                <TableCell className="text-sm text-gray-700">
                  {MONTH_NAMES[record.pay_month - 1]} {record.pay_year}
                </TableCell>
                <TableCell className="text-sm text-gray-700 text-right">{record.days_worked}</TableCell>
                <TableCell className="text-sm text-gray-700 text-right">{formatCurrency(record.base_salary)}</TableCell>
                <TableCell className="text-sm text-right">
                  {record.overtime_pay > 0 ? (
                    <span style={{ color: "#BA7517" }} className="font-medium">
                      {formatCurrency(record.overtime_pay)}
                    </span>
                  ) : (
                    <span className="text-gray-400">—</span>
                  )}
                </TableCell>
                <TableCell className="text-sm text-right">
                  {record.deductions > 0 ? (
                    <span style={{ color: "#E24B4A" }}>
                      -{formatCurrency(record.deductions)}
                    </span>
                  ) : (
                    <span className="text-gray-400">—</span>
                  )}
                </TableCell>
                <TableCell className="text-sm font-semibold text-right" style={{ color: "#002444" }}>
                  {formatCurrency(record.net_pay)}
                </TableCell>
                <TableCell>
                  <span
                    className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium"
                    style={{ backgroundColor: style.bg, color: style.text }}
                  >
                    {style.label}
                  </span>
                </TableCell>
                <TableCell className="text-right">
                  {(record.status === "draft" || record.status === "processed") && (
                    <Button
                      size="sm"
                      className="font-semibold"
                      style={{ backgroundColor: "#0062a1", color: "#fff" }}
                      disabled={isPending && busyId === record.id}
                      onClick={() => handleProcess(record.id)}
                    >
                      {busyId === record.id
                        ? "Paying…"
                        : record.status === "processed"
                          ? "Pay (Stripe)"
                          : "Process (Stripe)"}
                    </Button>
                  )}
                  {record.status === "paid" && (
                    <span className="text-xs text-gray-500">Paid</span>
                  )}
                </TableCell>
              </TableRow>
            )
          })}
          {records.length === 0 && (
            <TableRow>
              <TableCell colSpan={9} className="text-center py-8 text-gray-400">
                No payroll records found.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  )
}
