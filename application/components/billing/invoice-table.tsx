"use client";

import { useState } from "react";
import type { Invoice, InvoiceStatus } from "@/lib/data/billing";
import { Button } from "@/components/ui/button";
import {
  CheckCircle2,
  Send,
  XCircle,
  FileText,
  Clock,
  FileDown,
  Mail,
  Check,
} from "lucide-react";

const STATUS_CONFIG: Record<InvoiceStatus, { label: string; color: string; bg: string; icon: React.ElementType }> = {
  draft:     { label: "Draft",     color: "#6b7280", bg: "#f3f4f6", icon: FileText },
  sent:      { label: "Sent",      color: "#0062a1", bg: "#eff6ff", icon: Send },
  paid:      { label: "Paid",      color: "#16a34a", bg: "#f0fdf4", icon: CheckCircle2 },
  overdue:   { label: "Overdue",   color: "#dc2626", bg: "#fef2f2", icon: Clock },
  cancelled: { label: "Cancelled", color: "#9ca3af", bg: "#f9fafb", icon: XCircle },
};

interface InvoiceTableProps {
  invoices: Invoice[];
  onStatusChange?: (invoiceId: string, status: InvoiceStatus) => Promise<void>;
}

export function InvoiceTable({ invoices, onStatusChange }: InvoiceTableProps) {
  const [updating, setUpdating] = useState<string | null>(null);
  const [sendingEmail, setSendingEmail] = useState<string | null>(null);
  const [notification, setNotification] = useState<{ id: string; text: string; error?: boolean } | null>(null);

  async function handleStatusChange(id: string, status: InvoiceStatus) {
    if (!onStatusChange) return;
    setUpdating(id);
    try {
      await onStatusChange(id, status);
    } finally {
      setUpdating(null);
    }
  }

  async function handleSendEmail(id: string, invoiceNumber: string) {
    setSendingEmail(id);
    setNotification(null);
    try {
      const res = await fetch(`/api/billing/invoices/${id}/email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setNotification({
          id,
          text: `Emailed to ${data.data?.recipient || "patient"}`,
        });
        if (onStatusChange) {
          // If invoice was draft, update state to sent
          await onStatusChange(id, "sent");
        }
      } else {
        setNotification({
          id,
          text: data.error || "Email failed",
          error: true,
        });
      }
    } catch {
      setNotification({
        id,
        text: "Network error",
        error: true,
      });
    } finally {
      setSendingEmail(null);
    }
  }

  if (invoices.length === 0) {
    return (
      <div className="text-center py-12 text-gray-400 text-sm">
        No invoices found.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-100">
            {["Invoice #", "Patient", "Amount", "Status", "Due Date", "Created", "Actions"].map((h) => (
              <th key={h} className="text-left py-3 px-3 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {invoices.map((inv) => {
            const cfg = STATUS_CONFIG[inv.status];
            const Icon = cfg.icon;
            const isUpdating = updating === inv.id;
            const isSending = sendingEmail === inv.id;
            const notif = notification?.id === inv.id ? notification : null;

            return (
              <tr key={inv.id} className="hover:bg-gray-50/50 transition-colors">
                <td className="py-3 px-3 font-mono text-xs font-medium text-[#002444]">
                  {inv.invoice_number}
                </td>
                <td className="py-3 px-3">
                  <div className="font-medium text-gray-900 truncate max-w-[140px]">{inv.patient_name}</div>
                  <div className="text-xs text-gray-400">{inv.patient_code}</div>
                </td>
                <td className="py-3 px-3 font-semibold text-gray-900">
                  ${inv.total_amount.toFixed(2)}
                </td>
                <td className="py-3 px-3">
                  <span
                    className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium"
                    style={{ color: cfg.color, backgroundColor: cfg.bg }}
                  >
                    <Icon size={11} />
                    {cfg.label}
                  </span>
                </td>
                <td className="py-3 px-3 text-gray-600">
                  {inv.due_date ?? "—"}
                </td>
                <td className="py-3 px-3 text-gray-500 text-xs">
                  {new Date(inv.created_at).toLocaleDateString("en-GB")}
                </td>
                <td className="py-3 px-3">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {inv.status === "draft" && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 px-2 text-xs"
                        disabled={isUpdating}
                        onClick={() => handleStatusChange(inv.id, "sent")}
                      >
                        Send
                      </Button>
                    )}
                    {(inv.status === "sent" || inv.status === "overdue") && (
                      <Button
                        size="sm"
                        className="h-7 px-2 text-xs bg-green-600 hover:bg-green-700 text-white"
                        disabled={isUpdating}
                        onClick={() => handleStatusChange(inv.id, "paid")}
                      >
                        Mark Paid
                      </Button>
                    )}
                    {inv.status !== "cancelled" && inv.status !== "paid" && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 px-2 text-xs text-gray-400 hover:text-red-500"
                        disabled={isUpdating}
                        onClick={() => handleStatusChange(inv.id, "cancelled")}
                      >
                        Cancel
                      </Button>
                    )}

                    {/* Email Patient Action */}
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 px-2 text-xs text-[#0062a1] border-blue-200 bg-blue-50/50 hover:bg-blue-100/70"
                      disabled={isSending || isUpdating}
                      onClick={() => handleSendEmail(inv.id, inv.invoice_number)}
                      title="Dispatch Invoice to Patient Email"
                    >
                      {isSending ? (
                        <div className="size-3 rounded-full border-2 border-blue-300 border-t-[#0062a1] animate-spin mr-1" />
                      ) : (
                        <Mail size={12} className="mr-1 text-[#0062a1]" />
                      )}
                      {isSending ? "Sending..." : "Email"}
                    </Button>

                    {/* Download PDF Action */}
                    <a
                      href={`/api/pdf/invoice/${inv.id}?download=1`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 h-7 px-2 text-xs font-medium rounded-md border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 hover:text-[#0062a1] transition-colors shadow-2xs"
                      title="Download Official PDF Invoice"
                    >
                      <FileDown size={12} />
                      PDF
                    </a>

                    {notif && (
                      <span className={`inline-flex items-center text-[10px] font-medium px-1.5 py-0.5 rounded ${
                        notif.error ? "bg-red-50 text-red-600" : "bg-green-50 text-green-700"
                      }`}>
                        {!notif.error && <Check size={10} className="mr-0.5" />}
                        {notif.text}
                      </span>
                    )}

                    {isUpdating && (
                      <div className="size-4 rounded-full border-2 border-gray-200 border-t-[#0062a1] animate-spin" />
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
