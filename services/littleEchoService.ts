import { ContentResult } from '../types';
import { runEchoJob } from '../lib/echoQueueClient';

/**
 * Generate SEO content using the portal bridge pipeline.
 * mode='edit'  (default) — Echo draft → Gemma 4B edit. Fast (~30s).
 * mode='full'            — Echo outline → Sassin full article. Quality (~90s).
 * Zero API cost. If the bridge is unavailable, fail loudly instead of using paid browser-side fallback.
 */
export const generateLittleEchoContent = async (
  topic: string,
  tone: string,
  keywords: string,
  clientName?: string,
  mode: 'edit' | 'full' = 'edit',
  upgradeDraft?: string,
  brief?: string
): Promise<ContentResult> => {
  const primaryKeyword = keywords.split(',')[0]?.trim() || keywords;

  const prompt = `Write a comprehensive SEO article about "${topic}".

Tone: ${tone}
Primary keyword: ${primaryKeyword}
Secondary keywords: ${keywords}
${clientName ? `Client: ${clientName}` : ''}
${brief ? `\nContent brief / additional instructions:\n${brief}` : ''}

Return ONLY valid JSON in this exact format:
{
  "title": "SEO title under 60 chars with primary keyword",
  "content": "Full markdown article with H1, H2s, intro, body, FAQ, conclusion",
  "metaDescription": "Meta description 150-160 chars with primary keyword and CTA"
}`;

  const content = await runEchoJob({
    kind: 'content',
    message: `${prompt}\n\nMode: ${mode}.${upgradeDraft ? `\nUpgrade this supplied draft:\n${upgradeDraft.slice(0, 7000)}` : ''}`,
  });
  const text = content || '';
  const rawDraft = upgradeDraft;

  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    return { ...JSON.parse(jsonMatch[0]) as ContentResult, rawDraft, mode };
  }

  return {
    title: topic,
    content: text,
    metaDescription: `${primaryKeyword} — expert guide covering everything you need to know.`,
    rawDraft,
    mode,
  };
};
