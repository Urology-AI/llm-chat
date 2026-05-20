import { useEffect, useRef, useState } from "react";
import { Send, Settings, X, Loader2, Bot, User, RotateCcw, Zap } from "lucide-react";
import { cn } from "./lib/utils";

type Role = "user" | "assistant";

interface Message {
  id: string;
  role: Role;
  content: string;
  error?: boolean;
}

const DEFAULT_ENDPOINT = "http://localhost:8000";
const DEFAULT_MODEL = "google/gemma-3-4b-it";

function useAutoScroll(dep: unknown) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.scrollTo({ top: ref.current.scrollHeight, behavior: "smooth" });
  }, [dep]);
  return ref;
}

export default function App() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [endpoint, setEndpoint] = useState(DEFAULT_ENDPOINT);
  const [model, setModel] = useState(DEFAULT_MODEL);
  const [showConfig, setShowConfig] = useState(false);
  const [draftEndpoint, setDraftEndpoint] = useState(DEFAULT_ENDPOINT);
  const [draftModel, setDraftModel] = useState(DEFAULT_MODEL);

  const abortRef = useRef<AbortController | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useAutoScroll(messages);

  function openConfig() {
    setDraftEndpoint(endpoint);
    setDraftModel(model);
    setShowConfig(true);
  }

  function saveConfig() {
    setEndpoint(draftEndpoint.replace(/\/+$/, ""));
    setModel(draftModel.trim());
    setShowConfig(false);
  }

  function clearChat() {
    abortRef.current?.abort();
    setMessages([]);
    setStreaming(false);
  }

  function stop() {
    abortRef.current?.abort();
  }

  async function send() {
    const text = input.trim();
    if (!text || streaming) return;

    const userMsg: Message = { id: crypto.randomUUID(), role: "user", content: text };
    const assistantId = crypto.randomUUID();
    const assistantMsg: Message = { id: assistantId, role: "assistant", content: "" };

    setMessages((prev) => [...prev, userMsg, assistantMsg]);
    setInput("");
    setStreaming(true);

    const history = [...messages, userMsg].map((m) => ({
      role: m.role,
      content: m.content,
    }));

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch(`${endpoint}/v1/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({ model, messages: history, stream: true, temperature: 0.7 }),
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`${res.status} ${res.statusText}: ${errText}`);
      }

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith("data:")) continue;
          const data = trimmed.slice(5).trim();
          if (data === "[DONE]") break;
          try {
            const chunk = JSON.parse(data);
            const delta = chunk.choices?.[0]?.delta?.content;
            if (delta) {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantId ? { ...m, content: m.content + delta } : m
                )
              );
            }
          } catch { /* skip malformed chunk */ }
        }
      }
    } catch (err: unknown) {
      if ((err as Error).name === "AbortError") return;
      const msg = err instanceof Error ? err.message : "Unknown error";
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId ? { ...m, content: `Error: ${msg}`, error: true } : m
        )
      );
    } finally {
      setStreaming(false);
      abortRef.current = null;
      setTimeout(() => textareaRef.current?.focus(), 0);
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  function onInputChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setInput(e.target.value);
    e.target.style.height = "auto";
    e.target.style.height = `${Math.min(e.target.scrollHeight, 200)}px`;
  }

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col bg-[var(--ms-gray-100)]">

      {/* ── Header ── */}
      <header className="shrink-0 bg-[var(--ms-navy)]" style={{ borderBottom: "3px solid var(--ms-cyan)" }}>
        <div className="flex items-center justify-between px-5 py-3.5">
          {/* Branding */}
          <div className="flex items-center gap-3">
            <div
              className="flex h-9 w-9 items-center justify-center rounded-[8px]"
              style={{ background: "rgba(6,171,235,0.15)", border: "1px solid rgba(6,171,235,0.25)" }}
            >
              <Zap className="h-4.5 w-4.5" style={{ color: "var(--ms-cyan)" }} strokeWidth={2.5} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[15px] font-semibold leading-tight text-white tracking-[-0.01em]">
                  LLM Chat
                </span>
                <span
                  className="rounded-full px-2 py-0.5 text-[10px] font-medium leading-none"
                  style={{ background: "rgba(6,171,235,0.18)", color: "var(--ms-cyan)" }}
                >
                  {model.split("/").pop()}
                </span>
              </div>
              <p className="mt-0.5 text-[11px] leading-none" style={{ color: "rgba(255,255,255,0.45)" }}>
                Tewari Lab · Icahn School of Medicine at Mount Sinai
              </p>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-1">
            {messages.length > 0 && (
              <button
                onClick={clearChat}
                className="flex h-8 w-8 items-center justify-center rounded-[6px] transition-colors"
                style={{ color: "rgba(255,255,255,0.5)" }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "rgba(255,255,255,0.08)";
                  e.currentTarget.style.color = "#fff";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "transparent";
                  e.currentTarget.style.color = "rgba(255,255,255,0.5)";
                }}
                title="Clear chat"
              >
                <RotateCcw className="h-[15px] w-[15px]" />
              </button>
            )}
            <button
              onClick={openConfig}
              className="flex h-8 w-8 items-center justify-center rounded-[6px] transition-colors"
              style={{ color: "rgba(255,255,255,0.5)" }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "rgba(255,255,255,0.08)";
                e.currentTarget.style.color = "#fff";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "transparent";
                e.currentTarget.style.color = "rgba(255,255,255,0.5)";
              }}
              title="Configure endpoint"
            >
              <Settings className="h-[15px] w-[15px]" />
            </button>
          </div>
        </div>
      </header>

      {/* ── Messages ── */}
      <div
        ref={scrollRef}
        className="chat-scroll flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-5 py-6"
      >
        {messages.length === 0 ? (
          <EmptyState model={model} endpoint={endpoint} onConfig={openConfig} />
        ) : (
          messages.map((msg) => <MessageBubble key={msg.id} msg={msg} />)
        )}
      </div>

      {/* ── Input ── */}
      <div
        className="shrink-0 px-5 py-4"
        style={{ borderTop: "1px solid var(--ms-gray-200)", background: "#fff" }}
      >
        <div className="flex items-end gap-2.5">
          <textarea
            ref={textareaRef}
            rows={1}
            value={input}
            onChange={onInputChange}
            onKeyDown={onKeyDown}
            placeholder="Message…"
            disabled={streaming}
            className={cn(
              "chat-scroll flex-1 resize-none rounded-[8px] px-3.5 py-2.5",
              "text-sm leading-relaxed focus:outline-none disabled:opacity-50",
              "min-h-[44px] max-h-[200px]"
            )}
            style={{
              border: "1.5px solid var(--ms-gray-200)",
              background: "var(--ms-gray-100)",
              color: "var(--ms-black)",
              transition: "border-color 0.15s",
            }}
            onFocus={(e) => (e.currentTarget.style.borderColor = "var(--ms-cyan)")}
            onBlur={(e) => (e.currentTarget.style.borderColor = "var(--ms-gray-200)")}
          />
          {streaming ? (
            <button
              onClick={stop}
              className="flex h-[44px] w-[44px] shrink-0 items-center justify-center rounded-[8px] transition-colors"
              style={{ border: "1.5px solid var(--ms-gray-200)", background: "var(--ms-gray-100)", color: "var(--ms-gray-600)" }}
              title="Stop generation"
            >
              <Loader2 className="h-4 w-4 animate-spin" />
            </button>
          ) : (
            <button
              onClick={send}
              disabled={!input.trim()}
              className="flex h-[44px] w-[44px] shrink-0 items-center justify-center rounded-[8px] text-white transition-all disabled:opacity-35 disabled:cursor-not-allowed"
              style={{ background: "var(--ms-cyan)" }}
              onMouseEnter={(e) => { if (!e.currentTarget.disabled) e.currentTarget.style.background = "#059fd8"; }}
              onMouseLeave={(e) => (e.currentTarget.style.background = "var(--ms-cyan)")}
              title="Send (Enter)"
            >
              <Send className="h-4 w-4" />
            </button>
          )}
        </div>
        <p className="mt-2 text-[10px]" style={{ color: "var(--ms-gray-400)" }}>
          Enter to send · Shift+Enter for new line
        </p>
      </div>

      {/* ── Config modal ── */}
      {showConfig && <ConfigModal
        draftEndpoint={draftEndpoint}
        draftModel={draftModel}
        setDraftEndpoint={setDraftEndpoint}
        setDraftModel={setDraftModel}
        onSave={saveConfig}
        onClose={() => setShowConfig(false)}
      />}
    </div>
  );
}

/* ─── Sub-components ─── */

function EmptyState({ model, endpoint, onConfig }: { model: string; endpoint: string; onConfig: () => void }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-5 text-center">
      <div
        className="flex h-16 w-16 items-center justify-center rounded-[12px]"
        style={{ background: "var(--ms-navy-10)", border: "1px solid var(--ms-navy-20)" }}
      >
        <Bot className="h-8 w-8" style={{ color: "var(--ms-navy)" }} />
      </div>
      <div className="space-y-1">
        <p className="text-base font-semibold" style={{ color: "var(--ms-navy)" }}>
          {model.split("/").pop()}
        </p>
        <button
          onClick={onConfig}
          className="block text-xs transition-colors"
          style={{ color: "var(--ms-gray-600)" }}
          onMouseEnter={(e) => (e.currentTarget.style.color = "var(--ms-cyan)")}
          onMouseLeave={(e) => (e.currentTarget.style.color = "var(--ms-gray-600)")}
        >
          {endpoint}
        </button>
      </div>
      <p className="max-w-xs text-sm" style={{ color: "var(--ms-gray-600)", lineHeight: 1.6 }}>
        Start a conversation. No history is saved between sessions.
      </p>
    </div>
  );
}

function MessageBubble({ msg }: { msg: Message }) {
  const isUser = msg.role === "user";
  return (
    <div className={cn("flex gap-2.5", isUser && "flex-row-reverse")}>
      <div
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[6px]"
        style={
          isUser
            ? { background: "var(--ms-cyan)", color: "#fff" }
            : { background: "var(--ms-navy-10)", color: "var(--ms-navy)" }
        }
      >
        {isUser ? <User className="h-3.5 w-3.5" /> : <Bot className="h-3.5 w-3.5" />}
      </div>
      <div
        className={cn(
          "max-w-[78%] rounded-[8px] px-3.5 py-2.5 text-sm leading-relaxed",
          isUser ? "rounded-tr-[3px]" : "rounded-tl-[3px]",
          !msg.content && "min-w-[2.5rem]"
        )}
        style={
          isUser
            ? { background: "var(--ms-cyan)", color: "#fff" }
            : msg.error
            ? { background: "#fef2f2", color: "#b91c1c", border: "1px solid #fecaca" }
            : { background: "#fff", color: "var(--ms-black)", border: "1px solid var(--ms-gray-200)" }
        }
      >
        {msg.content ? (
          <pre className="whitespace-pre-wrap font-sans">{msg.content}</pre>
        ) : (
          <span className="inline-flex items-center gap-1" style={{ color: "var(--ms-gray-400)" }}>
            <span className="h-1.5 w-1.5 rounded-full bg-current animate-bounce [animation-delay:0ms]" />
            <span className="h-1.5 w-1.5 rounded-full bg-current animate-bounce [animation-delay:150ms]" />
            <span className="h-1.5 w-1.5 rounded-full bg-current animate-bounce [animation-delay:300ms]" />
          </span>
        )}
      </div>
    </div>
  );
}

function ConfigModal({
  draftEndpoint, draftModel, setDraftEndpoint, setDraftModel, onSave, onClose,
}: {
  draftEndpoint: string;
  draftModel: string;
  setDraftEndpoint: (v: string) => void;
  setDraftModel: (v: string) => void;
  onSave: () => void;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,45,0.55)" }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="w-full max-w-md rounded-[10px] shadow-2xl"
        style={{ border: "1px solid var(--ms-gray-200)", background: "#fff" }}
      >
        {/* Modal header */}
        <div
          className="flex items-center justify-between px-6 py-4"
          style={{ borderBottom: "1px solid var(--ms-gray-200)" }}
        >
          <div>
            <h2 className="text-sm font-semibold" style={{ color: "var(--ms-navy)" }}>
              Endpoint Configuration
            </h2>
            <p className="mt-0.5 text-[11px]" style={{ color: "var(--ms-gray-600)" }}>
              vLLM-compatible OpenAI API
            </p>
          </div>
          <button
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-[6px] transition-colors"
            style={{ color: "var(--ms-gray-400)" }}
            onMouseEnter={(e) => { e.currentTarget.style.background = "var(--ms-gray-100)"; e.currentTarget.style.color = "var(--ms-black)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "var(--ms-gray-400)"; }}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Modal body */}
        <div className="flex flex-col gap-4 px-6 py-5">
          <ConfigField
            label="vLLM Base URL"
            value={draftEndpoint}
            onChange={setDraftEndpoint}
            placeholder="http://minerva:8000"
          />
          <ConfigField
            label="Model name"
            value={draftModel}
            onChange={setDraftModel}
            placeholder="google/gemma-3-4b-it"
          />
          <p className="text-[11px]" style={{ color: "var(--ms-gray-600)" }}>
            Sends requests to{" "}
            <code className="rounded px-1 py-0.5 font-mono text-[10px]" style={{ background: "var(--ms-gray-100)", color: "var(--ms-navy)" }}>
              {"{base_url}"}/v1/chat/completions
            </code>{" "}
            with SSE streaming.
          </p>
        </div>

        {/* Modal footer */}
        <div
          className="flex justify-end gap-2 px-6 py-4"
          style={{ borderTop: "1px solid var(--ms-gray-200)" }}
        >
          <button
            onClick={onClose}
            className="rounded-[6px] px-4 py-2 text-sm font-medium transition-colors"
            style={{ border: "1.5px solid var(--ms-navy)", color: "var(--ms-navy)", background: "transparent" }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "var(--ms-navy-10)")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
          >
            Cancel
          </button>
          <button
            onClick={onSave}
            className="rounded-[6px] px-4 py-2 text-sm font-medium text-white transition-colors"
            style={{ background: "var(--ms-cyan)" }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "#059fd8")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "var(--ms-cyan)")}
          >
            Save & connect
          </button>
        </div>
      </div>
    </div>
  );
}

function ConfigField({ label, value, onChange, placeholder }: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[11px] font-medium uppercase tracking-wider" style={{ color: "var(--ms-gray-600)" }}>
        {label}
      </span>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="rounded-[6px] px-3 py-2 text-sm focus:outline-none"
        style={{
          border: "1.5px solid var(--ms-gray-200)",
          background: "var(--ms-gray-100)",
          color: "var(--ms-black)",
          transition: "border-color 0.15s",
        }}
        onFocus={(e) => (e.currentTarget.style.borderColor = "var(--ms-cyan)")}
        onBlur={(e) => (e.currentTarget.style.borderColor = "var(--ms-gray-200)")}
      />
    </label>
  );
}
