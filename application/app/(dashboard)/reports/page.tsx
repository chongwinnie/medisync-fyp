import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getHospitalReport } from "@/lib/data/reports";
import {
  Users, CalendarCheck, Package, UserCog, DollarSign,
  TrendingUp, AlertTriangle, CheckCircle2, Clock, FileDown, Printer,
} from "lucide-react";

export const metadata = { title: "Hospital Reports — MediSync" };

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl shadow-sm p-5">
      <h2 className="text-base font-semibold text-[#002444] mb-4 border-b border-gray-100 pb-3">{title}</h2>
      {children}
    </div>
  );
}

function StatRow({ label, value, sub, color = "#002444" }: { label: string; value: string | number; sub?: string; color?: string }) {
  return (
    <div className="flex items-center justify-between py-2.5 border-b border-gray-50 last:border-0">
      <span className="text-sm text-gray-600">{label}</span>
      <div className="text-right">
        <span className="text-sm font-semibold" style={{ color }}>{value}</span>
        {sub && <p className="text-xs text-gray-400">{sub}</p>}
      </div>
    </div>
  );
}

function KpiCard({ label, value, icon: Icon, color, sub }: { label: string; value: string; icon: React.ElementType; color: string; sub?: string }) {
  return (
    <div className="bg-white rounded-xl shadow-sm p-5 border-l-4" style={{ borderLeftColor: color }}>
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs text-gray-500 uppercase tracking-wide">{label}</p>
        <Icon size={18} style={{ color }} />
      </div>
      <p className="text-2xl font-bold" style={{ color }}>{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
    </div>
  );
}

export default async function ReportsPage() {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") redirect("/dashboard");

  const r = await getHospitalReport();
  const fmt = (n: number) => n.toLocaleString();
  const money = (n: number) => `$${n.toFixed(2)}`;
  const generatedAt = new Date(r.generated_at).toLocaleString("en-GB", { dateStyle: "full", timeStyle: "short" });

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#002444]">Hospital Management Report</h1>
          <p className="text-sm text-gray-500 mt-0.5">Generated: {generatedAt}</p>
        </div>
        <div className="flex items-center gap-2 print:hidden">
          <a
            href="/api/pdf/report"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 shadow-xs transition-colors"
            title="Preview PDF"
          >
            <Printer size={15} />
            Preview
          </a>
          <a
            href="/api/pdf/report?download=1"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#0062a1] text-white text-sm font-medium hover:bg-[#004f82] shadow-xs transition-colors"
            title="Download Official Audit PDF"
          >
            <FileDown size={15} />
            Export Official PDF
          </a>
        </div>
      </div>

      {/* Top KPI row */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiCard label="Total Patients"    value={fmt(r.patients.total)}            icon={Users}        color="#0062a1" sub={`${r.patients.admitted} admitted`} />
        <KpiCard label="Appts This Month"  value={fmt(r.appointments.total_this_month)} icon={CalendarCheck} color="#7c3aed" sub={`${r.appointments.completion_rate} completion`} />
        <KpiCard label="Revenue (month)"   value={money(r.billing.revenue_collected)} icon={TrendingUp}   color="#16a34a" sub={`${r.billing.invoices_this_month} invoices`} />
        <KpiCard label="Outstanding"       value={money(r.billing.outstanding)}      icon={DollarSign}   color={r.billing.overdue_count > 0 ? "#dc2626" : "#0062a1"} sub={r.billing.overdue_count > 0 ? `${r.billing.overdue_count} overdue` : "all current"} />
      </div>

      {/* Detail sections */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Section title="Patient Summary">
          <StatRow label="Total patients"      value={fmt(r.patients.total)} />
          <StatRow label="Admitted"            value={fmt(r.patients.admitted)}    color="#dc2626" />
          <StatRow label="Outpatient"          value={fmt(r.patients.outpatient)} />
          <StatRow label="Discharged"          value={fmt(r.patients.discharged)} />
          <StatRow label="New this month"      value={fmt(r.patients.new_this_month)} color="#16a34a" />
        </Section>

        <Section title="Appointment Summary">
          <StatRow label="Total this month"    value={fmt(r.appointments.total_this_month)} />
          <StatRow label="Completed"           value={fmt(r.appointments.completed)}   color="#16a34a" />
          <StatRow label="Cancelled"           value={fmt(r.appointments.cancelled)}   color="#9ca3af" />
          <StatRow label="No-shows"            value={fmt(r.appointments.no_shows)}    color="#f59e0b" />
          <StatRow label="Today (scheduled)"   value={fmt(r.appointments.today_scheduled)} />
          <StatRow label="Completion rate"     value={r.appointments.completion_rate}  color="#0062a1" />
        </Section>

        <Section title="Inventory Health">
          <StatRow label="Active items"        value={fmt(r.inventory.total_items)} />
          <StatRow label="Low stock"           value={fmt(r.inventory.low_stock)}     color={r.inventory.low_stock > 0 ? "#f59e0b" : "#16a34a"} />
          <StatRow label="Expiring (30 days)"  value={fmt(r.inventory.expiring_soon)} color={r.inventory.expiring_soon > 0 ? "#dc2626" : "#16a34a"} />
        </Section>

        <Section title="Staff & Operations">
          <StatRow label="Total staff"         value={fmt(r.staff.total)} />
          <StatRow label="Doctors"             value={fmt(r.staff.doctors)} />
          <StatRow label="Nurses"              value={fmt(r.staff.nurses)} />
          <StatRow label="On shift today"      value={fmt(r.staff.on_shift_today)}    color="#0062a1" />
          <StatRow label="Shift conflicts"     value={fmt(r.staff.shift_conflicts)}   color={r.staff.shift_conflicts > 0 ? "#dc2626" : "#16a34a"} />
        </Section>

        <Section title="Financial Overview">
          <StatRow label="Invoices (month)"    value={fmt(r.billing.invoices_this_month)} />
          <StatRow label="Revenue collected"   value={money(r.billing.revenue_collected)} color="#16a34a" />
          <StatRow label="Outstanding"         value={money(r.billing.outstanding)}       color="#f59e0b" />
          <StatRow label="Overdue invoices"    value={fmt(r.billing.overdue_count)}       color={r.billing.overdue_count > 0 ? "#dc2626" : "#16a34a"} />
        </Section>
      </div>

      {/* Print button client script */}
      <script dangerouslySetInnerHTML={{ __html: `document.getElementById('print-report-btn')?.addEventListener('click', () => window.print())` }} />
    </div>
  );
}
