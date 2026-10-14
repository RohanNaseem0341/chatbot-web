import { NextRequest, NextResponse } from "next/server";
import { generateGroundedReply } from "@/lib/ai/generate-reply";
import type { ChatTurn } from "@/lib/ai/providers";
import { getSiteKey, postChatServerMessage } from "@/lib/chat-server";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as {
      message?: string;
      session_id?: string;
      conversation_id?: string;
      site_id?: string;
      history?: ChatTurn[];
    };

    const message = (body.message || "").trim();
    if (!message) {
      return NextResponse.json({ error: "message is required" }, { status: 400 });
    }

    const siteId = (body.site_id || "default").trim() || "default";
    const history = Array.isArray(body.history)
      ? body.history
          .filter(
            (t) =>
              t &&
              (t.role === "user" || t.role === "assistant") &&
              typeof t.content === "string",
          )
          .slice(-12)
      : [];

    const result = await generateGroundedReply({
      siteId,
      message,
      history,
    });

    let syncedMessageId: number | string | null = null;
    let syncError: string | null = null;
    const sessionId = (body.session_id || "").trim();
    if (sessionId && result.reply) {
      try {
        const synced = await postChatServerMessage({
          sessionId,
          conversationId: body.conversation_id,
          content: result.reply,
          senderType: "ai",
          siteKey: getSiteKey(),
        });
        if (synced.message_id != null) {
          syncedMessageId = synced.message_id;
        } else if (!synced.ok) {
          syncError = "AI reply was not saved to chat server";
        }
      } catch (err) {
        syncError = err instanceof Error ? err.message : "AI sync failed";
        console.error("[api/chat] AI sync failed:", syncError);
      }
    }

    return NextResponse.json({
      ok: true,
      reply: result.reply,
      matched: result.matched,
      article_count: result.articleCount,
      session_id: body.session_id ?? null,
      site_id: siteId,
      message_id: syncedMessageId,
      sync_ok: syncedMessageId != null,
      sync_error: syncError,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Chat failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
