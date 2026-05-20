import { useEffect, useRef, useState, useCallback } from "react";
import { Send, Settings, X, Loader2, Bot, User, RotateCcw, Zap, Wifi, WifiOff } from "lucide-react";
import { cn } from "./lib/utils";

type Role = "user" | "assistant";
type ConnStatus = "idle" | "connecting" | "connected" | "error";

interface Message {
  id: string;
  role: Role;
  content: string;
  error?: boolean;
}

const DEFAULT_ENDPOINT = "";

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
  const [connStatus, setConnStatus] = useState<ConnStatus>("idle");
  const [detectedModel, setDetectedModel] = useState<string | null>(null);

  const [showConfig, setShowConfig] = useState(false);
  const [draftEndpoint, setDraftEndpoint] = useState(DEFAULT_ENDPOINT);

  const abortRef = useRef<AbortController | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useAutoScroll(messages);

  // Probe the endpoint: GET /v1/models
  const probe = useCallback(async (url: string) => {
    if (!url) { setConnStatus("idle"); setDetectedModel(null); return; }
    setConnStatus("connecting");
    setDetectedModel(null);
    try {
      const res = await fetch(`${url}/v1/models`, { signal: AbortSignal.timeout(5000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      const first = json?.data?.[0]?.id ?? null;
      setDetectedModel(first);
      setConnStatus("connected");
    } catch {
      setConnStatus("error");
      setDetectedModel(null);
    }
  }, []);

  // Re-probe whenever endpoint changes
  useEffect(() => { probe(endpoint); }, [endpoint, probe]);

  function openConfig() {
    setDraftEndpoint(endpoint);
    setShowConfig(true);
  }

  function saveConfig() {
    const url = draftEndpoint.replace(/\/+$/, "");
    setEndpoint(url);
    setShowConfig(false);
  }

  function clearChat() {
    abortRef.current?.abort();
    setMessages([]);
    setStreaming(false);
  }

  async function send() {
    const text = input.trim();
    if (!text || streaming || connStatus !== "connected" || !detectedModel) return;

    const userMsg: Message = { id: crypto.randomUUID(), role: "user", content: text };
    const assistantId = crypto.randomUUID();
    setMessages((prev) => [...prev, userMsg, { id: assistantId, role: "assistant", content: "" }]);
    setInput("");
    setStreaming(true);

    const history = [...messages, userMsg].map((m) => ({ role: m.role, content: m.content }));
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch(`${endpoint}/v1/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({ model: detectedModel, messages: history, stream: true, temperature: 0.7 }),
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
            const delta = JSON.parse(data).choices?.[0]?.delta?.content;
            if (delta) setMessages((prev) => prev.map((m) => m.id === assistantId ? { ...m, content: m.content + delta } : m));
          } catch { /* skip malformed chunk */ }
        }
      }
    } catch (err: unknown) {
      if ((err as Error).name === "AbortError") return;
      const msg = err instanceof Error ? err.message : "Unknown error";
      setMessages((prev) => prev.map((m) => m.id === assistantId ? { ...m, content: `Error: ${msg}`, error: true } : m));
    } finally {
      setStreaming(false);
      abortRef.current = null;
      setTimeout(() => textareaRef.current?.focus(), 0);
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
  }

  function onInputChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setInput(e.target.value);
    e.target.style.height = "auto";
    e.target.style.height = `${Math.min(e.target.scrollHeight, 200)}px`;
  }

  const canSend = input.trim().length > 0 && !streaming && connStatus === "connected";

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col bg-[var(--ms-gray-100)]">

      {/* ── Header ── */}
      <header className="shrink-0 bg-[var(--ms-navy)]" style={{ borderBottom: "3px solid var(--ms-cyan)" }}>
        <div className="flex items-center justify-between px-5 py-3.5">
          <div className="flex items-center gap-3">
            <div
              className="flex h-9 w-9 items-center justify-center rounded-[8px]"
              style={{ background: "rgba(6,171,235,0.15)", border: "1px solid rgba(6,171,235,0.25)" }}
            >
              <Zap className="h-4 w-4" style={{ color: "var(--ms-cyan)" }} strokeWidth={2.5} />
            </div>
            <div>
              <div className="flex items-center gap-2.5">
                <span className="text-[15px] font-semibold leading-tight text-white tracking-[-0.01em]">
                  LLM Chat
                </span>
                <StatusChip status={connStatus} model={detectedModel} />
              </div>
              <p className="mt-0.5 text-[11px] leading-none" style={{ color: "rgba(255,255,255,0.45)" }}>
                Tewari Lab · Icahn School of Medicine at Mount Sinai
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1">
            {messages.length > 0 && (
              <HeaderBtn onClick={clearChat} title="Clear chat">
                <RotateCcw className="h-[15px] w-[15px]" />
              </HeaderBtn>
            )}
            <HeaderBtn onClick={openConfig} title="Configure endpoint">
              <Settings className="h-[15px] w-[15px]" />
            </HeaderBtn>
          </div>
        </div>
      </header>

      {/* ── Messages ── */}
      <div ref={scrollRef} className="chat-scroll flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-5 py-6">
        {messages.length === 0
          ? <EmptyState status={connStatus} model={detectedModel} endpoint={endpoint} onConfig={openConfig} />
          : messages.map((msg) => <MessageBubble key={msg.id} msg={msg} />)
        }
      </div>

      {/* ── Input ── */}
      <div className="shrink-0 px-5 py-4" style={{ borderTop: "1px solid var(--ms-gray-200)", background: "#fff" }}>
        <div className="flex items-end gap-2.5">
          <textarea
            ref={textareaRef}
            rows={1}
            value={input}
            onChange={onInputChange}
            onKeyDown={onKeyDown}
            placeholder={connStatus === "connected" ? "Message…" : "Configure endpoint to start chatting…"}
            disabled={streaming || connStatus !== "connected"}
            className="chat-scroll flex-1 resize-none rounded-[8px] px-3.5 py-2.5 text-sm leading-relaxed focus:outline-none disabled:opacity-50 min-h-[44px] max-h-[200px]"
            style={{ border: "1.5px solid var(--ms-gray-200)", background: "var(--ms-gray-100)", color: "var(--ms-black)", transition: "border-color 0.15s" }}
            onFocus={(e) => (e.currentTarget.style.borderColor = "var(--ms-cyan)")}
            onBlur={(e) => (e.currentTarget.style.borderColor = "var(--ms-gray-200)")}
          />
          {streaming ? (
            <button
              onClick={() => abortRef.current?.abort()}
              className="flex h-[44px] w-[44px] shrink-0 items-center justify-center rounded-[8px]"
              style={{ border: "1.5px solid var(--ms-gray-200)", background: "var(--ms-gray-100)", color: "var(--ms-gray-600)" }}
            >
              <Loader2 className="h-4 w-4 animate-spin" />
            </button>
          ) : (
            <button
              onClick={send}
              disabled={!canSend}
              className="flex h-[44px] w-[44px] shrink-0 items-center justify-center rounded-[8px] text-white transition-all disabled:opacity-35 disabled:cursor-not-allowed"
              style={{ background: "var(--ms-cyan)" }}
              onMouseEnter={(e) => { if (!e.currentTarget.disabled) e.currentTarget.style.background = "#059fd8"; }}
              onMouseLeave={(e) => (e.currentTarget.style.background = "var(--ms-cyan)")}
            >
              <Send className="h-4 w-4" />
            </button>
          )}
        </div>
        <p className="mt-2 text-[10px]" style={{ color: "var(--ms-gray-400)" }}>
          Enter to send · Shift+Enter for new line
        </p>
      </div>

      {showConfig && (
        <ConfigModal
          draftEndpoint={draftEndpoint}
          setDraftEndpoint={setDraftEndpoint}
          onSave={saveConfig}
          onClose={() => setShowConfig(false)}
        />
      )}
    </div>
  );
}

/* ─── Status chip in header ─── */
function StatusChip({ status, model }: { status: ConnStatus; model: string | null }) {
  if (status === "idle") return null;

  const cfg = {
    connecting: { bg: "rgba(175,175,181,0.18)", color: "var(--ms-gray-400)", dot: "var(--ms-gray-400)", label: "Connecting…" },
    connected:  { bg: "rgba(27,122,74,0.15)",   color: "#1B7A4A",            dot: "#22c55e",            label: model?.split("/").pop() ?? "Connected" },
    error:      { bg: "rgba(192,57,43,0.15)",    color: "#C0392B",            dot: "#C0392B",            label: "Not connected" },
  }[status];

  return (
    <span className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-medium" style={{ background: cfg.bg, color: cfg.color }}>
      <span
        className={cn("h-1.5 w-1.5 rounded-full", status === "connecting" && "animate-pulse")}
        style={{ background: cfg.dot }}
      />
      {cfg.label}
    </span>
  );
}

/* ─── Empty state ─── */
function EmptyState({ status, model, endpoint, onConfig }: { status: ConnStatus; model: string | null; endpoint: string; onConfig: () => void }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-5 text-center">
      <div
        className="flex h-16 w-16 items-center justify-center rounded-[12px]"
        style={{ background: "var(--ms-navy-10)", border: "1px solid var(--ms-navy-20)" }}
      >
        {status === "connected"
          ? <Bot className="h-8 w-8" style={{ color: "var(--ms-navy)" }} />
          : <WifiOff className="h-7 w-7" style={{ color: "var(--ms-gray-400)" }} />
        }
      </div>

      {status === "idle" || !endpoint ? (
        <>
          <div className="space-y-1">
            <p className="text-sm font-semibold" style={{ color: "var(--ms-navy)" }}>No endpoint configured</p>
            <p className="text-xs" style={{ color: "var(--ms-gray-600)" }}>Connect to a vLLM server to start chatting</p>
          </div>
          <button
            onClick={onConfig}
            className="rounded-[6px] px-4 py-2 text-sm font-medium text-white transition-colors"
            style={{ background: "var(--ms-cyan)" }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "#059fd8")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "var(--ms-cyan)")}
          >
            Configure endpoint
          </button>
        </>
      ) : status === "connecting" ? (
        <div className="space-y-1">
          <p className="text-sm font-semibold" style={{ color: "var(--ms-navy)" }}>Connecting…</p>
          <p className="text-xs" style={{ color: "var(--ms-gray-600)" }}>{endpoint}</p>
        </div>
      ) : status === "error" ? (
        <>
          <div className="space-y-1">
            <p className="text-sm font-semibold" style={{ color: "#C0392B" }}>Could not connect</p>
            <button onClick={onConfig} className="text-xs transition-colors" style={{ color: "var(--ms-gray-600)" }}
              onMouseEnter={(e) => (e.currentTarget.style.color = "var(--ms-cyan)")}
              onMouseLeave={(e) => (e.currentTarget.style.color = "var(--ms-gray-600)}")}
            >
              {endpoint}
            </button>
          </div>
          <button
            onClick={onConfig}
            className="rounded-[6px] px-4 py-2 text-sm font-medium transition-colors"
            style={{ border: "1.5px solid var(--ms-navy)", color: "var(--ms-navy)", background: "transparent" }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "var(--ms-navy-10)")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
          >
            Update endpoint
          </button>
        </>
      ) : (
        /* connected */
        <div className="space-y-1">
          <p className="text-base font-semibold" style={{ color: "var(--ms-navy)" }}>{model?.split("/").pop()}</p>
          <p className="text-xs" style={{ color: "var(--ms-gray-600)" }}>{endpoint}</p>
          <p className="text-xs pt-1" style={{ color: "var(--ms-gray-600)" }}>
            Start a conversation. No history is saved between sessions.
          </p>
        </div>
      )}
    </div>
  );
}

/* ─── Message bubble ─── */
function MessageBubble({ msg }: { msg: Message }) {
  const isUser = msg.role === "user";
  return (
    <div className={cn("flex gap-2.5", isUser && "flex-row-reverse")}>
      <div
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[6px]"
        style={isUser ? { background: "var(--ms-cyan)", color: "#fff" } : { background: "var(--ms-navy-10)", color: "var(--ms-navy)" }}
      >
        {isUser ? <User className="h-3.5 w-3.5" /> : <Bot className="h-3.5 w-3.5" />}
      </div>
      <div
        className={cn("max-w-[78%] rounded-[8px] px-3.5 py-2.5 text-sm leading-relaxed", isUser ? "rounded-tr-[3px]" : "rounded-tl-[3px]", !msg.content && "min-w-[2.5rem]")}
        style={
          isUser ? { background: "var(--ms-cyan)", color: "#fff" }
          : msg.error ? { background: "#fef2f2", color: "#b91c1c", border: "1px solid #fecaca" }
          : { background: "#fff", color: "var(--ms-black)", border: "1px solid var(--ms-gray-200)" }
        }
      >
        {msg.content
          ? <pre className="whitespace-pre-wrap font-sans">{msg.content}</pre>
          : <span className="inline-flex items-center gap-1" style={{ color: "var(--ms-gray-400)" }}>
              <span className="h-1.5 w-1.5 rounded-full bg-current animate-bounce [animation-delay:0ms]" />
              <span className="h-1.5 w-1.5 rounded-full bg-current animate-bounce [animation-delay:150ms]" />
              <span className="h-1.5 w-1.5 rounded-full bg-current animate-bounce [animation-delay:300ms]" />
            </span>
        }
      </div>
    </div>
  );
}

/* ─── Header icon button ─── */
function HeaderBtn({ onClick, title, children }: { onClick: () => void; title: string; children: React.ReactNode }) {
  return (
    <button onClick={onClick} title={title}
      className="flex h-8 w-8 items-center justify-center rounded-[6px] transition-colors"
      style={{ color: "rgba(255,255,255,0.5)" }}
      onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.08)"; e.currentTarget.style.color = "#fff"; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "rgba(255,255,255,0.5)"; }}
    >
      {children}
    </button>
  );
}

/* ─── Config modal ─── */
function ConfigModal({ draftEndpoint, setDraftEndpoint, onSave, onClose }: {
  draftEndpoint: string;
  setDraftEndpoint: (v: string) => void;
  onSave: () => void;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,45,0.55)" }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="w-full max-w-md rounded-[10px] shadow-2xl" style={{ border: "1px solid var(--ms-gray-200)", background: "#fff" }}>
        <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: "1px solid var(--ms-gray-200)" }}>
          <div>
            <h2 className="text-sm font-semibold" style={{ color: "var(--ms-navy)" }}>Endpoint Configuration</h2>
            <p className="mt-0.5 text-[11px]" style={{ color: "var(--ms-gray-600)" }}>
              vLLM-compatible OpenAI API · model detected automatically
            </p>
          </div>
          <button onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-[6px] transition-colors"
            style={{ color: "var(--ms-gray-400)" }}
            onMouseEnter={(e) => { e.currentTarget.style.background = "var(--ms-gray-100)"; e.currentTarget.style.color = "var(--ms-black)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "var(--ms-gray-400)"; }}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-6 py-5">
          <label className="flex flex-col gap-1.5">
            <span className="text-[11px] font-medium uppercase tracking-wider" style={{ color: "var(--ms-gray-600)" }}>
              vLLM Base URL
            </span>
            <input
              type="text"
              value={draftEndpoint}
              onChange={(e) => setDraftEndpoint(e.target.value)}
              placeholder="http://minerva.hpc.mssm.edu:8000"
              autoFocus
              className="rounded-[6px] px-3 py-2 text-sm focus:outline-none"
              style={{ border: "1.5px solid var(--ms-gray-200)", background: "var(--ms-gray-100)", color: "var(--ms-black)", transition: "border-color 0.15s" }}
              onFocus={(e) => (e.currentTarget.style.borderColor = "var(--ms-cyan)")}
              onBlur={(e) => (e.currentTarget.style.borderColor = "var(--ms-gray-200)")}
              onKeyDown={(e) => e.key === "Enter" && onSave()}
            />
          </label>
          <p className="mt-3 text-[11px]" style={{ color: "var(--ms-gray-600)" }}>
            The model will be read from{" "}
            <code className="rounded px-1 py-0.5 font-mono text-[10px]" style={{ background: "var(--ms-gray-100)", color: "var(--ms-navy)" }}>
              /v1/models
            </code>{" "}
            automatically.
          </p>
        </div>

        <div className="flex justify-end gap-2 px-6 py-4" style={{ borderTop: "1px solid var(--ms-gray-200)" }}>
          <button onClick={onClose}
            className="rounded-[6px] px-4 py-2 text-sm font-medium transition-colors"
            style={{ border: "1.5px solid var(--ms-navy)", color: "var(--ms-navy)", background: "transparent" }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "var(--ms-navy-10)")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
          >
            Cancel
          </button>
          <button onClick={onSave}
            className="rounded-[6px] px-4 py-2 text-sm font-medium text-white transition-colors"
            style={{ background: "var(--ms-cyan)" }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "#059fd8")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "var(--ms-cyan)")}
          >
            Connect
          </button>
        </div>
      </div>
    </div>
  );
}
