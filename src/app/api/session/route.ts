import { NextRequest, NextResponse } from "next/server";
import {
  createVisitorSession,
  getChatServerUrl,
  getSiteKey,
} from "@/lib/chat-server";

/** Creates a FastAPI visitor session scoped by site_key. */
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as {
      site_key?: string;
      page_url?: string;
    };
    const siteKey = (body.site_key || getSiteKey()).trim();
    if (!siteKey) {
      return NextResponse.json(
        { error: "Missing site_key. Set NEXT_PUBLIC_SITE_KEY or pass site_key." },
        { status: 400 },
      );
    }

    const session = await createVisitorSession({
      siteKey,
      pageUrl: body.page_url || request.headers.get("referer") || "",
    });

    return NextResponse.json({
      ...session,
      // Browser connects to FastAPI WS directly (same host Flutter uses).
      chat_server_url: getChatServerUrl(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Session failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
