"use client";

import { useSearchParams } from "next/navigation";
import { ChatWidget } from "@/components/ChatWidget";
import styles from "@/app/page.module.css";

export function HomeClient({ defaultSiteKey }: { defaultSiteKey: string }) {
  const params = useSearchParams();
  const siteKey = (params.get("site_key") || defaultSiteKey).trim();
  const embed = params.get("embed") === "1";

  if (embed) {
    return (
      <main className={styles.embedMain}>
        <ChatWidget siteKey={siteKey} />
      </main>
    );
  }

  return (
    <main className={styles.main}>
      <div className={styles.hero}>
        <p className={styles.brand}>ChatOven</p>
        <h1>Next.js visitor chatbot</h1>
        <p className={styles.lead}>
          Widget uses a <code>site_key</code> only. Admin login stays in the
          Flutter app (website URL + username + password). Live human chat goes
          through FastAPI WebSockets — WordPress plugin APIs are not required
          for platform sites.
        </p>
        <ol className={styles.steps}>
          <li>
            Create site + admin via FastAPI{" "}
            <code>POST /internal/sites</code> (X-Internal-Secret).
          </li>
          <li>
            Put the returned <code>site_key</code> in{" "}
            <code>.env.local</code> as <code>NEXT_PUBLIC_SITE_KEY</code>.
          </li>
          <li>
            Client embeds this widget; Flutter login uses their site URL + the
            credentials you created.
          </li>
          <li>
            Open chat → <strong>Talk to human</strong> → reply from Flutter.
            Live delivery uses FastAPI <code>/ws/visitor</code>.
          </li>
          <li>
            Add KB articles at <code>/kb</code> (scoped by{" "}
            <code>site_id</code>). Set <code>OPENAI_API_KEY</code> or{" "}
            <code>GEMINI_API_KEY</code> in <code>.env.local</code>.
          </li>
          <li>
            <strong>Talk to human</strong> opens a lead form; Flutter Leads tab
            loads it from FastAPI <code>GET /leads</code>.
          </li>
        </ol>
      </div>
      <ChatWidget siteKey={siteKey} />
    </main>
  );
}
