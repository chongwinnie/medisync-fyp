"use client";

import { useState, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Upload, Database, RefreshCw, Trash2, FileText, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";

interface UploadRecord {
  id: string;
  filename: string;
  chunks_added: number;
  uploaded_at: string;
}

interface KBStatus {
  collection: string;
  document_count: number;
  error?: string;
}

export function KnowledgeBasePanel() {
  const [status, setStatus] = useState<KBStatus | null>(null);
  const [uploads, setUploads] = useState<UploadRecord[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [reindexing, setReindexing] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const showMsg = (type: "success" | "error", text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 5000);
  };

  async function fetchStatus() {
    const res = await fetch("/api/knowledge/status");
    if (res.ok) setStatus(await res.json());
  }

  async function handleUpload(file: File) {
    setUploading(true);
    const form = new FormData();
    form.append("file", file);
    form.append("source_label", file.name);
    try {
      const res = await fetch("/api/knowledge/upload", { method: "POST", body: form });
      const data = await res.json();
      if (res.ok) {
        showMsg("success", `✓ Uploaded ${file.name} — ${data.chunks_added} chunks added.`);
        setUploads((prev) => [
          { id: data.upload_id, filename: file.name, chunks_added: data.chunks_added, uploaded_at: new Date().toISOString() },
          ...prev,
        ]);
        fetchStatus();
      } else {
        showMsg("error", data.error ?? "Upload failed.");
      }
    } catch {
      showMsg("error", "Network error uploading file.");
    } finally {
      setUploading(false);
    }
  }

  async function handleReindex() {
    setReindexing(true);
    try {
      const res = await fetch("/api/knowledge/reindex", { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        showMsg("success", "Re-index completed successfully.");
        fetchStatus();
      } else {
        showMsg("error", data.error ?? "Re-index failed.");
      }
    } catch {
      showMsg("error", "Network error during re-index.");
    } finally {
      setReindexing(false);
    }
  }

  async function handleDelete(uploadId: string) {
    const res = await fetch(`/api/knowledge/document/${uploadId}`, { method: "DELETE" });
    if (res.ok) {
      setUploads((prev) => prev.filter((u) => u.id !== uploadId));
      showMsg("success", "Document removed from knowledge base.");
      fetchStatus();
    } else {
      showMsg("error", "Failed to delete document.");
    }
  }

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleUpload(file);
  }, []);

  // Load status on first render
  useState(() => { fetchStatus(); });

  return (
    <div className="space-y-6">
      {/* Status Card */}
      <div className="bg-white rounded-xl shadow-sm p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Database size={18} className="text-[#0062a1]" />
            <h2 className="text-base font-semibold text-[#002444]">Knowledge Base Status</h2>
          </div>
          <Button variant="outline" size="sm" className="text-xs gap-1.5" onClick={fetchStatus}>
            <RefreshCw size={12} /> Refresh
          </Button>
        </div>
        {status ? (
          <div className="flex items-center gap-4">
            <div className="bg-blue-50 rounded-lg px-4 py-3 flex-1">
              <p className="text-xs text-gray-500 uppercase tracking-wide">Collection</p>
              <p className="font-mono text-sm font-medium text-[#002444] mt-0.5">{status.collection}</p>
            </div>
            <div className="bg-green-50 rounded-lg px-4 py-3 flex-1">
              <p className="text-xs text-gray-500 uppercase tracking-wide">Indexed Documents</p>
              <p className="text-2xl font-bold text-green-700 mt-0.5">{status.document_count.toLocaleString()}</p>
            </div>
          </div>
        ) : (
          <p className="text-sm text-gray-400">Loading status…</p>
        )}
      </div>

      {/* Upload Area */}
      <div className="bg-white rounded-xl shadow-sm p-5">
        <h2 className="text-base font-semibold text-[#002444] mb-4">Upload Document</h2>
        <div
          className={`border-2 border-dashed rounded-xl p-8 text-center transition-colors cursor-pointer ${isDragging ? "border-[#0062a1] bg-blue-50" : "border-gray-200 hover:border-gray-300"}`}
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={onDrop}
          onClick={() => fileRef.current?.click()}
        >
          {uploading ? (
            <div className="flex flex-col items-center gap-2">
              <Loader2 size={32} className="text-[#0062a1] animate-spin" />
              <p className="text-sm text-gray-500">Uploading and embedding…</p>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2">
              <Upload size={32} className="text-gray-300" />
              <p className="text-sm font-medium text-gray-600">Drop a file here or click to browse</p>
              <p className="text-xs text-gray-400">Supports PDF, TXT, and Markdown files</p>
            </div>
          )}
        </div>
        <input ref={fileRef} type="file" className="hidden" accept=".pdf,.txt,.md" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUpload(f); }} />
      </div>

      {/* Flash message */}
      {message && (
        <div className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium ${message.type === "success" ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>
          {message.type === "success" ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
          {message.text}
        </div>
      )}

      {/* Upload History */}
      {uploads.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm p-5">
          <h2 className="text-base font-semibold text-[#002444] mb-4">Uploaded Documents</h2>
          <div className="space-y-2">
            {uploads.map((u) => (
              <div key={u.id} className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2.5">
                <div className="flex items-center gap-2.5 min-w-0">
                  <FileText size={16} className="text-[#0062a1] shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-800 truncate">{u.filename}</p>
                    <p className="text-xs text-gray-400">{u.chunks_added} chunks · {new Date(u.uploaded_at).toLocaleString("en-GB")}</p>
                  </div>
                </div>
                <button className="text-gray-300 hover:text-red-500 transition-colors ml-2" onClick={() => handleDelete(u.id)}>
                  <Trash2 size={15} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Re-index */}
      <div className="bg-white rounded-xl shadow-sm p-5">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-[#002444]">Re-index Clinical Records</h2>
            <p className="text-xs text-gray-500 mt-0.5">Re-embed all Postgres clinical data into ChromaDB. Takes 1–3 minutes.</p>
          </div>
          <Button variant="outline" className="gap-2 text-sm" onClick={handleReindex} disabled={reindexing}>
            {reindexing ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
            {reindexing ? "Re-indexing…" : "Re-index All"}
          </Button>
        </div>
      </div>
    </div>
  );
}
