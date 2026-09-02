import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getInvoices, getBillingSummary } from "@/lib/data/billing";
import { listPatientOptions } from "@/lib/data/patients";
import { BillingPageClient } from "./billing-page-client";

export const metadata = { title: "Billing & Invoices — MediSync" };

export default async function BillingPage() {
  const user = await getCurrentUser();
  if (!user || !["admin", "nurse"].includes(user.role)) redirect("/dashboard");

  const [invoices, summary, patients] = await Promise.all([
    getInvoices(),
    getBillingSummary(),
    listPatientOptions(),
  ]);

  return <BillingPageClient invoices={invoices} summary={summary} patients={patients} />;
}
