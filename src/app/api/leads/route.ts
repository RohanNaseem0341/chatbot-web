import { NextRequest, NextResponse } from "next/server";
import { getChatServerUrl, getSiteKey } from "@/lib/chat-server";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as {
      site_key?: string;
      session_id?: string;
      conversation_id?: string;
      name?: string;
      email?: string;
      phone?: string;
      message?: string;
      page_url?: string;
      form_type?: string;
    };

    const siteKey = (body.site_key || getSiteKey()).trim();
    if (!siteKey) {
      return NextResponse.json({ error: "site_key required" }, { status: 400 });
    }

    const base = getChatServerUrl();
    const res = await fetch(`${base}/visitor/leads`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        site_key: siteKey,
        session_id: body.session_id,
        conversation_id: body.conversation_id,
        name: body.name || "",
        email: body.email || "",
        phone: body.phone || "",
        message: body.message || "",
        page_url: body.page_url || "",
        form_type: body.form_type || "human_connected",
      }),
      cache: "no-store",
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return NextResponse.json(
        {
          error:
            data.detail || data.error || `lead submit failed (${res.status})`,
        },
        { status: res.status },
      );
    }
    return NextResponse.json(data);
  } catch (error) {
    const message = error instanceof Error ? error.message : "lead submit failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
