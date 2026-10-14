"use client";

import { FormEvent, useEffect, useState } from "react";

type Article = {
  id: string;
  title: string;
  content: string;
  tags?: string[];
};

export default function KnowledgeBasePage() {
  const [siteId, setSiteId] = useState("default");
  const [secret, setSecret] = useState("");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [articles, setArticles] = useState<Article[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  async function load() {
    setError(null);
    const res = await fetch(`/api/kb?site_id=${encodeURIComponent(siteId)}`);
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "Failed to load");
      return;
    }
    setArticles(data.articles || []);
  }

  useEffect(() => {
    load().catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setInfo(null);
    const res = await fetch("/api/kb", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(secret ? { "x-kb-admin-secret": secret } : {}),
      },
      body: JSON.stringify({
        site_id: siteId,
        title,
        content,
        secret: secret || undefined,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "Save failed");
      return;
    }
    setTitle("");
    setContent("");
    setInfo("Article saved.");
    await load();
  }

  async function remove(id: string) {
    setError(null);
    const res = await fetch("/api/kb", {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
        ...(secret ? { "x-kb-admin-secret": secret } : {}),
      },
      body: JSON.stringify({
        site_id: siteId,
        article_id: id,
        secret: secret || undefined,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "Delete failed");
      return;
    }
    await load();
  }

  return (
    <main style={{ maxWidth: 720, margin: "0 auto", padding: "2rem 1rem" }}>
      <h1>Knowledge base</h1>
      <p style={{ color: "#5b6b7c", marginBottom: "1.5rem" }}>
        Articles are scoped by <code>site_id</code> (use the FastAPI platform
        site id). Chat answers from matching articles.
      </p>

      <div style={{ display: "grid", gap: "0.75rem", marginBottom: "1.5rem" }}>
        <label>
          Site ID
          <input
            value={siteId}
            onChange={(e) => setSiteId(e.target.value)}
            style={{ display: "block", width: "100%", marginTop: 4 }}
          />
        </label>
        <label>
          Admin secret (KB_ADMIN_SECRET)
          <input
            type="password"
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
            style={{ display: "block", width: "100%", marginTop: 4 }}
          />
        </label>
        <button type="button" onClick={() => load()}>
          Reload
        </button>
      </div>

      <form onSubmit={onSubmit} style={{ display: "grid", gap: "0.75rem" }}>
        <input
          placeholder="Title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
        />
        <textarea
          placeholder="Article content"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={6}
          required
        />
        <button type="submit">Add article</button>
      </form>

      {error && <p style={{ color: "#a33", marginTop: "1rem" }}>{error}</p>}
      {info && <p style={{ color: "#2a6", marginTop: "1rem" }}>{info}</p>}

      <ul style={{ marginTop: "2rem", display: "grid", gap: "1rem" }}>
        {articles.map((article) => (
          <li
            key={article.id}
            style={{
              listStyle: "none",
              border: "1px solid #ddd",
              borderRadius: 12,
              padding: "1rem",
            }}
          >
            <strong>{article.title}</strong>
            <p style={{ whiteSpace: "pre-wrap", margin: "0.5rem 0" }}>
              {article.content}
            </p>
            <button type="button" onClick={() => remove(article.id)}>
              Delete
            </button>
          </li>
        ))}
      </ul>
    </main>
  );
}
