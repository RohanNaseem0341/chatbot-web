"use client";

import {
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  buildVisitorWebSocketUrl,
  VisitorWebSocketClient,
} from "@/lib/visitor-ws";

type ChatMessage = {
  id: string;
  role: "user" | "assistant" | "human" | "system";
  content: string;
};

type SessionPayload = {
  session_id: string;
  conversation_id: string;
  site_id: string;
  visitor_token: string;
  chat_server_url: string;
};

type ChatMode = "ai" | "waiting" | "human";

function modeFromStatus(status: string): ChatMode | null {
  if (status === "human_active") return "human";
  if (status === "waiting_for_human") return "waiting";
  if (
    status === "ai_active" ||
    status === "handed_back_to_ai" ||
    status === "closed"
  ) {
    return "ai";
  }
  return null;
}

export function ChatWidget({ siteKey }: { siteKey: string }) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [session, setSession] = useState<SessionPayload | null>(null);
  const [mode, setMode] = useState<ChatMode>("ai");
  const [wsConnected, setWsConnected] = useState(false);
  const [showLeadForm, setShowLeadForm] = useState(false);
  const [leadName, setLeadName] = useState("");
  const [leadEmail, setLeadEmail] = useState("");
  const [leadPhone, setLeadPhone] = useState("");
  const [leadMessage, setLeadMessage] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "welcome",
      role: "assistant",
      content:
        "Hi — ask anything. Use “Talk to human” when you want a live agent from the admin app.",
    },
  ]);

  const wsRef = useRef<VisitorWebSocketClient | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const seenHumanIds = useRef<Set<string>>(new Set());
  const canChat = Boolean(siteKey);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, showLeadForm]);

  const ensureSession = useCallback(async () => {
    if (session) return session;
    const res = await fetch("/api/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        site_key: siteKey,
        page_url: typeof window !== "undefined" ? window.location.href : "",
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || "Could not start session");
    }
    const next: SessionPayload = {
      session_id: data.session_id,
      conversation_id: data.conversation_id,
      site_id: data.site_id,
      visitor_token: data.visitor_token,
      chat_server_url:
        data.chat_server_url ||
        process.env.NEXT_PUBLIC_CHAT_SERVER_URL ||
        "https://chat.techoven.click",
    };
    setSession(next);
    return next;
  }, [session, siteKey]);

  useEffect(() => {
    if (!open || !canChat || session) return;
    ensureSession().catch((err: Error) => setError(err.message));
  }, [open, canChat, session, ensureSession]);

  useEffect(() => {
    if (!session || !open) {
      wsRef.current?.disconnect();
      wsRef.current = null;
      setWsConnected(false);
      return;
    }

    const client = new VisitorWebSocketClient(
      () =>
        buildVisitorWebSocketUrl(session.chat_server_url, session.visitor_token),
      session.session_id,
      session.conversation_id,
      {
        onConnectionChange: setWsConnected,
        onError: (message) => setError(message),
        onStatus: (status) => {
          const next = modeFromStatus(status);
          if (next) setMode(next);
          if (status === "closed") {
            setShowLeadForm(false);
            setMessages((prev) => [
              ...prev,
              {
                id: `sys_${Date.now()}`,
                role: "system",
                content: "Chat ended by admin.",
              },
            ]);
          } else if (status === "handed_back_to_ai") {
            setMessages((prev) => [
              ...prev,
              {
                id: `sys_${Date.now()}`,
                role: "system",
                content: "You’re back with AI — ask anything.",
              },
            ]);
          }
        },
        onLeadForm: (status) => {
          if (status === "shown") {
            setShowLeadForm(true);
            setOpen(true);
          }
        },
        onHumanMessage: (msg) => {
          const key = String(msg.message_id || msg.content);
          if (seenHumanIds.current.has(key)) return;
          seenHumanIds.current.add(key);
          const role =
            msg.sender_type === "system"
              ? "system"
              : msg.sender_type === "ai" || msg.sender_type === "assistant"
                ? "assistant"
                : "human";
          if (role === "human") setMode("human");
          setMessages((prev) => [
            ...prev,
            {
              id: `h_${msg.message_id || Date.now()}`,
              role,
              content: msg.content,
            },
          ]);
        },
      },
    );
    wsRef.current = client;
    client.connect();

    return () => {
      client.disconnect();
      if (wsRef.current === client) wsRef.current = null;
    };
  }, [session, open]);

  const statusLine = useMemo(() => {
    if (!canChat) return "Set NEXT_PUBLIC_SITE_KEY in .env.local";
    if (error) return error;
    if (!session) return "Connecting…";
    const live = wsConnected ? "live" : "reconnecting";
    if (mode === "human") return `Human agent · ${live}`;
    if (mode === "waiting") return `Waiting for human · ${live}`;
    return `AI · ${live}`;
  }, [canChat, error, session, wsConnected, mode]);

  async function requestHuman() {
    if (!session || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/request-human", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          site_key: siteKey,
          session_id: session.session_id,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Could not request human");
      }
      setMode("waiting");
      setShowLeadForm(true);
      setMessages((prev) => [
        ...prev,
        {
          id: `sys_${Date.now()}`,
          role: "system",
          content: "Connecting you to a human agent… share your contact details.",
        },
      ]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed");
    } finally {
      setBusy(false);
    }
  }

  async function submitLead(event: FormEvent) {
    event.preventDefault();
    if (!session || busy) return;
    if (!leadName.trim() && !leadEmail.trim() && !leadPhone.trim()) {
      setError("Enter a name, email, or phone.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          site_key: siteKey,
          session_id: session.session_id,
          conversation_id: session.conversation_id,
          name: leadName.trim(),
          email: leadEmail.trim(),
          phone: leadPhone.trim(),
          message: leadMessage.trim(),
          page_url: typeof window !== "undefined" ? window.location.href : "",
          form_type: "human_connected",
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Could not submit form");
      }
      const thanksId = `sys_lead_${Date.now()}`;
      seenHumanIds.current.add(thanksId);
      seenHumanIds.current.add("Thanks — your details were sent to the team.");
      setShowLeadForm(false);
      setLeadName("");
      setLeadEmail("");
      setLeadPhone("");
      setLeadMessage("");
      setMessages((prev) => [
        ...prev,
        {
          id: thanksId,
          role: "system",
          content: "Thanks — your details were sent to the team.",
        },
      ]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Submit failed");
    } finally {
      setBusy(false);
    }
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const text = input.trim();
    if (!text || busy) return;

    setBusy(true);
    setError(null);
    setInput("");
    setMessages((prev) => [
      ...prev,
      { id: `u_${Date.now()}`, role: "user", content: text },
    ]);

    try {
      const active = await ensureSession();

      // Always mirror visitor text to FastAPI so the admin app sees it.
      try {
        wsRef.current?.sendVisitorMessage(text);
      } catch {
        // WS may still be connecting; AI path below still works.
      }

      if (mode === "human" || mode === "waiting") {
        // Live path only — admin replies arrive on the WebSocket.
        return;
      }

      const history = messages
        .filter((m) => m.role === "user" || m.role === "assistant")
        .slice(-12)
        .map((m) => ({
          role: m.role as "user" | "assistant",
          content: m.content,
        }));

      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
          session_id: active.session_id,
          conversation_id: active.conversation_id,
          site_id: active.site_id,
          history,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Chat failed");
      }
      const reply = data.reply || "(empty reply)";
      const replyId = data.message_id
        ? String(data.message_id)
        : `a_${Date.now()}`;
      // Prevent WS echo of the same AI reply from duplicating in the widget.
      seenHumanIds.current.add(replyId);
      seenHumanIds.current.add(reply);
      setMessages((prev) => [
        ...prev,
        {
          id: replyId,
          role: "assistant",
          content: reply,
        },
      ]);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Chat failed";
      setError(message);
      setMessages((prev) => [
        ...prev,
        { id: `e_${Date.now()}`, role: "system", content: message },
      ]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="chatoven-root">
      {open && (
        <section className="chatoven-panel" aria-label="ChatOven chat">
          <header className="chatoven-header">
            <div className="chatoven-header-copy">
              <strong>ChatOven</strong>
              <p>{statusLine}</p>
            </div>
            <button type="button" onClick={() => setOpen(false)} aria-label="Close">
              ×
            </button>
          </header>
          <div className="chatoven-messages">
            {messages.map((msg) => (
              <div key={msg.id} className={`bubble bubble-${msg.role}`}>
                {msg.role === "human" && (
                  <span className="bubble-label">Agent</span>
                )}
                {msg.role === "assistant" && (
                  <span className="bubble-label">AI</span>
                )}
                {msg.content}
              </div>
            ))}
            {showLeadForm && (
              <form className="chatoven-lead" onSubmit={submitLead}>
                <div className="chatoven-lead-head">
                  <strong>Share your details</strong>
                  <p>We’ll pass this to the agent joining the chat.</p>
                </div>
                <label className="chatoven-field">
                  <span>Name</span>
                  <input
                    placeholder="Your name"
                    value={leadName}
                    onChange={(e) => setLeadName(e.target.value)}
                    disabled={busy}
                    autoComplete="name"
                  />
                </label>
                <label className="chatoven-field">
                  <span>Email</span>
                  <input
                    placeholder="you@example.com"
                    type="email"
                    value={leadEmail}
                    onChange={(e) => setLeadEmail(e.target.value)}
                    disabled={busy}
                    autoComplete="email"
                  />
                </label>
                <label className="chatoven-field">
                  <span>Phone</span>
                  <input
                    placeholder="+1 …"
                    value={leadPhone}
                    onChange={(e) => setLeadPhone(e.target.value)}
                    disabled={busy}
                    autoComplete="tel"
                  />
                </label>
                <label className="chatoven-field">
                  <span>Message</span>
                  <textarea
                    placeholder="How can we help?"
                    value={leadMessage}
                    onChange={(e) => setLeadMessage(e.target.value)}
                    rows={2}
                    disabled={busy}
                  />
                </label>
                <div className="chatoven-lead-actions">
                  <button type="submit" disabled={busy}>
                    Send details
                  </button>
                  <button
                    type="button"
                    className="chatoven-lead-skip"
                    onClick={() => setShowLeadForm(false)}
                    disabled={busy}
                  >
                    Skip for now
                  </button>
                </div>
              </form>
            )}
            <div ref={messagesEndRef} />
          </div>
          <div className="chatoven-footer">
            {mode === "ai" && (
              <div className="chatoven-actions">
                <button
                  type="button"
                  className="chatoven-human-btn"
                  onClick={requestHuman}
                  disabled={!session || busy}
                >
                  Talk to human
                </button>
              </div>
            )}
            <form className="chatoven-form" onSubmit={onSubmit}>
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={
                  mode === "human" || mode === "waiting"
                    ? "Message the agent…"
                    : "Type a message…"
                }
                disabled={!canChat || busy}
              />
              <button type="submit" disabled={!canChat || busy || !input.trim()}>
                Send
              </button>
            </form>
          </div>
        </section>
      )}
      <button
        type="button"
        className="chatoven-launcher"
        onClick={() => setOpen((v) => !v)}
      >
        {open ? "Close" : "Chat"}
      </button>
    </div>
  );
}
