const DEFAULT_CHAT_SERVER = "https://chat.techoven.click";

export function getChatServerUrl(): string {
  return (
    process.env.CHAT_SERVER_URL?.replace(/\/$/, "") ||
    process.env.NEXT_PUBLIC_CHAT_SERVER_URL?.replace(/\/$/, "") ||
    DEFAULT_CHAT_SERVER
  );
}

export function getSiteKey(): string {
  return (
    process.env.NEXT_PUBLIC_SITE_KEY?.trim() ||
    process.env.SITE_KEY?.trim() ||
    ""
  );
}

export type VisitorSessionResponse = {
  ok: boolean;
  session_id: string;
  conversation_id: string;
  site_id: string;
  site_url: string;
  visitor_token: string;
  websocket_path: string;
};

export async function bootstrapSite(siteKey: string) {
  const base = getChatServerUrl();
  const res = await fetch(`${base}/visitor/bootstrap`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ site_key: siteKey }),
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`bootstrap failed (${res.status})`);
  }
  return res.json();
}

export async function createVisitorSession(params: {
  siteKey: string;
  pageUrl?: string;
}): Promise<VisitorSessionResponse> {
  const base = getChatServerUrl();
  const res = await fetch(`${base}/visitor/sessions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      site_key: params.siteKey,
      page_url: params.pageUrl || "",
      visitor_browser: "Next.js",
      visitor_device: "web",
    }),
    cache: "no-store",
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`session create failed (${res.status}): ${text}`);
  }
  return res.json();
}

export function visitorWebSocketUrl(visitorToken: string): string {
  const httpBase = getChatServerUrl();
  const wsBase = httpBase.replace(/^http/, "ws");
  return `${wsBase}/ws/visitor?token=${encodeURIComponent(visitorToken)}`;
}
