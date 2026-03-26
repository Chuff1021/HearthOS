"use client";

import { useEffect, useRef, useState } from "react";
import Sidebar from "@/components/layout/Sidebar";
import Header from "@/components/layout/Header";

interface Message {
  role: "user" | "assistant";
  content: string;
}

export default function GabeChatPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, loading]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  async function sendMessage() {
    const text = input.trim();
    if (!text || loading) return;

    setInput("");
    setError(null);
    const userMessage: Message = { role: "user", content: text };
    setMessages((prev) => [...prev, userMessage]);
    setLoading(true);

    try {
      const res = await fetch("/api/gabe-test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [...messages, userMessage].map((m) => ({
            role: m.role,
            content: m.content,
          })),
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || data.message || data.details || `Error ${res.status}`);
        return;
      }

      const answer =
        data.answer ||
        data.message ||
        data.choices?.[0]?.message?.content ||
        "No response received.";

      setMessages((prev) => [...prev, { role: "assistant", content: answer }]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to connect to GABE");
    } finally {
      setLoading(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }

  function clearChat() {
    setMessages([]);
    setError(null);
    inputRef.current?.focus();
  }

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: "var(--color-bg)" }}>
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header />

        {/* Chat header */}
        <div className="px-6 py-3 flex items-center justify-between flex-shrink-0" style={{ borderBottom: "1px solid var(--color-border)" }}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center text-lg font-bold" style={{ background: "linear-gradient(135deg, #FF6A00, #F59E0B)", color: "#fff" }}>
              G
            </div>
            <div>
              <h1 className="font-bold text-lg" style={{ color: "var(--color-text-primary)" }}>GABE AI</h1>
              <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>
                Fireplace technical assistant — Powered by Nemotron Ultra 253B
              </p>
            </div>
          </div>
          <button
            onClick={clearChat}
            className="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
            style={{ border: "1px solid var(--color-border)", color: "var(--color-text-muted)" }}
          >
            Clear Chat
          </button>
        </div>

        {/* Messages */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto">
          <div className="max-w-3xl mx-auto px-6 py-6 space-y-4">
            {messages.length === 0 && !loading && (
              <div className="text-center py-16">
                <div className="w-16 h-16 rounded-2xl mx-auto mb-4 flex items-center justify-center text-3xl" style={{ background: "linear-gradient(135deg, #FF6A00, #F59E0B)" }}>
                  G
                </div>
                <h2 className="text-xl font-bold mb-2" style={{ color: "var(--color-text-primary)" }}>Ask GABE anything</h2>
                <p className="text-sm mb-6" style={{ color: "var(--color-text-muted)" }}>
                  Fireplace installation, service, troubleshooting, parts, venting — ask away.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-w-lg mx-auto">
                  {[
                    "What are the venting clearances for a Kozy Heat Bayport 41?",
                    "How do I test a thermopile on a gas fireplace?",
                    "What is the gas pressure spec for a Majestic Meridian?",
                    "How do I replace a blower motor on a Napoleon HD46?",
                  ].map((q) => (
                    <button
                      key={q}
                      onClick={() => { setInput(q); inputRef.current?.focus(); }}
                      className="text-left text-xs p-3 rounded-lg transition-colors"
                      style={{ background: "var(--color-surface-2)", border: "1px solid var(--color-border)", color: "var(--color-text-secondary)" }}
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((msg, i) => (
              <div key={i} className={`flex gap-3 ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                {msg.role === "assistant" && (
                  <div className="w-8 h-8 rounded-lg flex-shrink-0 flex items-center justify-center text-sm font-bold" style={{ background: "linear-gradient(135deg, #FF6A00, #F59E0B)", color: "#fff" }}>
                    G
                  </div>
                )}
                <div
                  className="max-w-[80%] rounded-2xl px-4 py-3"
                  style={{
                    background: msg.role === "user" ? "#2563EB" : "var(--color-surface-2)",
                    color: msg.role === "user" ? "#fff" : "var(--color-text-primary)",
                    border: msg.role === "assistant" ? "1px solid var(--color-border)" : undefined,
                  }}
                >
                  <div className="text-sm whitespace-pre-wrap break-words" style={{ lineHeight: 1.6 }}>
                    {msg.content}
                  </div>
                </div>
              </div>
            ))}

            {loading && (
              <div className="flex gap-3 justify-start">
                <div className="w-8 h-8 rounded-lg flex-shrink-0 flex items-center justify-center text-sm font-bold" style={{ background: "linear-gradient(135deg, #FF6A00, #F59E0B)", color: "#fff" }}>
                  G
                </div>
                <div className="rounded-2xl px-4 py-3" style={{ background: "var(--color-surface-2)", border: "1px solid var(--color-border)" }}>
                  <div className="flex items-center gap-2">
                    <div className="flex gap-1">
                      <span className="w-2 h-2 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: "0ms" }} />
                      <span className="w-2 h-2 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: "150ms" }} />
                      <span className="w-2 h-2 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: "300ms" }} />
                    </div>
                    <span className="text-xs" style={{ color: "var(--color-text-muted)" }}>Thinking...</span>
                  </div>
                </div>
              </div>
            )}

            {error && (
              <div className="rounded-lg px-4 py-3 text-sm" style={{ background: "rgba(255,32,78,0.1)", border: "1px solid rgba(255,32,78,0.3)", color: "#FF204E" }}>
                {error}
              </div>
            )}
          </div>
        </div>

        {/* Input bar */}
        <div className="flex-shrink-0 px-6 py-4" style={{ borderTop: "1px solid var(--color-border)", background: "var(--color-surface-1)" }}>
          <div className="max-w-3xl mx-auto flex gap-3">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask a fireplace question..."
              rows={1}
              className="flex-1 px-4 py-3 rounded-xl text-sm resize-none"
              style={{ background: "var(--color-surface-2)", border: "1px solid var(--color-border)", color: "var(--color-text-primary)" }}
            />
            <button
              onClick={sendMessage}
              disabled={!input.trim() || loading}
              className="px-5 py-3 rounded-xl text-sm font-semibold disabled:opacity-50 transition-colors"
              style={{ background: "linear-gradient(135deg, #FF6A00, #F59E0B)", color: "#fff" }}
            >
              {loading ? "..." : "Send"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
