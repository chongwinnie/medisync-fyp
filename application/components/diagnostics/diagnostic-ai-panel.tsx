"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  SparklesIcon,
  UploadCloudIcon,
  X,
  FileImage,
  AlertTriangle,
  CheckCircle2,
  ListChecks,
  Stethoscope,
  Activity,
  Layers,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  analyzeDiagnosticImageAction,
  createDiagnosticReportAction,
  type AnalyzeResult,
  type FindingItem,
  type DifferentialItem,
} from "@/lib/actions/diagnostics";

interface DiagnosticAIPanelProps {
  patients?: Array<{ id: string; name: string; patient_code: string }>;
}

const MODALITY_OPTIONS = [
  { value: "obstetric_ultrasound", label: "👶 Obstetric / Fetal Ultrasound (Pregnancy / Baby)" },
  { value: "ultrasound", label: "🩺 Abdominal & Organ Ultrasound" },
  { value: "cardiac_echo", label: "❤️ Echocardiogram (Cardiac Ultrasound)" },
  { value: "xray", label: "🫁 Chest Radiograph (X-Ray)" },
  { value: "mri", label: "🧠 Brain / Spine MRI" },
  { value: "ct", label: "🩻 Computed Tomography (CT Scan)" },
  { value: "dermatology", label: "🔬 Dermatology / Skin Lesion" },
  { value: "general", label: "🔍 General Medical Imaging" },
];

function inferModalityFromFilename(filename: string): string {
  const f = filename.toLowerCase();
  if (f.includes("baby") || f.includes("fetal") || f.includes("fetus") || f.includes("preg") || f.includes("ob") || f.includes("gyn")) return "obstetric_ultrasound";
  if (f.includes("echo") || f.includes("cardiac") || f.includes("heart")) return "cardiac_echo";
  if (f.includes("xray") || f.includes("chest") || f.includes("cxr") || f.includes("lung")) return "xray";
  if (f.includes("mri") || f.includes("brain") || f.includes("spine") || f.includes("neuro")) return "mri";
  if (f.includes("ct") || f.includes("scan") || f.includes("abdomen")) return "ct";
  if (f.includes("us") || f.includes("ultrasound")) return "obstetric_ultrasound";
  if (f.includes("derm") || f.includes("skin") || f.includes("mole") || f.includes("rash")) return "dermatology";
  return "obstetric_ultrasound";
}

function getSeverityColor(sev: string) {
  const s = (sev || "").toLowerCase();
  if (s === "critical" || s === "severe") return "bg-red-50 text-red-700 border-red-200";
  if (s === "moderate") return "bg-amber-50 text-amber-700 border-amber-200";
  if (s === "mild") return "bg-blue-50 text-blue-700 border-blue-200";
  return "bg-emerald-50 text-emerald-700 border-emerald-200";
}

async function fileToJpegBase64(file: File): Promise<string> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const result = e.target?.result as string;
      if (!result) {
        resolve("");
        return;
      }
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        try {
          const canvas = document.createElement("canvas");
          let w = img.naturalWidth || img.width || 800;
          let h = img.naturalHeight || img.height || 600;
          const maxDim = 1000;
          if (w > maxDim || h > maxDim) {
            if (w > h) {
              h = Math.round((h * maxDim) / w);
              w = maxDim;
            } else {
              w = Math.round((w * maxDim) / h);
              h = maxDim;
            }
          }
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext("2d");
          if (ctx) {
            ctx.fillStyle = "#ffffff";
            ctx.fillRect(0, 0, w, h);
            ctx.drawImage(img, 0, 0, w, h);
            resolve(canvas.toDataURL("image/jpeg", 0.88));
            return;
          }
        } catch (err) {
          console.error("Canvas conversion error:", err);
        }
        resolve(result);
      };
      img.onerror = () => resolve(result);
      img.src = result;
    };
    reader.onerror = () => resolve("");
    reader.readAsDataURL(file);
  });
}

export function DiagnosticAIPanel({ patients = [] }: DiagnosticAIPanelProps) {
  const router = useRouter();
  const [clinicalContext, setClinicalContext] = useState("");
  const [modality, setModality] = useState("xray");
  const [isDragging, setIsDragging] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);

  const [analysisResult, setAnalysisResult] = useState<AnalyzeResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [patientId, setPatientId] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [generatingPdf, setGeneratingPdf] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  async function handleExportPdf() {
    if (!selectedFile && !analysisResult) {
      setError("Please upload a medical scan image or select a patient report.");
      return;
    }

    // Open popup window synchronously to prevent browser popup blocker
    const pdfTab = typeof window !== "undefined" ? window.open("", "_blank") : null;
    if (pdfTab) {
      pdfTab.document.write(`
        <!DOCTYPE html>
        <html>
          <head><title>Generating Diagnostic PDF Report...</title></head>
          <body style="font-family:-apple-system,BlinkMacSystemFont,sans-serif;display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;margin:0;background:#f8fafc;color:#0f172a;">
            <div style="text-align:center;max-width:400px;padding:32px;background:white;border-radius:12px;box-shadow:0 4px 12px rgba(0,0,0,0.08);">
              <div style="font-size:24px;margin-bottom:12px;">🏥 MediSync Health</div>
              <div style="font-size:16px;font-weight:600;margin-bottom:8px;color:#002444;">Generating PDF Report...</div>
              <div style="font-size:13px;color:#64748b;line-height:1.5;">Attaching medical scan image and building PDF report. Please wait...</div>
            </div>
          </body>
        </html>
      `);
    }

    setGeneratingPdf(true);
    setError(null);

    let imageBase64: string | undefined = undefined;
    if (selectedFile) {
      imageBase64 = await fileToJpegBase64(selectedFile);
    }

    const selectedPatient = patients.find((p) => p.id === patientId);

    const findingsLines = (analysisResult?.findings || [])
      .map((f) => `• [${f.severity.toUpperCase()}] ${f.location}: ${f.observation}`)
      .join("\n");

    const diffLines = (analysisResult?.differentials || [])
      .map((d) => `• ${d.label} (${d.confidence} Confidence${d.icd_code ? ` - ICD: ${d.icd_code}` : ""})`)
      .join("\n");

    const recLines = (analysisResult?.recommendations || [])
      .map((r) => `✓ ${r}`)
      .join("\n");

    const fullFindings = analysisResult
      ? [
          `IMPRESSION: ${analysisResult.impression || analysisResult.summary}`,
          findingsLines ? `\nFINDINGS:\n${findingsLines}` : "",
          diffLines ? `\nDIFFERENTIALS:\n${diffLines}` : "",
          recLines ? `\nRECOMMENDATIONS:\n${recLines}` : "",
        ].join("\n")
      : `DIAGNOSTIC EXAMINATION & SCAN REPORT\nAnatomical Target: ${modality.toUpperCase()}\nScan Image Attached: ${selectedFile?.name || "Medical Imaging Scan"}\n\nCLINICAL CONTEXT:\n${clinicalContext || "Standard clinical examination scan attachment."}`;

    try {
      const res = await fetch("/api/pdf/diagnostic/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          patient_name: selectedPatient?.name || "Patient",
          patient_code: selectedPatient?.patient_code || "PT-1044",
          report_type: modality === "xray" ? "Radiology" : "Imaging",
          title: `AI Scan Report — ${selectedFile?.name || "Medical Scan"}`,
          status: "FINALIZED",
          ai_assisted: true,
          report_date: new Date().toISOString().split("T")[0],
          findings: fullFindings,
          ai_summary: analysisResult ? (analysisResult.impression || analysisResult.summary) : "Uploaded diagnostic scan attached.",
          image_base64: imageBase64,
          modality: MODALITY_OPTIONS.find((m) => m.value === modality)?.label.split(" ")[1] || "Imaging",
          clinical_context: clinicalContext || undefined,
        }),
      });

      if (res.ok) {
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        if (pdfTab && !pdfTab.closed) {
          pdfTab.document.open();
          pdfTab.document.write(`
            <!DOCTYPE html>
            <html>
              <head>
                <title>Diagnostic PDF Report — ${selectedFile?.name || "MediSync"}</title>
                <style>html, body { margin: 0; padding: 0; width: 100%; height: 100%; overflow: hidden; background: #525659; }</style>
              </head>
              <body>
                <iframe src="${url}" type="application/pdf" width="100%" height="100%" style="border:none;"></iframe>
              </body>
            </html>
          `);
          pdfTab.document.close();
        } else {
          const a = document.createElement("a");
          a.href = url;
          a.download = `Diagnostic-Report-${Date.now()}.pdf`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
        }
      } else {
        if (pdfTab && !pdfTab.closed) pdfTab.close();
        setError("Failed to generate PDF report.");
      }
    } catch (err: any) {
      if (pdfTab && !pdfTab.closed) pdfTab.close();
      setError("Error generating PDF document: " + err?.message);
    } finally {
      setGeneratingPdf(false);
    }
  }



  function handleFile(file: File) {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setSelectedFile(file);
    setPreviewUrl(URL.createObjectURL(file));
    setModality(inferModalityFromFilename(file.name));
    setAnalysisResult(null);
    setError(null);
    setSaved(false);
  }

  function handleClearFile() {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setSelectedFile(null);
    setPreviewUrl(null);
    setAnalysisResult(null);
    setError(null);
    setSaved(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(true);
  }

  function handleDragLeave() {
    setIsDragging(false);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }

  async function handleAnalyze() {
    if (!selectedFile) return;
    setAnalyzing(true);
    setError(null);

    const formData = new FormData();
    formData.append("image", selectedFile);
    formData.append("clinical_context", clinicalContext);
    formData.append("modality", modality);

    const result = await analyzeDiagnosticImageAction(formData);
    setAnalyzing(false);

    if (!result.success || !result.result) {
      setError(result.error ?? "Analysis failed");
      return;
    }

    setAnalysisResult(result.result);
  }

  async function handleSaveDraft() {
    if (!analysisResult || !patientId) {
      setError("Please select a patient to save the AI draft report");
      return;
    }
    setSaving(true);
    setError(null);

    let imageBase64Attachment = "";
    if (selectedFile) {
      imageBase64Attachment = await fileToJpegBase64(selectedFile);
    }

    const findingsLines = (analysisResult.findings || [])
      .map((f) => `• [${f.severity.toUpperCase()}] ${f.location}: ${f.observation}`)
      .join("\n");

    const diffLines = (analysisResult.differentials || [])
      .map((d) => `• ${d.label} (${d.confidence} Confidence${d.icd_code ? ` - ICD: ${d.icd_code}` : ""}) - ${d.description || ""}`)
      .join("\n");

    const recLines = (analysisResult.recommendations || [])
      .map((r) => `✓ ${r}`)
      .join("\n");

    let notes = [
      `=== AI DIAGNOSTIC IMPRESSION ===`,
      analysisResult.impression || analysisResult.summary,
      "",
      findingsLines ? `=== SYSTEMATIC FINDINGS ===\n${findingsLines}\n` : "",
      diffLines ? `=== DIFFERENTIAL DIAGNOSES ===\n${diffLines}\n` : "",
      recLines ? `=== CLINICAL RECOMMENDATIONS ===\n${recLines}\n` : "",
      clinicalContext ? `=== CLINICIAN NOTES ===\n${clinicalContext}\n` : "",
      `[AI-assisted analysis — requires clinician review and finalization]`,
    ]
      .filter(Boolean)
      .join("\n");

    if (imageBase64Attachment) {
      notes += `\n\n[IMAGE_ATTACHMENT: ${imageBase64Attachment}]`;
    }

    const modalityLabel = MODALITY_OPTIONS.find((m) => m.value === modality)?.label.split(" ")[1] || "Imaging";

    const result = await createDiagnosticReportAction({
      patientId,
      reportType: modality === "xray" ? "radiology" : "imaging",
      title: `AI ${modalityLabel} Draft — ${selectedFile?.name ?? "Scan"}`,
      notes,
      aiAssisted: true,
    });

    setSaving(false);
    if (!result.success) {
      setError(result.error ?? "Failed to save draft report");
      return;
    }
    setSaved(true);
    router.refresh();
  }


  return (
    <div className="w-[420px] flex-shrink-0 rounded-xl overflow-hidden border border-gray-200 bg-white shadow-sm self-start sticky top-6">
      {/* Header */}
      <div
        className="px-5 py-3.5 flex items-center justify-between"
        style={{ backgroundColor: "#002444" }}
      >
        <div className="flex items-center gap-2.5">
          <SparklesIcon className="size-4 text-white/90" />
          <h2 className="text-sm font-semibold text-white tracking-wide">
            Diagnostic AI Assistant
          </h2>
        </div>
        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-white/10 text-blue-200 uppercase tracking-wider">
          Multimodal
        </span>
      </div>

      <div className="p-5 flex flex-col gap-4 max-h-[85vh] overflow-y-auto">
        {/* Upload Dropzone & Live Image Preview */}
        {!selectedFile ? (
          <div
            role="button"
            tabIndex={0}
            aria-label="Upload medical image"
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            onKeyDown={(e) => e.key === "Enter" && fileInputRef.current?.click()}
            className={`flex flex-col items-center justify-center gap-2.5 rounded-xl border-2 border-dashed py-7 px-4 cursor-pointer transition-all select-none ${
              isDragging
                ? "border-[#0062a1] bg-blue-50/50 scale-[0.99]"
                : "border-gray-200 hover:border-gray-300 hover:bg-gray-50/60"
            }`}
          >
            <div className="size-10 rounded-full bg-blue-50 flex items-center justify-center text-[#0062a1]">
              <UploadCloudIcon className="size-5" />
            </div>
            <div className="text-center">
              <p className="text-xs text-gray-700 font-medium">
                Drop medical scan here or{" "}
                <span className="text-[#0062a1] font-semibold underline underline-offset-2">
                  browse files
                </span>
              </p>
              <p className="text-[11px] text-gray-400 mt-1">
                DICOM, JPEG, PNG, X-Ray, MRI, CT (Up to 50MB)
              </p>
            </div>
          </div>
        ) : (
          <div className="rounded-xl border border-gray-200 bg-gray-50/60 p-3 flex flex-col gap-3">
            <div className="relative group rounded-lg overflow-hidden border border-gray-200 bg-black/5 flex items-center justify-center min-h-[160px] max-h-[220px]">
              {previewUrl ? (
                <img
                  src={previewUrl}
                  alt="Uploaded scan preview"
                  className="w-full h-full object-contain max-h-[220px]"
                />
              ) : (
                <div className="flex items-center gap-2 text-gray-400">
                  <FileImage className="size-6" />
                  <span className="text-xs">Image loaded</span>
                </div>
              )}
              <Button
                size="icon"
                variant="secondary"
                onClick={handleClearFile}
                className="absolute top-2 right-2 size-7 rounded-full bg-black/60 hover:bg-black/80 text-white border-0 shadow-sm transition-opacity"
                title="Remove image"
              >
                <X size={14} />
              </Button>
            </div>

            <div className="flex items-center justify-between text-xs px-1">
              <div className="truncate max-w-[240px]">
                <p className="font-semibold text-gray-900 truncate">{selectedFile.name}</p>
                <p className="text-[11px] text-gray-500">
                  {(selectedFile.size / 1024).toFixed(0)} KB • {selectedFile.type || "Image"}
                </p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs text-red-600 hover:text-red-700 hover:bg-red-50 px-2"
                onClick={handleClearFile}
              >
                Change
              </Button>
            </div>
          </div>
        )}

        <input
          ref={fileInputRef}
          type="file"
          accept=".dcm,.jpg,.jpeg,.png,image/*"
          className="hidden"
          tabIndex={-1}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleFile(file);
          }}
        />

        {/* Modality Selector */}
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold text-gray-700 flex items-center gap-1.5">
            <Layers size={13} className="text-[#0062a1]" />
            Scan Modality &amp; Anatomical Target
          </label>
          <Select value={modality} onValueChange={setModality}>
            <SelectTrigger className="w-full text-xs h-9 bg-white">
              <SelectValue placeholder="Select modality" />
            </SelectTrigger>
            <SelectContent>
              {MODALITY_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value} className="text-xs">
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Clinical Symptoms Context Input */}
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold text-gray-700 flex items-center gap-1.5">
            <Stethoscope size={13} className="text-[#0062a1]" />
            Patient Clinical Context &amp; Presenting Symptoms
          </label>
          <Textarea
            value={clinicalContext}
            onChange={(e) => setClinicalContext(e.target.value)}
            placeholder="e.g. 52-year-old male with persistent productive cough, fever 38.2°C, and left lower lobe crackles..."
            className="resize-none text-xs min-h-20 bg-white"
          />
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col gap-2">
          <Button
            disabled={!selectedFile || analyzing}
            onClick={() => void handleAnalyze()}
            className="w-full font-semibold shadow-xs"
            style={{ backgroundColor: "#0062a1", color: "#fff" }}
          >
            {analyzing ? (
              <div className="flex items-center gap-2">
                <div className="size-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                <span>Analyzing Multimodal Scan...</span>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <SparklesIcon className="size-4" />
                <span>Analyze Scan with AI</span>
              </div>
            )}
          </Button>

          {selectedFile && !analysisResult && (
            <Button
              type="button"
              variant="outline"
              disabled={generatingPdf}
              onClick={() => void handleExportPdf()}
              className="w-full text-xs h-9 font-semibold text-[#0062a1] border-blue-200 hover:bg-blue-50"
            >
              {generatingPdf ? (
                <div className="flex items-center gap-1.5">
                  <div className="size-3 rounded-full border-2 border-[#0062a1]/30 border-t-[#0062a1] animate-spin" />
                  <span>Generating PDF with Image...</span>
                </div>
              ) : (
                <div className="flex items-center gap-1.5">
                  <FileImage size={14} />
                  <span>Export PDF (with Attached Image)</span>
                </div>
              )}
            </Button>
          )}
        </div>

        {error && (
          <div className="flex items-start gap-2 text-xs text-red-600 rounded-lg bg-red-50 border border-red-100 p-3">
            <AlertTriangle size={15} className="flex-shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {/* In-Depth AI Diagnostic Results Section */}
        {analysisResult && (
          <div className="flex flex-col gap-3.5 pt-2 border-t border-gray-100">
            {/* On-Screen Machine Telemetry Extracted via OCR */}
            {analysisResult.extracted_hud_metadata && analysisResult.extracted_hud_metadata.length > 0 && (
              <div className="rounded-lg bg-slate-900 text-slate-200 px-3 py-2 text-[11px] font-mono flex flex-col gap-1 border border-slate-800">
                <div className="text-[9px] text-slate-400 font-semibold uppercase tracking-wider">
                  📡 On-Screen Scan Telemetry (OCR Parsed):
                </div>
                <div className="flex flex-wrap gap-1 text-[10px]">
                  {analysisResult.extracted_hud_metadata.map((t, idx) => (
                    <span key={idx} className="bg-slate-800/90 px-1.5 py-0.5 rounded border border-slate-700 text-cyan-300 font-mono">
                      {t}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Primary Impression Box */}
            <div className="rounded-xl bg-blue-50/50 border border-blue-100 p-3.5">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[11px] font-bold text-[#002444] uppercase tracking-wider flex items-center gap-1">
                  <Activity size={13} className="text-[#0062a1]" />
                  Primary Diagnostic Impression
                </span>
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-blue-100/80 text-[#0062a1]">
                  AI Synthesis
                </span>
              </div>
              <p className="text-xs text-gray-800 leading-relaxed font-medium">
                {analysisResult.impression || analysisResult.summary}
              </p>
            </div>

            {/* Systematic Anatomical Findings */}
            {analysisResult.findings && analysisResult.findings.length > 0 && (
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-2 flex items-center gap-1">
                  <ListChecks size={12} className="text-gray-400" />
                  Systematic Observations
                </p>
                <div className="flex flex-col gap-1.5">
                  {analysisResult.findings.map((f: FindingItem, idx: number) => (
                    <div
                      key={idx}
                      className="text-xs rounded-lg border border-gray-100 bg-gray-50/50 p-2.5 flex flex-col gap-1"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-gray-800 text-[11px]">
                          {f.location}
                        </span>
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${getSeverityColor(f.severity)}`}>
                          {f.severity}
                        </span>
                      </div>
                      <p className="text-[11px] text-gray-600 leading-normal">
                        {f.observation}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Differential Diagnoses with ICD Codes */}
            {analysisResult.differentials && analysisResult.differentials.length > 0 && (
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-2">
                  Differential Diagnoses &amp; ICD-10
                </p>
                <div className="flex flex-col gap-1.5">
                  {analysisResult.differentials.map((item: DifferentialItem, index: number) => (
                    <div
                      key={index}
                      className="flex items-center justify-between text-xs p-2 rounded-lg bg-white border border-gray-200"
                    >
                      <div className="flex flex-col">
                        <span className="font-medium text-gray-900">{item.label}</span>
                        {item.icd_code && (
                          <span className="text-[10px] text-gray-400">
                            ICD-10: <strong className="text-gray-600">{item.icd_code}</strong>
                          </span>
                        )}
                      </div>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 capitalize">
                        {item.confidence}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Clinical Next Steps & Recommendations */}
            {analysisResult.recommendations && analysisResult.recommendations.length > 0 && (
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-1.5">
                  Recommended Next Steps
                </p>
                <ul className="flex flex-col gap-1">
                  {analysisResult.recommendations.map((rec: string, i: number) => (
                    <li key={i} className="text-[11px] text-gray-600 flex items-start gap-1.5">
                      <CheckCircle2 size={13} className="text-[#0062a1] flex-shrink-0 mt-0.5" />
                      <span>{rec}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Patient Selection & Save Draft to EHR / Export PDF */}
            <div className="flex flex-col gap-2.5 border-t border-gray-100 pt-3.5">
              <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500">
                Actions &amp; Report Export
              </p>
              {patients.length > 0 && (
                <Select value={patientId} onValueChange={setPatientId}>
                  <SelectTrigger className="w-full text-xs h-9 bg-white">
                    <SelectValue placeholder="Select patient to attach" />
                  </SelectTrigger>
                  <SelectContent>
                    {patients.map((patient) => (
                      <SelectItem key={patient.id} value={patient.id} className="text-xs">
                        {patient.patient_code} — {patient.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              <div className="flex flex-col sm:flex-row gap-2">
                {patients.length > 0 && (
                  <Button
                    type="button"
                    variant="outline"
                    disabled={saving || !patientId}
                    onClick={() => void handleSaveDraft()}
                    className="flex-1 text-xs h-9 font-medium"
                  >
                    {saved ? "✓ Saved" : saving ? "Saving…" : "Save Draft"}
                  </Button>
                )}
                <Button
                  type="button"
                  disabled={generatingPdf}
                  onClick={() => void handleExportPdf()}
                  className="flex-1 text-xs h-9 font-semibold shadow-2xs"
                  style={{ backgroundColor: "#0062a1", color: "#fff" }}
                >
                  {generatingPdf ? (
                    <div className="flex items-center gap-1.5">
                      <div className="size-3 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                      <span>Generating PDF…</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5">
                      <FileImage size={14} />
                      <span>Export PDF (with Scan)</span>
                    </div>
                  )}
                </Button>
              </div>
            </div>
          </div>
        )}

        <p className="text-[10px] text-gray-400 text-center leading-relaxed border-t border-gray-100 pt-3">
          AI analysis for clinician review only. Not a definitive diagnosis.
        </p>
      </div>
    </div>
  );
}

