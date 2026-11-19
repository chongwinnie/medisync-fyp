"use client";

import { useEffect, useState } from "react";
import { Brain, Search, Cpu, User, Shield, Clock, ExternalLink, Sparkles, RefreshCw } from "lucide-react";

interface MemoryItem {
  id: string;
  index: number;
  content: string;
  role: string;
  agent_id: string;
  user_id: string;
  created_at: string;
  entry_mode: string;
}

export default function MemoryVaultPage() {
  const [memories, setMemories] = useState<MemoryItem[]>([]);
  const [filteredMemories, setFilteredMemories] = useState<MemoryItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [selectedAgent, setSelectedAgent] = useState<string>("all");

  const fetchMemories = async () => {
    setLoading(true);
    try {
      const apiUrl = process.env.NEXT_PUBLIC_AI_API_URL || "http://localhost:8000";
      const res = await fetch(`${apiUrl}/memory`);
      const data = await res.json();
      if (data.memories) {
        setMemories(data.memories);
        setFilteredMemories(data.memories);
      }
    } catch (err) {
      console.error("Failed to load Mem0 memories:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMemories();
  }, []);

  useEffect(() => {
    let result = memories;
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase();
      result = result.filter(
        (m) =>
          m.content.toLowerCase().includes(q) ||
          m.agent_id.toLowerCase().includes(q) ||
          m.role.toLowerCase().includes(q) ||
          m.user_id.toLowerCase().includes(q)
      );
    }
    if (selectedAgent !== "all") {
      result = result.filter((m) => m.agent_id === selectedAgent);
    }
    setFilteredMemories(result);
  }, [searchTerm, selectedAgent, memories]);

  const agents = Array.from(new Set(memories.map((m) => m.agent_id)));

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-slate-900/80 border border-slate-800 p-6 rounded-2xl backdrop-blur-xl">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-sky-500/10 border border-sky-500/20 rounded-xl text-sky-400">
              <Brain className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-100 flex items-center gap-2">
                Mem0 AI Long-Term Memory Vault
                <span className="text-xs bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-2.5 py-0.5 rounded-full font-semibold">
                  LIVE RECALL ACTIVE
                </span>
              </h1>
              <p className="text-sm text-slate-400 mt-1">
                Inspect cross-session clinical memories, doctor preferences, and autonomous agent learnings stored in ChromaDB vector store.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={fetchMemories}
            className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm font-medium rounded-xl border border-slate-700 transition"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>

          <a
            href="http://localhost:8000/docs#/memory/list_memories_memory_get"
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-2 px-4 py-2 bg-sky-600 hover:bg-sky-500 text-white text-sm font-medium rounded-xl transition shadow-lg shadow-sky-600/20"
          >
            <ExternalLink className="w-4 h-4" />
            Open Memory OpenAPI
          </a>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-slate-900/60 border border-slate-800 p-5 rounded-xl">
          <div className="flex justify-between items-center text-slate-400 text-xs font-semibold uppercase tracking-wider">
            <span>Total Extracted Memories</span>
            <Sparkles className="w-4 h-4 text-sky-400" />
          </div>
          <div className="text-3xl font-extrabold text-slate-100 mt-2">{memories.length}</div>
          <div className="text-xs text-slate-400 mt-1">Indexed in `medisync_mem0` Chroma collection</div>
        </div>

        <div className="bg-slate-900/60 border border-slate-800 p-5 rounded-xl">
          <div className="flex justify-between items-center text-slate-400 text-xs font-semibold uppercase tracking-wider">
            <span>Active Specialist Agents</span>
            <Cpu className="w-4 h-4 text-indigo-400" />
          </div>
          <div className="text-3xl font-extrabold text-slate-100 mt-2">{agents.length}</div>
          <div className="text-xs text-slate-400 mt-1">Clinical, Diagnostics, Scheduling, Inventory</div>
        </div>

        <div className="bg-slate-900/60 border border-slate-800 p-5 rounded-xl">
          <div className="flex justify-between items-center text-slate-400 text-xs font-semibold uppercase tracking-wider">
            <span>Memory Visualizers</span>
            <Brain className="w-4 h-4 text-purple-400" />
          </div>
          <div className="text-sm font-semibold text-purple-300 mt-2">Obsidian Vault & Vis.js Graph</div>
          <div className="text-xs text-slate-400 mt-1">Interactive 2D/3D Node Graph Viewers Ready</div>
        </div>
      </div>

      {/* Search & Filter Controls */}
      <div className="flex flex-col md:flex-row gap-4 justify-between bg-slate-900/40 p-4 border border-slate-800 rounded-xl">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
          <input
            type="text"
            placeholder="Search long-term memories by keyword, patient name, or doctor preferences..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-9 pr-4 py-2 text-sm text-slate-200 focus:outline-none focus:border-sky-500"
          />
        </div>

        <div className="flex gap-3">
          <select
            value={selectedAgent}
            onChange={(e) => setSelectedAgent(e.target.value)}
            className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-sky-500"
          >
            <option value="all">All Agents ({memories.length})</option>
            {agents.map((ag) => (
              <option key={ag} value={ag}>
                Agent: {ag}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Memories Grid */}
      {loading ? (
        <div className="py-12 text-center text-slate-400">Loading long-term memories from Mem0 engine...</div>
      ) : filteredMemories.length === 0 ? (
        <div className="py-12 text-center text-slate-400 border border-dashed border-slate-800 rounded-xl">
          No matching long-term memories found.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {filteredMemories.map((m) => (
            <div
              key={m.id}
              className="bg-slate-900/70 border border-slate-800 hover:border-slate-700 transition p-5 rounded-xl space-y-3"
            >
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800/80 pb-3">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono bg-sky-500/10 text-sky-400 border border-sky-500/20 px-2 py-0.5 rounded">
                    #{m.index}
                  </span>
                  <span className="text-xs font-semibold bg-indigo-500/10 text-indigo-300 border border-indigo-500/20 px-2.5 py-0.5 rounded-full flex items-center gap-1">
                    <Cpu className="w-3 h-3" />
                    Agent: {m.agent_id}
                  </span>
                  <span className="text-xs font-semibold bg-purple-500/10 text-purple-300 border border-purple-500/20 px-2.5 py-0.5 rounded-full flex items-center gap-1">
                    <Shield className="w-3 h-3" />
                    Role: {m.role}
                  </span>
                </div>

                <div className="flex items-center gap-3 text-xs text-slate-400">
                  <span className="flex items-center gap-1">
                    <User className="w-3 h-3" /> {m.user_id}
                  </span>
                  {m.created_at && (
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" /> {new Date(m.created_at).toLocaleString()}
                    </span>
                  )}
                </div>
              </div>

              <p className="text-slate-200 text-sm font-medium leading-relaxed bg-slate-950/50 p-3 rounded-lg border border-slate-800/50">
                "{m.content}"
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
