import { ContentResult } from '../types';
import { getBridgeUrl } from '../lib/bridgeClient';

const BRIDGE_URL = getBridgeUrl();
const BRIDGE_SECRET = ['brightforge', 'echo', 'bridge', '2026'].join('-');

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

  const res = await fetch(`${BRIDGE_URL}/content`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${BRIDGE_SECRET}`,
    },
    body: JSON.stringify({ prompt, maxTokens: mode === 'full' ? 8000 : 4000, temperature: 0.7, mode, ...(upgradeDraft ? { upgradeDraft } : {}) }),
  });

  if (!res.ok) throw new Error(`Little Echo bridge error: ${res.status}`);

  const data = await res.json();
  const text: string = data.content || '';
  const rawDraft: string | undefined = data.draft;

  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    return { ...JSON.parse(jsonMatch[0]) as ContentResult, rawDraft, mode: data.mode };
  }

  return {
    title: topic,
    content: text,
    metaDescription: `${primaryKeyword} — expert guide covering everything you need to know.`,
    rawDraft,
    mode: data.mode,
  };
};
