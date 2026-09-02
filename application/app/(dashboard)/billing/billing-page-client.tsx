"use client";

import { useState, useTransition } from "react";
import { useRequireRole } from "@/hooks/use-require-role";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { InvoiceTable } from "@/components/billing/invoice-table";
import type { Invoice, InvoiceStatus, BillingSummary, LineItem } from "@/lib/data/billing";
import {
  FEE_SCHEDULE,
  ENCOUNTER_PRESETS,
  CATEGORY_LABELS,
  calculateInvoiceTotals,
  type FeeScheduleItem,
  type EncounterPreset,
} from "@/lib/data/fee-schedule";
import {
  DollarSign,
  AlertTriangle,
  CheckCircle2,
  FileText,
  Plus,
  X,
  Loader2,
  Sparkles,
  Search,
  ListPlus,
  Receipt,
  Percent,
} from "lucide-react";

interface PatientOption {
  id: string;
  name: string;
  patient_code: string;
}

interface Props {
  invoices: Invoice[];
  summary: BillingSummary;
  patients?: PatientOption[];
}

const EMPTY_ITEM: LineItem = { description: "", quantity: 1, unit_price: 0 };

export function BillingPageClient({ invoices: initial, summary, patients = [] }: Props) {
  const { isLoading, isAllowed } = useRequireRole(["admin", "nurse"]);
  const [invoices, setInvoices] = useState<Invoice[]>(initial);
  const [showCreate, setShowCreate] = useState(false);
  const [patientId, setPatientId] = useState("");
  const [patientSearch, setPatientSearch] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [notes, setNotes] = useState("");
  const [taxRate, setTaxRate] = useState<number>(0);
  const [lineItems, setLineItems] = useState<LineItem[]>([{ ...EMPTY_ITEM }]);
  const [isPending, startTransition] = useTransition();
  const [createError, setCreateError] = useState("");
  const [selectedFeeCategory, setSelectedFeeCategory] = useState<string>("all");

  if (isLoading) return (
    <div className="flex h-full items-center justify-center">
      <div className="size-8 rounded-full border-4 border-gray-200 border-t-[#0062a1] animate-spin" />
    </div>
  );
  if (!isAllowed) return null;

  const { subtotal, tax, total } = calculateInvoiceTotals(lineItems, taxRate);

  function updateItem(idx: number, field: keyof LineItem, value: string | number) {
    setLineItems((prev) =>
      prev.map((item, i) => (i === idx ? { ...item, [field]: value } : item))
    );
  }

  function applyPreset(preset: EncounterPreset) {
    setLineItems(preset.lineItems.map((item) => ({ ...item })));
    if (!notes && preset.suggestedNotes) {
      setNotes(preset.suggestedNotes);
    }
  }

  function addFeeItem(item: FeeScheduleItem) {
    // If the only line item is empty, replace it; otherwise append
    setLineItems((prev) => {
      if (prev.length === 1 && !prev[0].description && prev[0].unit_price === 0) {
        return [{ description: item.description, quantity: 1, unit_price: item.defaultUnitPrice }];
      }
      return [...prev, { description: item.description, quantity: 1, unit_price: item.defaultUnitPrice }];
    });
  }

  async function handleCreate() {
    if (!patientId.trim() || lineItems.every((i) => !i.description.trim())) {
      setCreateError("Please select a patient and provide at least one valid line item.");
      return;
    }
    setCreateError("");
    startTransition(async () => {
      const res = await fetch("/api/billing/invoices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          patient_id: patientId,
          line_items: lineItems.filter((i) => i.description.trim()),
          due_date: dueDate || null,
          tax_rate: taxRate / 100,
          notes: notes || null,
        }),
      });
      if (res.ok) {
        window.location.reload();
      } else {
        const j = await res.json().catch(() => ({}));
        setCreateError(j.error ?? "Failed to create invoice.");
      }
    });
  }

  async function handleStatusChange(invoiceId: string, status: InvoiceStatus) {
    const res = await fetch(`/api/billing/invoices/${invoiceId}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (res.ok) {
      setInvoices((prev) =>
        prev.map((inv) => (inv.id === invoiceId ? { ...inv, status } : inv))
      );
    }
  }

  const filterByStatus = (status: InvoiceStatus | "all") =>
    status === "all" ? invoices : invoices.filter((i) => i.status === status);

  const filteredPatients = patients.filter((p) =>
    p.name.toLowerCase().includes(patientSearch.toLowerCase()) ||
    p.patient_code.toLowerCase().includes(patientSearch.toLowerCase())
  );

  const filteredFeeSchedule = selectedFeeCategory === "all"
    ? FEE_SCHEDULE
    : FEE_SCHEDULE.filter((f) => f.category === selectedFeeCategory);

  const summaryCards = [
    { label: "Outstanding",   value: `$${summary.outstanding_amount.toFixed(2)}`, sub: `${summary.outstanding_count} invoice(s)`, color: "#0062a1", icon: DollarSign },
    { label: "Overdue",       value: String(summary.overdue_count),               sub: "need attention",                          color: "#dc2626", icon: AlertTriangle },
    { label: "Paid (month)",  value: `$${summary.revenue_this_month.toFixed(2)}`, sub: `${summary.paid_this_month} invoice(s)`,   color: "#16a34a", icon: CheckCircle2 },
    { label: "Drafts",        value: String(summary.draft_count),                  sub: "pending review",                         color: "#9ca3af", icon: FileText },
  ];

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: "#002444" }}>Billing &amp; Invoices</h1>
          <p className="text-sm text-gray-500 mt-0.5">Manage clinical encounters, patient invoices, and revenue cycles</p>
        </div>
        <Button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 shadow-sm font-semibold"
          style={{ backgroundColor: "#0062a1" }}
        >
          <Plus size={16} /> New Clinical Invoice
        </Button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {summaryCards.map(({ label, value, sub, color, icon: Icon }) => (
          <div key={label} className="bg-white rounded-xl shadow-xs p-4 border-l-4 border border-gray-100" style={{ borderLeftColor: color }}>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs text-gray-500 uppercase tracking-wide font-medium">{label}</p>
              <Icon size={16} style={{ color }} />
            </div>
            <p className="text-2xl font-bold" style={{ color }}>{value}</p>
            <p className="text-xs text-gray-400 mt-0.5">{sub}</p>
          </div>
        ))}
      </div>

      {/* New Invoice Modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl my-8 p-6 border border-gray-100">
            {/* Modal Title */}
            <div className="flex items-center justify-between pb-4 border-b border-gray-100 mb-5">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-lg bg-blue-50 text-[#0062a1]">
                  <Receipt size={20} />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-[#002444]">New Patient Invoice</h2>
                  <p className="text-xs text-gray-500">Auto-fill from clinical encounters or custom fee schedule</p>
                </div>
              </div>
              <button
                onClick={() => setShowCreate(false)}
                className="text-gray-400 hover:text-gray-600 p-1.5 rounded-lg hover:bg-gray-100 transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            <div className="space-y-5">
              {/* 1. Patient Selection */}
              <div>
                <label className="text-xs font-semibold text-gray-700 mb-1.5 flex items-center gap-1.5">
                  <span>Patient</span>
                  <span className="text-red-500">*</span>
                </label>
                {patients.length > 0 ? (
                  <div className="space-y-1.5">
                    <select
                      value={patientId}
                      onChange={(e) => setPatientId(e.target.value)}
                      className="w-full h-10 px-3 text-sm bg-white border border-gray-200 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-[#0062a1]/20 focus:border-[#0062a1]"
                    >
                      <option value="">-- Select Patient ({patients.length} available) --</option>
                      {patients.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} ({p.patient_code})
                        </option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <Input
                    placeholder="Enter Patient UUID..."
                    value={patientId}
                    onChange={(e) => setPatientId(e.target.value)}
                  />
                )}
              </div>

              {/* 2. 1-Click Encounter Presets */}
              <div className="bg-blue-50/50 rounded-xl p-3.5 border border-blue-100">
                <div className="flex items-center gap-1.5 mb-2.5">
                  <Sparkles size={14} className="text-[#0062a1]" />
                  <p className="text-xs font-bold uppercase tracking-wider text-[#0062a1]">
                    1-Click Clinical Encounter Presets
                  </p>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {ENCOUNTER_PRESETS.map((preset) => (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => applyPreset(preset)}
                      className="text-left p-2.5 rounded-lg border border-blue-200/80 bg-white hover:bg-blue-50 hover:border-blue-300 transition-all shadow-2xs group"
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-base">{preset.icon}</span>
                        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-blue-100 text-blue-800">
                          {preset.badge}
                        </span>
                      </div>
                      <p className="text-xs font-semibold text-gray-900 group-hover:text-[#0062a1] truncate">
                        {preset.name}
                      </p>
                      <p className="text-[10px] text-gray-500 line-clamp-1 mt-0.5">
                        {preset.lineItems.length} items
                      </p>
                    </button>
                  ))}
                </div>
              </div>

              {/* 3. Line Items Editor */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-semibold text-gray-700">Line Items &amp; Medical Services</label>
                  <div className="flex items-center gap-2">
                    {/* Fee Schedule Quick-Add Dropdown */}
                    <select
                      onChange={(e) => {
                        const found = FEE_SCHEDULE.find((f) => f.id === e.target.value);
                        if (found) {
                          addFeeItem(found);
                          e.target.value = "";
                        }
                      }}
                      defaultValue=""
                      className="text-xs font-medium text-[#0062a1] bg-blue-50 border border-blue-200 rounded-md px-2 py-1 hover:bg-blue-100 transition-colors focus:outline-hidden"
                    >
                      <option value="" disabled>+ Add From Fee Schedule Catalog...</option>
                      {FEE_SCHEDULE.map((f) => (
                        <option key={f.id} value={f.id}>
                          [{CATEGORY_LABELS[f.category].label}] {f.description} (${f.defaultUnitPrice.toFixed(2)})
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                  {lineItems.map((item, idx) => (
                    <div key={idx} className="grid grid-cols-[1fr_72px_88px_28px] gap-2 items-center">
                      <Input
                        placeholder="Service / Medication / Procedure"
                        value={item.description}
                        onChange={(e) => updateItem(idx, "description", e.target.value)}
                        className="text-xs h-9"
                      />
                      <Input
                        type="number"
                        placeholder="Qty"
                        min={1}
                        value={item.quantity}
                        onChange={(e) => updateItem(idx, "quantity", Number(e.target.value))}
                        className="text-xs h-9"
                      />
                      <Input
                        type="number"
                        placeholder="Unit $"
                        min={0}
                        step={0.01}
                        value={item.unit_price}
                        onChange={(e) => updateItem(idx, "unit_price", Number(e.target.value))}
                        className="text-xs h-9"
                      />
                      <button
                        type="button"
                        className="text-gray-300 hover:text-red-500 p-1 rounded transition-colors flex items-center justify-center"
                        onClick={() => setLineItems((p) => p.filter((_, i) => i !== idx))}
                        title="Remove line item"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  ))}
                </div>

                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="text-xs mt-2 w-full border-dashed border-gray-300 text-gray-600 hover:border-gray-400"
                  onClick={() => setLineItems((p) => [...p, { ...EMPTY_ITEM }])}
                >
                  <Plus size={12} className="mr-1" /> Add Custom Line Item
                </Button>
              </div>

              {/* 4. Subtotal, Tax Rate & Total Calculation */}
              <div className="bg-gray-50/80 rounded-xl p-3.5 border border-gray-200/80 space-y-2 text-xs">
                <div className="flex items-center justify-between text-gray-600">
                  <span>Subtotal</span>
                  <span className="font-semibold text-gray-900">${subtotal.toFixed(2)}</span>
                </div>
                <div className="flex items-center justify-between text-gray-600">
                  <div className="flex items-center gap-1.5">
                    <span>Tax / Service Rate</span>
                    <select
                      value={taxRate}
                      onChange={(e) => setTaxRate(Number(e.target.value))}
                      className="text-xs px-2 py-0.5 rounded border border-gray-300 bg-white font-medium"
                    >
                      <option value={0}>0% (Tax Exempt)</option>
                      <option value={6}>6% (SST Healthcare)</option>
                      <option value={8}>8% (Standard Service)</option>
                    </select>
                  </div>
                  <span className="font-semibold text-gray-900">${tax.toFixed(2)}</span>
                </div>
                <div className="pt-2 border-t border-gray-200 flex items-center justify-between text-sm font-bold">
                  <span className="text-[#002444]">Total Payable</span>
                  <span className="text-lg text-[#0062a1]">${total.toFixed(2)}</span>
                </div>
              </div>

              {/* 5. Due Date & Notes */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-gray-700 mb-1 block">Due Date</label>
                  <Input
                    type="date"
                    value={dueDate}
                    onChange={(e) => setDueDate(e.target.value)}
                    className="text-xs h-9"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-700 mb-1 block">Clinical / Billing Notes</label>
                  <Input
                    placeholder="e.g. Standard consultation completed"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    className="text-xs h-9"
                  />
                </div>
              </div>

              {createError && (
                <div className="p-2.5 rounded-lg bg-red-50 border border-red-200 text-xs text-red-600">
                  {createError}
                </div>
              )}

              {/* Modal Actions */}
              <div className="flex gap-3 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  className="flex-1"
                  onClick={() => setShowCreate(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  className="flex-1 font-semibold"
                  style={{ backgroundColor: "#0062a1" }}
                  onClick={handleCreate}
                  disabled={isPending}
                >
                  {isPending && <Loader2 size={14} className="animate-spin mr-2" />}
                  Create &amp; Issue Invoice (${total.toFixed(2)})
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tabs Table */}
      <div className="bg-white rounded-xl shadow-xs border border-gray-100 p-5">
        <Tabs defaultValue="all">
          <TabsList className="mb-4 bg-gray-100/80 p-1">
            {[
              ["all", "All Invoices"],
              ["sent", "Unpaid / Sent"],
              ["overdue", "Overdue"],
              ["paid", "Paid"],
              ["draft", "Drafts"],
            ].map(([v, l]) => (
              <TabsTrigger key={v} value={v} className="px-4 py-1.5 text-xs font-medium">
                {l}
              </TabsTrigger>
            ))}
          </TabsList>
          {["all", "sent", "overdue", "paid", "draft"].map((tab) => (
            <TabsContent key={tab} value={tab}>
              <InvoiceTable
                invoices={filterByStatus(tab as InvoiceStatus | "all")}
                onStatusChange={handleStatusChange}
              />
            </TabsContent>
          ))}
        </Tabs>
      </div>
    </div>
  );
}
