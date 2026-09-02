/**
 * fee-schedule.ts — Standard Hospital Fee Schedule & Clinical Encounter Presets
 * ==============================================================================
 *
 * Provides a standardized catalog of billable medical services, diagnostic codes,
 * and 1-click clinical encounter auto-billing templates for MediSync.
 */

import type { LineItem } from "./billing";

export type ServiceCategory =
  | "consultation"
  | "diagnostic"
  | "inpatient"
  | "procedure"
  | "pharmacy";

export interface FeeScheduleItem {
  id: string;
  code: string;
  category: ServiceCategory;
  description: string;
  defaultUnitPrice: number;
  unit: string;
  department: string;
}

export interface EncounterPreset {
  id: string;
  name: string;
  icon: string;
  badge: string;
  description: string;
  suggestedNotes: string;
  lineItems: LineItem[];
}

export const CATEGORY_LABELS: Record<ServiceCategory, { label: string; color: string; bg: string }> = {
  consultation: { label: "Consultation", color: "#0062a1", bg: "#eff6ff" },
  diagnostic:   { label: "Diagnostics & Labs", color: "#7c3aed", bg: "#f5f3ff" },
  inpatient:    { label: "Ward & Inpatient", color: "#059669", bg: "#ecfdf5" },
  procedure:    { label: "Procedures & Care", color: "#d97706", bg: "#fffbeb" },
  pharmacy:     { label: "Pharmacy", color: "#db2777", bg: "#fdf2f8" },
};

/**
 * Standardized Medical Fee Catalog
 */
export const FEE_SCHEDULE: FeeScheduleItem[] = [
  // --- Consultations ---
  {
    id: "CONS-001",
    code: "CPT-99213",
    category: "consultation",
    description: "General Outpatient Consultation",
    defaultUnitPrice: 50.0,
    unit: "per visit",
    department: "General Medicine",
  },
  {
    id: "CONS-002",
    code: "CPT-99214",
    category: "consultation",
    description: "Specialist Physician Consultation",
    defaultUnitPrice: 120.0,
    unit: "per visit",
    department: "Specialist Clinics",
  },
  {
    id: "CONS-003",
    code: "CPT-99283",
    category: "consultation",
    description: "Emergency Department Triage & Review",
    defaultUnitPrice: 150.0,
    unit: "per visit",
    department: "Emergency",
  },
  {
    id: "CONS-004",
    code: "CPT-99212",
    category: "consultation",
    description: "Routine Clinical Follow-up Review",
    defaultUnitPrice: 35.0,
    unit: "per visit",
    department: "Outpatient",
  },

  // --- Diagnostics & Labs ---
  {
    id: "DIAG-001",
    code: "CPT-71046",
    category: "diagnostic",
    description: "Chest X-Ray (2 Views, PA & Lateral)",
    defaultUnitPrice: 75.0,
    unit: "per scan",
    department: "Radiology",
  },
  {
    id: "DIAG-002",
    code: "CPT-70553",
    category: "diagnostic",
    description: "MRI Brain with Contrast",
    defaultUnitPrice: 450.0,
    unit: "per scan",
    department: "Radiology",
  },
  {
    id: "DIAG-003",
    code: "CPT-93000",
    category: "diagnostic",
    description: "12-Lead Electrocardiogram (ECG)",
    defaultUnitPrice: 60.0,
    unit: "per test",
    department: "Cardiology",
  },
  {
    id: "LAB-001",
    code: "CPT-85025",
    category: "diagnostic",
    description: "Full Blood Count (FBC / CBC)",
    defaultUnitPrice: 45.0,
    unit: "per panel",
    department: "Pathology Laboratory",
  },
  {
    id: "LAB-002",
    code: "CPT-80053",
    category: "diagnostic",
    description: "Comprehensive Metabolic & Renal Profile",
    defaultUnitPrice: 70.0,
    unit: "per panel",
    department: "Pathology Laboratory",
  },

  // --- Ward & Inpatient ---
  {
    id: "WARD-001",
    code: "REV-0120",
    category: "inpatient",
    description: "General Ward Room & Board (Standard Bed)",
    defaultUnitPrice: 150.0,
    unit: "per day",
    department: "Inpatient Wards",
  },
  {
    id: "WARD-002",
    code: "REV-0200",
    category: "inpatient",
    description: "Intensive Care Unit (ICU) Critical Bed",
    defaultUnitPrice: 500.0,
    unit: "per day",
    department: "Critical Care",
  },
  {
    id: "WARD-003",
    code: "REV-0761",
    category: "inpatient",
    description: "Day-Care Admission & Recovery Bed",
    defaultUnitPrice: 80.0,
    unit: "per stay",
    department: "Day Surgery",
  },

  // --- Procedures & Nursing ---
  {
    id: "PROC-001",
    code: "CPT-12001",
    category: "procedure",
    description: "Surgical Wound Dressing & Suture Care",
    defaultUnitPrice: 35.0,
    unit: "per session",
    department: "Nursing",
  },
  {
    id: "PROC-002",
    code: "CPT-36000",
    category: "procedure",
    description: "IV Cannulation & Infusion Line Setup",
    defaultUnitPrice: 40.0,
    unit: "per setup",
    department: "Nursing",
  },
  {
    id: "PROC-003",
    code: "CPT-94640",
    category: "procedure",
    description: "Nebulizer Aerosol Respiratory Treatment",
    defaultUnitPrice: 30.0,
    unit: "per treatment",
    department: "Respiratory Care",
  },

  // --- Pharmacy ---
  {
    id: "PHARM-001",
    code: "NDC-GEN-01",
    category: "pharmacy",
    description: "Standard Outpatient Pharmacy Prescription Pack",
    defaultUnitPrice: 65.0,
    unit: "per pack",
    department: "Pharmacy",
  },
  {
    id: "PHARM-002",
    code: "NDC-ANT-02",
    category: "pharmacy",
    description: "Targeted Antibiotic Therapy Course",
    defaultUnitPrice: 85.0,
    unit: "per course",
    department: "Pharmacy",
  },
];

/**
 * 1-Click Clinical Encounter Presets
 */
export const ENCOUNTER_PRESETS: EncounterPreset[] = [
  {
    id: "PRESET-OUTPATIENT",
    name: "Standard Outpatient Visit",
    icon: "🩺",
    badge: "Outpatient",
    description: "General doctor consultation with standard discharge medication pack.",
    suggestedNotes: "Standard outpatient consultation completed. Prescription dispensed.",
    lineItems: [
      { description: "General Outpatient Consultation", quantity: 1, unit_price: 50.0 },
      { description: "Standard Outpatient Pharmacy Prescription Pack", quantity: 1, unit_price: 65.0 },
    ],
  },
  {
    id: "PRESET-DIAGNOSTIC",
    name: "Specialist Diagnostic Workup",
    icon: "🩻",
    badge: "Investigation",
    description: "Specialist review with Chest X-Ray and Full Blood Count panel.",
    suggestedNotes: "Specialist clinical workup and laboratory diagnostic evaluation.",
    lineItems: [
      { description: "Specialist Physician Consultation", quantity: 1, unit_price: 120.0 },
      { description: "Chest X-Ray (2 Views, PA & Lateral)", quantity: 1, unit_price: 75.0 },
      { description: "Full Blood Count (FBC / CBC)", quantity: 1, unit_price: 45.0 },
    ],
  },
  {
    id: "PRESET-WARD-3DAYS",
    name: "3-Day Inpatient Ward Stay",
    icon: "🏥",
    badge: "Inpatient",
    description: "3 days ward stay with daily physician rounds and nursing care.",
    suggestedNotes: "Inpatient admission (3 days). Clinical discharge summary prepared.",
    lineItems: [
      { description: "General Ward Room & Board (Standard Bed)", quantity: 3, unit_price: 150.0 },
      { description: "Routine Clinical Follow-up Review", quantity: 3, unit_price: 35.0 },
      { description: "Surgical Wound Dressing & Suture Care", quantity: 3, unit_price: 35.0 },
    ],
  },
  {
    id: "PRESET-EMERGENCY",
    name: "Emergency Triage & ECG",
    icon: "🚨",
    badge: "Emergency",
    description: "Emergency room triage, 12-lead ECG recording, and IV cannulation.",
    suggestedNotes: "Emergency admission and acute cardiac/vital stabilization.",
    lineItems: [
      { description: "Emergency Department Triage & Review", quantity: 1, unit_price: 150.0 },
      { description: "12-Lead Electrocardiogram (ECG)", quantity: 1, unit_price: 60.0 },
      { description: "IV Cannulation & Infusion Line Setup", quantity: 1, unit_price: 40.0 },
    ],
  },
];

/**
 * Calculate Subtotal, Tax Amount, and Final Total
 */
export function calculateInvoiceTotals(
  items: LineItem[],
  taxRatePercent: number = 0.0
): { subtotal: number; tax: number; total: number } {
  const subtotal = items.reduce((sum, item) => {
    const qty = Number(item.quantity) || 0;
    const price = Number(item.unit_price) || 0;
    return sum + qty * price;
  }, 0);

  const rate = Math.max(0, taxRatePercent) / 100;
  const tax = Number((subtotal * rate).toFixed(2));
  const total = Number((subtotal + tax).toFixed(2));

  return {
    subtotal: Number(subtotal.toFixed(2)),
    tax,
    total,
  };
}
