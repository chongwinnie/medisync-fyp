"use client";

import { useState } from "react";
import { PlusIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  ReportTable,
  type DiagnosticReport,
} from "@/components/diagnostics/report-table";
import { DiagnosticAIPanel } from "@/components/diagnostics/diagnostic-ai-panel";
import { NewReportModal } from "@/components/diagnostics/new-report-modal";
import { useRequireRole } from "@/hooks/use-require-role";

const TAB_FILTERS: Record<string, (report: DiagnosticReport) => boolean> = {
  all: () => true,
  pending: (report) => report.status === "pending_review",
  finalized: (report) => report.status === "finalized",
  imaging: (report) =>
    report.report_type === "imaging" || report.report_type === "radiology",
};

interface DiagnosticsPageClientProps {
  reports: DiagnosticReport[];
  patients: Array<{ id: string; name: string; patient_code: string }>;
}

export function DiagnosticsPageClient({
  reports,
  patients,
}: DiagnosticsPageClientProps) {
  const { isLoading, isAllowed } = useRequireRole(["doctor", "nurse", "admin"]);
  const [activeTab, setActiveTab] = useState("all");
  const [isModalOpen, setIsModalOpen] = useState(false);

  const visibleReports = reports.filter(
    TAB_FILTERS[activeTab] ?? (() => true)
  );

  if (isLoading || !isAllowed) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
        Loading...
      </div>
    );
  }

  return (
    <>
      <div className="flex gap-6 items-start">
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-3">
              <div
                className="w-1 h-7 rounded-full"
                style={{ backgroundColor: "#0062a1" }}
              />
              <h1 className="text-2xl font-bold text-gray-900">
                Medical Diagnostics
              </h1>
            </div>
            <Button
              onClick={() => setIsModalOpen(true)}
              style={{ backgroundColor: "#0062a1", color: "#fff" }}
            >
              <PlusIcon className="size-4" />
              New Report
            </Button>
          </div>

          <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="border-b border-gray-100 px-4 pt-4">
              <Tabs value={activeTab} onValueChange={setActiveTab}>
                <TabsList
                  variant="line"
                  className="border-none bg-transparent gap-0 h-auto p-0"
                >
                  <TabsTrigger value="all" className="px-4 pb-3">
                    All Reports
                  </TabsTrigger>
                  <TabsTrigger value="pending" className="px-4 pb-3">
                    Pending Review
                  </TabsTrigger>
                  <TabsTrigger value="finalized" className="px-4 pb-3">
                    Finalized
                  </TabsTrigger>
                  <TabsTrigger value="imaging" className="px-4 pb-3">
                    Imaging
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="all">
                  <ReportTable reports={visibleReports} />
                </TabsContent>
                <TabsContent value="pending">
                  <ReportTable reports={visibleReports} />
                </TabsContent>
                <TabsContent value="finalized">
                  <ReportTable reports={visibleReports} />
                </TabsContent>
                <TabsContent value="imaging">
                  <ReportTable reports={visibleReports} />
                </TabsContent>
              </Tabs>
            </div>
          </div>
        </div>

        <DiagnosticAIPanel patients={patients} />
      </div>

      <NewReportModal
        open={isModalOpen}
        onOpenChange={setIsModalOpen}
        patients={patients}
      />
    </>
  );
}
