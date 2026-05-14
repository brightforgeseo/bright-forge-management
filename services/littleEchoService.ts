import { ContentResult } from '../types';

// Portal bridge URL — set VITE_BRIDGE_URL in env for production (Tailscale Funnel URL)
const BRIDGE_URL = (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_BRIDGE_URL) || 'http://localhost:18790';
const BRIDGE_SECRET = (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_ECHO_BRIDGE_SECRET) || 'brightforge-echo-bridge-2026';

/**
 * Generate SEO content using Little Echo (trained Gemma 2 9B running locally via LM Studio).
 * Zero API cost. Falls back to Claude if Little Echo is unavailable.
 */
export const generateLittleEchoContent = async (
  topic: string,
  tone: string,
  keywords: string,
  clientName?: string
): Promise<ContentResult> => {
  const primaryKeyword = keywords.split(',')[0]?.trim() || keywords;

  const prompt = `Write a comprehensive SEO article about "${topic}".

Tone: ${tone}
Primary keyword: ${primaryKeyword}
Secondary keywords: ${keywords}
${clientName ? `Client: ${clientName}` : ''}

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
    body: JSON.stringify({ prompt, maxTokens: 4000, temperature: 0.7 }),
  });

  if (!res.ok) throw new Error(`Little Echo bridge error: ${res.status}`);

  const data = await res.json();
  const text: string = data.content || '';

  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    return JSON.parse(jsonMatch[0]) as ContentResult;
  }

  // If model didn't return JSON, wrap the raw output
  return {
    title: topic,
    content: text,
    metaDescription: `${primaryKeyword} — expert guide covering everything you need to know.`,
  };
};
