import { Suspense } from "react";
import { HomeClient } from "@/components/HomeClient";

export default function Home() {
  const siteKey = process.env.NEXT_PUBLIC_SITE_KEY || "";

  return (
    <Suspense fallback={<main style={{ padding: "2rem" }}>Loading…</main>}>
      <HomeClient defaultSiteKey={siteKey} />
    </Suspense>
  );
}
