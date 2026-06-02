"use client";

import { FormEvent, useMemo, useState } from "react";

type Message = {
  id: string;
  role: "user" | "bot";
  content: string;
  routedDepartment?: string;
};

const initialMessage: Message = {
  id: "welcome",
  role: "bot",
  content: "Hello! Welcome to CareConnect Health. How can I help you today?",
};

export default function HomePage() {
  const [messages, setMessages] = useState<Message[]>([initialMessage]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSend = useMemo(() => input.trim().length > 0 && !loading, [input, loading]);

  const sendMessage = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const text = input.trim();
    if (!text || loading) return;

    const userMessage: Message = {
      id: `${Date.now()}-user`,
      role: "user",
      content: text,
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setLoading(true);
    setError(null);

    try {
      const apiMessages = [
        ...messages
          .filter((m) => m.id !== "welcome")
          .map((m) => ({
            role: m.role === "user" ? ("user" as const) : ("assistant" as const),
            content: m.content,
          })),
        { role: "user" as const, content: text },
      ];

      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: apiMessages }),
      });

      const data = (await response.json()) as {
        answer?: string;
        routedDepartment?: string;
        error?: string;
      };
      if (!response.ok) {
        throw new Error(data.error || "Unable to process your request right now.");
      }

      const botMessage: Message = {
        id: `${Date.now()}-bot`,
        role: "bot",
        content: data.answer || "I'm sorry—I didn't quite understand that.",
        routedDepartment: data.routedDepartment,
      };
      setMessages((prev) => [...prev, botMessage]);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unexpected error";
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col p-4 sm:p-8">
      <section className="rounded-2xl border border-cyan-100 bg-white/90 shadow-xl shadow-cyan-100">
        <header className="border-b border-cyan-100 bg-gradient-to-r from-cyan-600 to-emerald-600 px-6 py-5 text-white">
          <h1 className="text-2xl font-semibold">CareConnect Bot</h1>
          <p className="mt-1 text-sm text-cyan-50">
            Healthcare assistant for FAQs and specialist triage guidance
          </p>
        </header>

        <div className="h-[58vh] overflow-y-auto bg-cyan-50/40 px-4 py-5 sm:px-6">
          <div className="space-y-4">
            {messages.map((msg) => (
              <article
                key={msg.id}
                className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-6 shadow-sm sm:text-base ${
                  msg.role === "bot"
                    ? "bg-white text-slate-700 border border-cyan-100"
                    : "ml-auto bg-cyan-600 text-white"
                }`}
              >
                {msg.routedDepartment && msg.routedDepartment !== "CLARIFICATION_REQUIRED" ? (
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-cyan-700">
                    Recommended: {msg.routedDepartment}
                  </p>
                ) : null}
                {msg.content}
              </article>
            ))}

            {loading ? (
              <article className="max-w-[85%] rounded-2xl border border-cyan-100 bg-white px-4 py-3 text-sm text-slate-500 shadow-sm sm:text-base">
                CareConnect Bot is typing...
              </article>
            ) : null}
          </div>
        </div>

        <form onSubmit={sendMessage} className="space-y-3 border-t border-cyan-100 bg-white p-4 sm:p-5">
          <label htmlFor="chat-input" className="text-sm font-medium text-slate-700">
            Describe your symptoms or ask a question
          </label>
          <div className="flex gap-2">
            <input
              id="chat-input"
              type="text"
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder="e.g., I have chest pain when climbing stairs"
              className="flex-1 rounded-xl border border-slate-300 px-4 py-3 text-sm text-slate-800 outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100 sm:text-base"
            />
            <button
              type="submit"
              disabled={!canSend}
              className="rounded-xl bg-cyan-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-cyan-700 disabled:cursor-not-allowed disabled:bg-slate-300 sm:text-base"
            >
              Send
            </button>
          </div>
          {error ? <p className="text-sm text-rose-600">{error}</p> : null}
        </form>
      </section>
    </main>
  );
}
