"use client";

import { Share2, ExternalLink, RefreshCw, Network, Database, Brain, Sparkles } from "lucide-react";

export default function SystemGraphPage() {
  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto h-[calc(100vh-80px)] flex flex-col">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-slate-900/80 border border-slate-800 p-6 rounded-2xl backdrop-blur-xl shrink-0">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-rose-500/10 border border-rose-500/20 rounded-xl text-rose-400">
              <Network className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-100 flex items-center gap-2">
                MediSync Complete System Knowledge & Data Graph
                <span className="text-xs bg-rose-500/20 text-rose-400 border border-rose-500/30 px-2.5 py-0.5 rounded-full font-semibold">
                  CROSS-ENTITY LINKED
                </span>
              </h1>
              <p className="text-sm text-slate-400 mt-1">
                Visualizing relationships between Patients, ICD-10 Conditions, Active Medications, Diagnostic Scans, Appointments, Staff, Inventory, and Mem0 AI Agent Memory.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <a
            href="/system_knowledge_graph.html"
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-2 px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white text-sm font-medium rounded-xl transition shadow-lg shadow-rose-600/20"
          >
            <ExternalLink className="w-4 h-4" />
            Open Full Screen Graph
          </a>
        </div>
      </div>

      {/* Embedded Knowledge Graph Viewer */}
      <div className="flex-1 bg-slate-950 border border-slate-800 rounded-2xl overflow-hidden relative shadow-2xl">
        <iframe
          src="/system_knowledge_graph.html"
          className="w-full h-full border-none"
          title="MediSync System Knowledge Graph"
        />
      </div>
    </div>
  );
}
