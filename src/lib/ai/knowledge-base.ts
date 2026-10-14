import { promises as fs } from "fs";
import path from "path";

export type KbArticle = {
  id: string;
  title: string;
  content: string;
  tags?: string[];
  updated_at: string;
};

type KbStore = {
  site_id: string;
  articles: KbArticle[];
};

function kbRoot(): string {
  return (
    process.env.KB_DATA_DIR?.trim() ||
    path.join(process.cwd(), "data", "kb")
  );
}

function siteDir(siteId: string): string {
  const safe = (siteId || "default").replace(/[^a-zA-Z0-9_-]/g, "_");
  return path.join(kbRoot(), safe);
}

function storePath(siteId: string): string {
  return path.join(siteDir(siteId), "articles.json");
}

async function ensureStore(siteId: string): Promise<KbStore> {
  const file = storePath(siteId);
  try {
    const raw = await fs.readFile(file, "utf8");
    const parsed = JSON.parse(raw) as KbStore;
    if (!parsed.articles) parsed.articles = [];
    return parsed;
  } catch {
    const empty: KbStore = { site_id: siteId || "default", articles: [] };
    await fs.mkdir(siteDir(siteId), { recursive: true });
    await fs.writeFile(file, JSON.stringify(empty, null, 2), "utf8");
    return empty;
  }
}

async function saveStore(store: KbStore): Promise<void> {
  await fs.mkdir(siteDir(store.site_id), { recursive: true });
  await fs.writeFile(
    storePath(store.site_id),
    JSON.stringify(store, null, 2),
    "utf8",
  );
}

export async function listArticles(siteId: string): Promise<KbArticle[]> {
  const store = await ensureStore(siteId);
  return store.articles;
}

export async function addArticle(
  siteId: string,
  input: { title: string; content: string; tags?: string[] },
): Promise<KbArticle> {
  const store = await ensureStore(siteId);
  const article: KbArticle = {
    id: `kb_${Date.now().toString(36)}`,
    title: input.title.trim(),
    content: input.content.trim(),
    tags: input.tags || [],
    updated_at: new Date().toISOString(),
  };
  store.articles.unshift(article);
  await saveStore(store);
  return article;
}

export async function deleteArticle(
  siteId: string,
  articleId: string,
): Promise<boolean> {
  const store = await ensureStore(siteId);
  const before = store.articles.length;
  store.articles = store.articles.filter((a) => a.id !== articleId);
  if (store.articles.length === before) return false;
  await saveStore(store);
  return true;
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 2);
}

async function articlesForSite(siteId: string): Promise<KbArticle[]> {
  const primary = await ensureStore(siteId);
  if (primary.articles.length > 0) {
    return primary.articles;
  }
  // Demo fallback: shared starter articles until the site has its own KB.
  if (siteId !== "default") {
    const fallback = await ensureStore("default");
    return fallback.articles;
  }
  return [];
}

/** Simple keyword retrieval (foundation for later embeddings/RAG). */
export async function retrieveKbContext(
  siteId: string,
  question: string,
  limit = 4,
): Promise<{ context: string; matched: boolean; articleCount: number }> {
  const articles = await articlesForSite(siteId);
  const articleCount = articles.length;
  if (articleCount === 0) {
    return { context: "", matched: false, articleCount: 0 };
  }

  const qTokens = new Set(tokenize(question));
  const scored = articles
    .map((article) => {
      const hay = tokenize(
        `${article.title} ${article.content} ${(article.tags || []).join(" ")}`,
      );
      let score = 0;
      for (const token of hay) {
        if (qTokens.has(token)) score += 1;
      }
      // Prefer title hits
      for (const token of tokenize(article.title)) {
        if (qTokens.has(token)) score += 2;
      }
      return { article, score };
    })
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  if (scored.length === 0) {
    return { context: "KB_NO_MATCH", matched: false, articleCount };
  }

  const context = scored
    .map(({ article }) => `### ${article.title}\n${article.content}`)
    .join("\n\n");

  return { context, matched: true, articleCount };
}
