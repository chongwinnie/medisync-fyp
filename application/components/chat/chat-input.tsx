"use client"

import { useRef, useState, useCallback } from "react"
import { PaperclipIcon, SendIcon, SparklesIcon } from "lucide-react"

const MAX_CHARS = 4000

interface ChatInputProps {
  onSend: (text: string) => void
  isDisabled?: boolean
}

export function ChatInput({ onSend, isDisabled }: ChatInputProps) {
  const [value, setValue] = useState("")
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const autoResize = useCallback(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = "auto"
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`
  }, [])

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const next = e.target.value
    if (next.length > MAX_CHARS) return
    setValue(next)
    autoResize()
  }

  const handleSend = () => {
    const trimmed = value.trim()
    if (!trimmed || isDisabled) return
    onSend(trimmed)
    setValue("")
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto"
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const canSend = value.trim().length > 0 && !isDisabled

  return (
    <div className="border-t border-gray-200 bg-white px-4 py-3">
      <div className="flex items-end gap-2 rounded-xl border border-gray-300 bg-white px-3 py-2 shadow-sm focus-within:border-[#1a007d] focus-within:ring-1 focus-within:ring-[#1a007d] transition-all">
        {/* Attach stub */}
        <button
          type="button"
          title="Attach file (coming soon)"
          className="mb-0.5 shrink-0 text-gray-400 hover:text-gray-600 transition-colors focus:outline-none"
          disabled
        >
          <PaperclipIcon className="size-5" />
        </button>

        <textarea
          ref={textareaRef}
          value={value}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder="Type a message or command for the AI Supervisor..."
          rows={1}
          disabled={isDisabled}
          className="flex-1 resize-none bg-transparent text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none disabled:opacity-60"
          style={{ maxHeight: "200px", overflowY: "auto" }}
        />

        <div className="flex shrink-0 flex-col items-end gap-1 mb-0.5">
          <button
            type="button"
            onClick={handleSend}
            disabled={!canSend}
            className="flex size-8 items-center justify-center rounded-lg text-white transition-opacity focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1a007d] disabled:opacity-40"
            style={{ backgroundColor: "#1a007d" }}
          >
            <SendIcon className="size-4" />
          </button>
        </div>
      </div>

      <div className="mt-1.5 flex items-center justify-between px-1">
        <div className="flex items-center gap-1 text-[10px] text-gray-400">
          <SparklesIcon className="size-3" />
          <span>AI responses are for clinical assistance only. Always verify with clinical judgment.</span>
        </div>
        <span
          className={`text-[10px] tabular-nums ${
            value.length > MAX_CHARS * 0.9 ? "text-[#E24B4A]" : "text-gray-400"
          }`}
        >
          {value.length}/{MAX_CHARS}
        </span>
      </div>
    </div>
  )
}
