"use client";

import { useEffect, useRef, useState, useMemo } from "react";
import Sidebar from "@/components/layout/Sidebar";
import Header from "@/components/layout/Header";

/** Simple markdown-to-JSX renderer for chat messages */
function renderMarkdown(text: string) {
  const lines = text.split("\n");
  const elements: React.ReactNode[] = [];
  let listItems: string[] = [];
  let listKey = 0;

  function flushList() {
    if (listItems.length > 0) {
      elements.push(
        <ul key={`list-${listKey++}`} className="space-y-1 my-2 ml-4">
          {listItems.map((item, i) => (
            <li key={i} className="flex gap-2 text-sm">
              <span style={{ color: "var(--color-text-muted)" }}>•</span>
              <span>{inlineFormat(item)}</span>
            </li>
          ))}
        </ul>
      );
      listItems = [];
    }
  }

  function inlineFormat(str: string): React.ReactNode {
    // Process inline markdown: **bold**, [text](url), `code`
    const parts: React.ReactNode[] = [];
    let remaining = str;
    let key = 0;

    while (remaining.length > 0) {
      // Links: [text](url)
      const linkMatch = remaining.match(/\[([^\]]+)\]\(([^)]+)\)/);
      // Bold: **text**
      const boldMatch = remaining.match(/\*\*([^*]+)\*\*/);
      // Code: `text`
      const codeMatch = remaining.match(/`([^`]+)`/);

      // Find earliest match
      const matches = [
        linkMatch ? { type: "link", match: linkMatch, index: remaining.indexOf(linkMatch[0]) } : null,
        boldMatch ? { type: "bold", match: boldMatch, index: remaining.indexOf(boldMatch[0]) } : null,
        codeMatch ? { type: "code", match: codeMatch, index: remaining.indexOf(codeMatch[0]) } : null,
      ].filter(Boolean).sort((a, b) => a!.index - b!.index);

      if (matches.length === 0) {
        parts.push(remaining);
        break;
      }

      const first = matches[0]!;
      if (first.index > 0) {
        parts.push(remaining.slice(0, first.index));
      }

      if (first.type === "link") {
        parts.push(
          <a key={key++} href={first.match![2]} target="_blank" rel="noreferrer"
            className="font-medium underline" style={{ color: "#FF6A00" }}>
            {first.match![1]}
          </a>
        );
      } else if (first.type === "bold") {
        parts.push(<strong key={key++} className="font-semibold">{first.match![1]}</strong>);
      } else if (first.type === "code") {
        parts.push(
          <code key={key++} className="px-1.5 py-0.5 rounded text-xs font-mono"
            style={{ background: "var(--color-surface-3)" }}>
            {first.match![1]}
          </code>
        );
      }

      remaining = remaining.slice(first.index + first.match![0].length);
    }

    return parts.length === 1 ? parts[0] : <>{parts}</>;
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Horizontal rule
    if (/^---+$/.test(trimmed)) {
      flushList();
      elements.push(<hr key={`hr-${i}`} className="my-3" style={{ borderColor: "var(--color-border)" }} />);
      continue;
    }

    // List items (- or * or numbered)
    const listMatch = trimmed.match(/^[-*•]\s+(.+)/) || trimmed.match(/^\d+[.)]\s+(.+)/);
    if (listMatch) {
      listItems.push(listMatch[1]);
      continue;
    }

    flushList();

    // Empty line
    if (!trimmed) {
      continue;
    }

    // Regular paragraph
    elements.push(
      <p key={`p-${i}`} className="text-sm my-1" style={{ lineHeight: 1.6 }}>
        {inlineFormat(trimmed)}
      </p>
    );
  }

  flushList();
  return elements;
}

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
                    background: msg.role === "user" ? "linear-gradient(135deg, #FF6A00, #F59E0B)" : "var(--color-surface-1)",
                    color: msg.role === "user" ? "#fff" : "var(--color-text-primary)",
                    border: msg.role === "assistant" ? "1px solid var(--color-border)" : undefined,
                    boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
                  }}
                >
                  <div className="break-words">
                    {msg.role === "assistant" ? renderMarkdown(msg.content) : (
                      <p className="text-sm" style={{ lineHeight: 1.6 }}>{msg.content}</p>
                    )}
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
