import { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { Bot, Send, X, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

type Msg = { role: "user" | "assistant"; content: string };

const STORAGE_KEY = "ts.assistant.history";
const GREETING: Msg = {
  role: "assistant",
  content:
    "Hi! I'm the TicketSafe assistant. Ask me anything about buying, selling, or how the platform works.",
};

function loadHistory(): Msg[] {
  if (typeof window === "undefined") return [GREETING];
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return [GREETING];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0) return parsed as Msg[];
  } catch {
    // fall through
  }
  return [GREETING];
}

const AssistantWidget = () => {
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [history, setHistory] = useState<Msg[]>(loadHistory);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Hide on admin pages and on messages flows to avoid widget clutter.
  const hidden =
    location.pathname.startsWith("/admin") ||
    location.pathname.startsWith("/messages") ||
    location.pathname.startsWith("/chat");

  useEffect(() => {
    if (typeof window !== "undefined") {
      window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(history));
    }
  }, [history]);

  useEffect(() => {
    if (open && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [history, open, pending]);

  if (hidden) return null;

  const send = async () => {
    const text = input.trim();
    if (!text || pending) return;
    const next: Msg[] = [...history, { role: "user", content: text }];
    setHistory(next);
    setInput("");
    setPending(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-assistant`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({ messages: next.slice(-12) }),
        }
      );
      const data = await res.json();
      if (!res.ok) {
        setHistory((h) => [
          ...h,
          {
            role: "assistant",
            content:
              data?.error === "AI assistant is not configured"
                ? "The assistant is not enabled yet. Please contact support via /contact."
                : "Sorry, I'm having trouble right now. Please try again in a moment.",
          },
        ]);
      } else {
        setHistory((h) => [...h, { role: "assistant", content: data.reply }]);
      }
    } catch {
      setHistory((h) => [
        ...h,
        { role: "assistant", content: "Network error — please retry." },
      ]);
    } finally {
      setPending(false);
    }
  };

  return (
    <>
      <button
        onClick={() => setOpen((v) => !v)}
        className="fixed bottom-6 left-6 z-[9999] w-14 h-14 rounded-full bg-foreground text-background shadow-lg hover:shadow-xl hover:scale-105 transition-all duration-200 flex items-center justify-center"
        aria-label="Open AI assistant"
        title="Need help? Ask the assistant"
      >
        {open ? <X className="w-6 h-6" /> : <Bot className="w-6 h-6" />}
      </button>

      {open && (
        <div className="fixed bottom-24 left-6 z-[9999] w-[22rem] max-h-[28rem] bg-background border border-border rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-bottom-4 fade-in duration-200">
          <div className="px-4 py-3 border-b border-border flex items-center gap-2 bg-muted/30">
            <Bot className="w-4 h-4 text-primary" />
            <h3 className="font-semibold text-sm">TicketSafe Assistant</h3>
          </div>

          <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-3 space-y-2">
            {history.map((m, i) => (
              <div
                key={i}
                className={
                  m.role === "user"
                    ? "ml-auto max-w-[85%] bg-primary text-primary-foreground rounded-2xl rounded-br-sm px-3 py-2 text-sm"
                    : "mr-auto max-w-[85%] bg-muted rounded-2xl rounded-bl-sm px-3 py-2 text-sm whitespace-pre-wrap"
                }
              >
                {m.content}
              </div>
            ))}
            {pending && (
              <div className="mr-auto bg-muted rounded-2xl rounded-bl-sm px-3 py-2 text-sm flex items-center gap-2 text-muted-foreground">
                <Loader2 className="w-3 h-3 animate-spin" />
                Thinking…
              </div>
            )}
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              send();
            }}
            className="border-t border-border p-2 flex items-center gap-2"
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask a question…"
              maxLength={2000}
              className="flex-1 bg-background border border-border rounded-full px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              disabled={pending}
            />
            <button
              type="submit"
              disabled={pending || !input.trim()}
              className="w-9 h-9 rounded-full bg-primary text-primary-foreground flex items-center justify-center disabled:opacity-50"
              aria-label="Send"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>
        </div>
      )}
    </>
  );
};

export default AssistantWidget;
