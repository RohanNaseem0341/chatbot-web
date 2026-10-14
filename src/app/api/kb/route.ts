import { NextRequest, NextResponse } from "next/server";
import { getKbAdminSecret } from "@/lib/ai/config";
import {
  addArticle,
  deleteArticle,
  listArticles,
} from "@/lib/ai/knowledge-base";
import { getSiteKey } from "@/lib/chat-server";

function authorized(request: NextRequest, bodySecret?: string): boolean {
  const expected = getKbAdminSecret();
  if (!expected) {
    // Dev convenience: allow when secret unset (local only).
    return process.env.NODE_ENV !== "production";
  }
  const header = request.headers.get("x-kb-admin-secret") || "";
  return header === expected || bodySecret === expected;
}

export async function GET(request: NextRequest) {
  const siteId =
    request.nextUrl.searchParams.get("site_id")?.trim() || "default";
  const articles = await listArticles(siteId);
  return NextResponse.json({ ok: true, site_id: siteId, articles });
}

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as {
    site_id?: string;
    title?: string;
    content?: string;
    tags?: string[];
    secret?: string;
    site_key?: string;
  };

  if (!authorized(request, body.secret)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Optional: ensure caller site_key matches env tenant for this deployment.
  const envKey = getSiteKey();
  if (envKey && body.site_key && body.site_key !== envKey) {
    return NextResponse.json({ error: "site_key mismatch" }, { status: 403 });
  }

  const title = (body.title || "").trim();
  const content = (body.content || "").trim();
  if (!title || !content) {
    return NextResponse.json(
      { error: "title and content are required" },
      { status: 400 },
    );
  }

  const siteId = (body.site_id || "default").trim() || "default";
  const article = await addArticle(siteId, {
    title,
    content,
    tags: body.tags,
  });
  return NextResponse.json({ ok: true, article });
}

export async function DELETE(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as {
    site_id?: string;
    article_id?: string;
    secret?: string;
  };
  if (!authorized(request, body.secret)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const siteId = (body.site_id || "default").trim() || "default";
  const articleId = (body.article_id || "").trim();
  if (!articleId) {
    return NextResponse.json({ error: "article_id required" }, { status: 400 });
  }
  const ok = await deleteArticle(siteId, articleId);
  return NextResponse.json({ ok });
}
