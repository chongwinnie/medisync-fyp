import { alertBus, type ClinicalAlertEvent } from "../lib/alerts/alert-bus";

async function runTests() {
  console.log("=== Testing MediSync Real-Time Clinical Alert Bus ===");

  const receivedByDoctor: ClinicalAlertEvent[] = [];
  const receivedByNurse: ClinicalAlertEvent[] = [];
  const receivedByAdmin: ClinicalAlertEvent[] = [];

  // 1. Subscribe Doctor listener
  const unsubDoctor = alertBus.subscribe("sub-doc-1", "doctor", (alert) => {
    receivedByDoctor.push(alert);
  });

  // 2. Subscribe Nurse listener
  const unsubNurse = alertBus.subscribe("sub-nurse-1", "nurse", (alert) => {
    receivedByNurse.push(alert);
  });

  // 3. Subscribe Admin listener
  const unsubAdmin = alertBus.subscribe("sub-admin-1", "admin", (alert) => {
    receivedByAdmin.push(alert);
  });

  console.log(`Active Subscribers registered: ${alertBus.getSubscriberCount()}`);
  if (alertBus.getSubscriberCount() !== 3) {
    throw new Error(`Expected 3 subscribers, got ${alertBus.getSubscriberCount()}`);
  }

  // 4. Test Event 1: Critical Abnormal Vitals (Target: Doctor & Nurse)
  const vitalsAlert = alertBus.broadcast({
    category: "clinical_vitals",
    severity: "critical",
    title: "🚨 Critical Vitals Alert: SpO2 Drop",
    message: "Patient PT-1042 (Sarah Jenkins) SpO2 dropped to 86% (Critical Hypoxia). Immediate clinical assessment required.",
    patientId: "pat-1042",
    patientCode: "PT-1042",
    patientName: "Sarah Jenkins",
    targetRoles: ["doctor", "nurse"],
  });

  // 5. Test Event 2: Low Stock Warning (Target: Admin & Nurse)
  const stockAlert = alertBus.broadcast({
    category: "stock_low",
    severity: "warning",
    title: "📦 Low Medical Supply: Propofol 10mg/mL",
    message: "ICU inventory below minimum safety threshold (4/20 units remaining). Automatic reorder required.",
    targetRoles: ["admin", "nurse"],
  });

  // 6. Test Event 3: Emergency Bed Request (Target: Nurse & Admin)
  const bedAlert = alertBus.broadcast({
    category: "emergency_bed",
    severity: "critical",
    title: "🛏️ Emergency ICU Bed Request",
    message: "Emergency Department requesting urgent bed transfer for acute trauma patient.",
    targetRoles: ["nurse", "admin"],
  });

  // 7. Verify Role-Based Dispatch
  console.log(`Doctor received: ${receivedByDoctor.length} alerts (Expected: 1)`);
  console.log(`Nurse received: ${receivedByNurse.length} alerts (Expected: 3)`);
  console.log(`Admin received: ${receivedByAdmin.length} alerts (Expected: 3)`);

  if (receivedByDoctor.length !== 1 || receivedByDoctor[0].id !== vitalsAlert.id) {
    throw new Error("Doctor role filtering failed — expected only vitals alert");
  }

  if (receivedByNurse.length !== 3) {
    throw new Error("Nurse role filtering failed — expected 3 alerts");
  }

  if (receivedByAdmin.length !== 3) {
    throw new Error("Admin role filtering failed — expected all 3 alerts");
  }

  // 8. Test Recent History Buffer
  const recentDoctor = alertBus.getRecentAlerts("doctor");
  const recentAdmin = alertBus.getRecentAlerts("admin");
  console.log(`Recent history for Doctor: ${recentDoctor.length} items`);
  console.log(`Recent history for Admin: ${recentAdmin.length} items`);

  if (recentDoctor.length !== 1 || recentAdmin.length !== 3) {
    throw new Error("Recent alerts history query failed");
  }

  // Cleanup subscribers
  unsubDoctor();
  unsubNurse();
  unsubAdmin();

  console.log(`Subscribers after unsubscribe: ${alertBus.getSubscriberCount()} (Expected: 0)`);
  if (alertBus.getSubscriberCount() !== 0) {
    throw new Error("Subscriber unsubscribe cleanup failed");
  }

  console.log("\n✅ Real-Time Clinical Alert Bus contracts verified successfully!");
}

runTests().catch((err) => {
  console.error("Alert Bus test failed:", err);
  process.exit(1);
});
