import { kbRequireMatch } from "./config";
import { retrieveKbContext } from "./knowledge-base";
import { generateAiReply, type ChatTurn } from "./providers";

const NO_MATCH =
  "I don't have that information in the knowledge base. You can ask to talk to a human.";

export async function generateGroundedReply(params: {
  siteId: string;
  message: string;
  history?: ChatTurn[];
}): Promise<{ reply: string; matched: boolean; articleCount: number }> {
  const { context, matched, articleCount } = await retrieveKbContext(
    params.siteId,
    params.message,
  );

  // Same guardrail idea as the WordPress plugin.
  if (kbRequireMatch() && articleCount > 0 && !matched) {
    return { reply: NO_MATCH, matched: false, articleCount };
  }

  if (articleCount === 0 && kbRequireMatch()) {
    return {
      reply:
        "This site has no knowledge base articles yet. Add content under /kb, or ask to talk to a human.",
      matched: false,
      articleCount: 0,
    };
  }

  const reply = await generateAiReply({
    message: params.message,
    context: matched ? context : "",
    history: params.history,
  });

  return { reply, matched, articleCount };
}
