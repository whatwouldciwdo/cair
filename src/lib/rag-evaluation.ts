import { chatOllama } from "@/lib/ollama";
import { retrieveEvaluationContext } from "@/lib/rag";

function tokens(value: string) { return new Set(value.toLowerCase().match(/[a-z0-9]{3,}/g) ?? []); }
export function lexicalGroundingScore(answer: string, context: string) {
  const answerTokens = tokens(answer); if (!answerTokens.size) return 0;
  const contextTokens = tokens(context); let matches = 0;
  for (const token of answerTokens) if (contextTokens.has(token)) matches += 1;
  return matches / answerTokens.size;
}

export async function evaluateRagCase(model: string, evaluationCase: { question: string; expectedAnswer: string | null; expectedSources: unknown }) {
  const started = Date.now();
  const retrieval = await retrieveEvaluationContext(evaluationCase.question);
  const answer = await chatOllama(model, [{ role: "system", content: `Jawab hanya dari konteks. Gunakan sitasi [1], [2], dst. Jika tidak tersedia, nyatakan tidak ditemukan.\n\n${retrieval.context}` }, { role: "user", content: evaluationCase.question }]);
  const cited = [...answer.matchAll(/\[(\d+)]/g)].map((match) => Number(match[1])).filter((number) => number >= 1 && number <= retrieval.sources.length);
  const uniqueCitations = new Set(cited);
  const citationScore = retrieval.sources.length ? Math.min(1, uniqueCitations.size / Math.min(3, retrieval.sources.length)) : 0;
  const groundingScore = lexicalGroundingScore(answer, retrieval.context);
  const expectedKeywords = evaluationCase.expectedAnswer ? [...tokens(evaluationCase.expectedAnswer)] : [];
  const answerTokens = tokens(answer);
  const keywordScore = expectedKeywords.length ? expectedKeywords.filter((keyword) => answerTokens.has(keyword)).length / expectedKeywords.length : null;
  const expectedSources = Array.isArray(evaluationCase.expectedSources) ? evaluationCase.expectedSources.map(String) : [];
  const sourceScore = expectedSources.length ? expectedSources.filter((expected) => retrieval.sources.some((source) => source.documentId === expected || source.documentName.toLowerCase().includes(expected.toLowerCase()))).length / expectedSources.length : null;
  return { answer, retrievalScore: retrieval.sources[0]?.score ?? 0, citationScore, grounded: groundingScore >= 0.45 && (retrieval.sources.length === 0 || uniqueCitations.size > 0), latencyMs: Date.now() - started, details: { groundingScore, keywordScore, sourceScore, retrievedSources: retrieval.sources.map((source) => ({ documentId: source.documentId, documentName: source.documentName, pageNumber: source.pageNumber, score: source.score })) } };
}