export type VisitorWsHandlers = {
  onHumanMessage: (msg: {
    message_id?: string | number;
    content: string;
    sender_type?: string;
  }) => void;
  onStatus?: (status: string) => void;
  onLeadForm?: (status: string) => void;
  onConnectionChange?: (connected: boolean) => void;
  onError?: (message: string) => void;
};

function normalizeFrame(raw: unknown): { type: string; [key: string]: unknown } | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  if (obj.event && obj.data && typeof obj.data === "object") {
    return {
      type: String(obj.event),
      ...(obj.data as Record<string, unknown>),
    };
  }
  if (obj.type) {
    return obj as { type: string; [key: string]: unknown };
  }
  return null;
}

export function buildVisitorWebSocketUrl(
  chatServerHttpUrl: string,
  visitorToken: string,
): string {
  const base = chatServerHttpUrl.replace(/\/$/, "").replace(/^http/, "ws");
  return `${base}/ws/visitor?token=${encodeURIComponent(visitorToken)}`;
}

/**
 * Browser client for FastAPI /ws/visitor (same protocol as WordPress chatbot.js).
 */
export class VisitorWebSocketClient {
  private socket: WebSocket | null = null;
  private reconnectAttempts = 0;
  private closedByUser = false;
  private lastMessageId = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly getTokenUrl: () => string,
    private readonly sessionId: string,
    private readonly conversationId: string,
    private readonly handlers: VisitorWsHandlers,
  ) {}

  connect() {
    this.closedByUser = false;
    this.openSocket();
  }

  disconnect() {
    this.closedByUser = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.socket) {
      try {
        this.socket.close();
      } catch {
        /* ignore */
      }
      this.socket = null;
    }
    this.handlers.onConnectionChange?.(false);
  }

  get connected() {
    return this.socket?.readyState === WebSocket.OPEN;
  }

  sendVisitorMessage(content: string, clientMessageId?: string) {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      throw new Error("Live chat is not connected");
    }
    this.socket.send(
      JSON.stringify({
        type: "send_message",
        session_id: this.sessionId,
        conversation_id: this.conversationId,
        content,
        client_message_id: clientMessageId || `local_${Date.now()}`,
      }),
    );
  }

  private openSocket() {
    if (this.closedByUser || this.socket) return;

    let url: string;
    try {
      url = this.getTokenUrl();
    } catch (err) {
      this.handlers.onError?.(
        err instanceof Error ? err.message : "Missing WebSocket URL",
      );
      return;
    }

    try {
      this.socket = new WebSocket(url);
    } catch (err) {
      this.handlers.onError?.(
        err instanceof Error ? err.message : "WebSocket failed",
      );
      this.scheduleReconnect();
      return;
    }

    this.socket.onopen = () => {
      this.reconnectAttempts = 0;
      this.handlers.onConnectionChange?.(true);
      this.socket?.send(
        JSON.stringify({
          type: "resume",
          session_id: this.sessionId,
          after_message_id: this.lastMessageId || undefined,
        }),
      );
    };

    this.socket.onmessage = (event) => {
      try {
        const frame = normalizeFrame(JSON.parse(String(event.data)));
        if (!frame) return;
        this.handleFrame(frame);
      } catch {
        /* ignore bad frames */
      }
    };

    this.socket.onclose = (event) => {
      this.socket = null;
      this.handlers.onConnectionChange?.(false);
      if (this.closedByUser) return;
      if (event.code === 1008) {
        this.handlers.onError?.("Live chat token expired — refresh the page.");
      }
      this.scheduleReconnect();
    };

    this.socket.onerror = () => {
      try {
        this.socket?.close();
      } catch {
        /* ignore */
      }
    };
  }

  private scheduleReconnect() {
    if (this.closedByUser) return;
    this.reconnectAttempts += 1;
    const attempt = Math.min(this.reconnectAttempts, 10);
    const delay = Math.min(30000, 1200 * Math.pow(1.6, Math.max(0, attempt - 1)));
    this.reconnectTimer = setTimeout(() => this.openSocket(), delay);
  }

  private handleFrame(frame: { type: string; [key: string]: unknown }) {
    if (frame.type === "ping") {
      this.socket?.send(JSON.stringify({ type: "pong" }));
      return;
    }

    if (frame.type === "message.new" && frame.message && typeof frame.message === "object") {
      const msg = frame.message as Record<string, unknown>;
      const sender = String(msg.sender_type || "").toLowerCase();
      const content = String(msg.content || "");
      const messageId = msg.message_id;

      if (typeof messageId === "number" && messageId > 0) {
        this.lastMessageId = Math.max(this.lastMessageId, messageId);
      } else if (typeof messageId === "string") {
        const parsed = parseInt(messageId, 10);
        if (parsed > 0) this.lastMessageId = Math.max(this.lastMessageId, parsed);
      }

      this.ackMessage(messageId);

      if (sender === "system" || !content) return;
      if (sender === "visitor") return;

      if (sender === "human" || sender === "admin") {
        this.handlers.onHumanMessage({
          message_id: messageId as string | number | undefined,
          content,
          sender_type: "human",
        });
        return;
      }

      // AI echoes pushed over WS (optional)
      if (sender === "ai" || sender === "assistant") {
        this.handlers.onHumanMessage({
          message_id: messageId as string | number | undefined,
          content,
          sender_type: "ai",
        });
      }
      return;
    }

    if (frame.type === "session.status" && typeof frame.status === "string") {
      this.handlers.onStatus?.(frame.status);
    }

    if (frame.type === "lead_form.status") {
      const status = String(frame.lead_form_status || "shown");
      this.handlers.onLeadForm?.(status);
    }
  }

  private ackMessage(messageId: unknown) {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return;
    const id =
      typeof messageId === "number"
        ? messageId
        : parseInt(String(messageId || ""), 10);
    if (!id || id <= 0) return;
    try {
      this.socket.send(
        JSON.stringify({
          type: "message.received",
          session_id: this.sessionId,
          message_id: id,
        }),
      );
    } catch {
      /* pending delivery will retry */
    }
  }
}
