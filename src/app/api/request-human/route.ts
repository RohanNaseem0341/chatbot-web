import { NextRequest, NextResponse } from "next/server";
import { getChatServerUrl, getSiteKey } from "@/lib/chat-server";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as {
      site_key?: string;
      session_id?: string;
    };
    const siteKey = (body.site_key || getSiteKey()).trim();
    const sessionId = (body.session_id || "").trim();
    if (!siteKey || !sessionId) {
      return NextResponse.json(
        { error: "site_key and session_id are required" },
        { status: 400 },
      );
    }

    const base = getChatServerUrl();
    const res = await fetch(`${base}/visitor/request-human`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ site_key: siteKey, session_id: sessionId }),
      cache: "no-store",
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return NextResponse.json(
        { error: data.detail || data.error || `request-human failed (${res.status})` },
        { status: res.status },
      );
    }
    return NextResponse.json(data);
  } catch (error) {
    const message = error instanceof Error ? error.message : "request-human failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
