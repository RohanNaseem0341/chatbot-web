export type AiProvider = "openai" | "gemini";

export function getAiProvider(): AiProvider {
  const raw = (process.env.AI_PROVIDER || "openai").toLowerCase().trim();
  return raw === "gemini" ? "gemini" : "openai";
}

export function getOpenAiKey(): string {
  return process.env.OPENAI_API_KEY?.trim() || "";
}

export function getGeminiKey(): string {
  return (
    process.env.GEMINI_API_KEY?.trim() ||
    process.env.GOOGLE_API_KEY?.trim() ||
    ""
  );
}

export function getOpenAiModel(): string {
  return process.env.OPENAI_MODEL?.trim() || "gpt-4o-mini";
}

export function getGeminiModel(): string {
  return process.env.GEMINI_MODEL?.trim() || "gemini-2.0-flash";
}

export function kbRequireMatch(): boolean {
  const raw = (process.env.KB_REQUIRE_MATCH || "true").toLowerCase();
  return raw !== "false" && raw !== "0";
}

export function getKbAdminSecret(): string {
  return process.env.KB_ADMIN_SECRET?.trim() || "";
}
