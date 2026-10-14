import {
  getGeminiKey,
  getGeminiModel,
  getOpenAiKey,
  getOpenAiModel,
  getAiProvider,
} from "./config";

export type ChatTurn = { role: "user" | "assistant"; content: string };

const SYSTEM_RULES = `You are ChatOven, a helpful website support assistant.
Answer ONLY using the knowledge base context when it is provided.
If the context does not contain the answer, say you don't have that information in the knowledge base.
Be concise and friendly. Do not invent policies, prices, or facts.`;

export async function generateAiReply(params: {
  message: string;
  context: string;
  history?: ChatTurn[];
}): Promise<string> {
  const provider = getAiProvider();
  if (provider === "gemini") {
    return callGemini(params);
  }
  return callOpenAi(params);
}

function buildSystemPrompt(context: string): string {
  if (!context || context === "KB_NO_MATCH") {
    return SYSTEM_RULES;
  }
  return `${SYSTEM_RULES}\n\nKnowledge base context:\n${context}`;
}

async function callOpenAi(params: {
  message: string;
  context: string;
  history?: ChatTurn[];
}): Promise<string> {
  const key = getOpenAiKey();
  if (!key) {
    throw new Error("OPENAI_API_KEY is not set");
  }

  const messages: Array<{ role: string; content: string }> = [
    { role: "system", content: buildSystemPrompt(params.context) },
  ];
  for (const turn of params.history || []) {
    messages.push({ role: turn.role, content: turn.content });
  }
  messages.push({ role: "user", content: params.message });

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: getOpenAiModel(),
      messages,
      temperature: 0.3,
    }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(
      data?.error?.message || `OpenAI error (${res.status})`,
    );
  }
  const text = data?.choices?.[0]?.message?.content;
  if (!text || typeof text !== "string") {
    throw new Error("OpenAI returned an empty reply");
  }
  return text.trim();
}

async function callGemini(params: {
  message: string;
  context: string;
  history?: ChatTurn[];
}): Promise<string> {
  const key = getGeminiKey();
  if (!key) {
    throw new Error("GEMINI_API_KEY is not set");
  }

  const model = getGeminiModel();
  const contents: Array<{ role: string; parts: Array<{ text: string }> }> = [];
  for (const turn of params.history || []) {
    contents.push({
      role: turn.role === "assistant" ? "model" : "user",
      parts: [{ text: turn.content }],
    });
  }
  contents.push({ role: "user", parts: [{ text: params.message }] });

  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/` +
    `${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: buildSystemPrompt(params.context) }] },
      contents,
      generationConfig: { temperature: 0.3 },
    }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(
      data?.error?.message || `Gemini error (${res.status})`,
    );
  }
  const text = data?.candidates?.[0]?.content?.parts
    ?.map((p: { text?: string }) => p.text || "")
    .join("")
    .trim();
  if (!text) {
    throw new Error("Gemini returned an empty reply");
  }
  return text;
}
