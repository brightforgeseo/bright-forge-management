import { GoogleGenAI, Type } from "@google/genai";
import { KeywordResult, KeywordResearchOptions, AuditOptions, AuditResult, AuditIssue, ContentResult, Task, QACorrection } from "../types";
import { generateLittleEchoContent } from "./littleEchoService";
import { getBridgeUrl } from "../lib/bridgeClient";

const getAiClient = () => {
  let apiKey;
  try {
    apiKey = process.env.API_KEY;
  } catch (e) {
  }
  
  if (!apiKey) {
    console.warn("API Key not found in environment variables");
  }
  return new GoogleGenAI({ apiKey: apiKey || 'dummy_key_to_prevent_init_crash' });
};

const ECHO_BRIDGE_URL = getBridgeUrl();
const ECHO_BRIDGE_SECRET = String.fromCharCode(98,114,105,103,104,116,102,111,114,103,101,45,101,99,104,111,45,98,114,105,100,103,101,45,50,48,50,54);

function normaliseKeywordResults(raw: unknown): KeywordResult[] {
  if (!Array.isArray(raw)) return [];

  const cleanList = (value: any): string[] => {
    if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter(Boolean).slice(0, 5);
    if (typeof value === 'string') return value.split(',').map((item) => item.trim()).filter(Boolean).slice(0, 5);
    return [];
  };

  const cleanText = (value: any, fallback = '') => String(value || fallback).trim();
  const cleanDifficulty = (value: any) => {
    const raw = String(value || '').toLowerCase();
    if (raw.includes('high')) return 'High';
    if (raw.includes('low')) return 'Low';
    return 'Medium';
  };

  return raw
    .map((item: any) => {
      const competition = Math.max(0, Math.min(100, Number(item?.competition ?? item?.competitionScore ?? item?.paidCompetition ?? 50)));
      const volume = Number(item?.searchVolume ?? item?.volume ?? item?.monthlySearchVolume ?? 0);
      const difficulty = cleanDifficulty(item?.difficulty ?? item?.keywordDifficulty);
      const opportunityScore = Math.max(0, Math.min(100, Number(item?.opportunityScore ?? item?.opportunity ?? Math.round((volume > 0 ? Math.min(40, Math.log10(volume + 1) * 10) : 10) + (difficulty === 'Low' ? 30 : difficulty === 'Medium' ? 18 : 8) + ((100 - competition) * 0.3)))));

      return {
        keyword: cleanText(item?.keyword || item?.query),
        searchVolume: Number.isFinite(volume) ? volume : 0,
        difficulty,
        competition,
        trend: Array.isArray(item?.trend)
          ? item.trend.slice(0, 6).map((n: any) => Math.max(0, Math.min(100, Number(n) || 0)))
          : [50, 52, 54, 55, 57, 60],
        intent: cleanText(item?.intent, 'Informational'),
        cpc: Number.isFinite(Number(item?.cpc)) ? Number(item?.cpc) : undefined,
        opportunityScore,
        serpFeatures: cleanList(item?.serpFeatures),
        cluster: cleanText(item?.cluster, 'General Opportunities'),
        recommendedUse: cleanText(item?.recommendedUse || item?.useCase, 'Supporting Article'),
        priority: cleanText(item?.priority, opportunityScore >= 70 ? 'Quick Win' : opportunityScore >= 45 ? 'Build Page' : 'Monitor'),
        reason: cleanText(item?.reason, 'Relevant opportunity for the seed topic.'),
        contentAngle: cleanText(item?.contentAngle),
      };
    })
    .filter((item) => item.keyword && Number.isFinite(item.searchVolume))
    .slice(0, 50);
}

export const generateKeywords = async (seedKeyword: string, options: KeywordResearchOptions = {}): Promise<KeywordResult[]> => {
  // Primary path: ChatGPT via Hermes bridge, with SE Ranking MCP tools available server-side.
  // Keeps the old keyword-result shape while allowing richer SEO fields for the upgraded UI.
  try {
    const res = await fetch(`${ECHO_BRIDGE_URL}/keywords`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${ECHO_BRIDGE_SECRET}`,
      },
      body: JSON.stringify({ seedKeyword, ...options }),
      signal: AbortSignal.timeout(180_000),
    });

    if (!res.ok) throw new Error(`Keyword bridge error ${res.status}: ${await res.text()}`);

    const data = await res.json();
    const results = normaliseKeywordResults(data.keywords || data);
    if (results.length > 0) return results;
    throw new Error('Keyword bridge returned no usable keywords');
  } catch (bridgeError) {
    console.warn("ChatGPT keyword research failed, falling back to Gemini:", bridgeError);
  }

  const ai = getAiClient();
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: `Generate 10 related SEO keyword opportunities for "${seedKeyword}".
      For each keyword, estimate a monthly search volume (100-50000), a difficulty level (Low, Medium, High),
      a competition score (0-100), CPC, intent, opportunity score, SERP features, topic cluster, recommended use,
      priority, a short senior SEO reason, content angle, and a 6-month search trend array.
      Return ONLY a valid JSON array using this shape: [{"keyword":"keyword phrase","searchVolume":1000,"difficulty":"Low","competition":40,"trend":[45,50,55,60,65,70],"intent":"Commercial","cpc":3.5,"opportunityScore":78,"serpFeatures":["AI Overview","PAA"],"cluster":"Service modifiers","recommendedUse":"Service Page","priority":"Quick Win","reason":"Good commercial relevance with manageable competition.","contentAngle":"Build a comparison-led service page."}]`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              keyword: { type: Type.STRING },
              searchVolume: { type: Type.NUMBER },
              difficulty: { type: Type.STRING },
              competition: { type: Type.NUMBER },
              trend: {
                type: Type.ARRAY,
                items: { type: Type.NUMBER }
              },
              intent: { type: Type.STRING },
              cpc: { type: Type.NUMBER },
              opportunityScore: { type: Type.NUMBER },
              serpFeatures: {
                type: Type.ARRAY,
                items: { type: Type.STRING }
              },
              cluster: { type: Type.STRING },
              recommendedUse: { type: Type.STRING },
              priority: { type: Type.STRING },
              reason: { type: Type.STRING },
              contentAngle: { type: Type.STRING }
            },
            required: ["keyword", "searchVolume", "difficulty", "competition", "trend"]
          }
        }
      }
    });

    if (response.text) {
      return normaliseKeywordResults(JSON.parse(response.text));
    }
    return [];
  } catch (error) {
    console.error("Keyword generation failed:", error);
    throw error;
  }
};

export const generateContent = async (topic: string, tone: string, keywords: string, mode: 'edit' | 'full' = 'edit', upgradeDraft?: string, brief?: string): Promise<ContentResult & { rawDraft?: string; mode?: string }> => {
  try {
    return await generateLittleEchoContent(topic, tone, keywords, undefined, mode, upgradeDraft, brief);
  } catch (echoError) {
    console.warn("Little Echo unavailable, falling back to Gemini:", echoError);
  }

  const ai = getAiClient();
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: `Write a high-quality, SEO-optimized blog post about "${topic}".
      Tone: ${tone}.
      Target Keywords to include: ${keywords}.
      Structure the content with Markdown headings (##, ###).
      Also provide a catchy Title and a Meta Description.`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING },
            content: { type: Type.STRING, description: "The full blog post body in Markdown format" },
            metaDescription: { type: Type.STRING }
          },
          required: ["title", "content", "metaDescription"]
        }
      }
    });

    if (response.text) {
      return JSON.parse(response.text) as ContentResult;
    }
    throw new Error("No content generated");
  } catch (error) {
    console.error("Content generation failed:", error);
    throw error;
  }
};

function normaliseAuditResult(raw: any, options: AuditOptions = {}): AuditResult {
  const cleanSeverity = (value: any): 'high' | 'medium' | 'low' => {
    const severity = String(value || '').toLowerCase();
    if (severity.includes('high') || severity.includes('critical')) return 'high';
    if (severity.includes('low') || severity.includes('notice')) return 'low';
    return 'medium';
  };

  const cleanList = (value: any): string[] => {
    if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter(Boolean).slice(0, 8);
    if (typeof value === 'string') return value.split(/\n|;/).map((item) => item.replace(/^[-*]\s*/, '').trim()).filter(Boolean).slice(0, 8);
    return [];
  };

  const issues: AuditIssue[] = (Array.isArray(raw?.issues) ? raw.issues : [])
    .map((issue: any, index: number) => ({
      severity: cleanSeverity(issue?.severity),
      category: String(issue?.category || issue?.area || 'On-page').trim(),
      message: String(issue?.message || issue?.issue || '').trim(),
      recommendation: String(issue?.recommendation || issue?.fix || '').trim(),
      impact: String(issue?.impact || '').trim(),
      effort: String(issue?.effort || 'Medium').trim(),
      priority: Number.isFinite(Number(issue?.priority)) ? Number(issue.priority) : index + 1,
      evidence: String(issue?.evidence || '').trim(),
    }))
    .filter((issue) => issue.message && issue.recommendation)
    .slice(0, 12);

  const score = Math.max(0, Math.min(100, Number(raw?.score ?? raw?.seoScore ?? 50)));

  return {
    score,
    summary: String(raw?.summary || raw?.executiveSummary || 'Audit completed. Review the prioritised recommendations below.').trim(),
    issues,
    strengths: cleanList(raw?.strengths),
    quickWins: cleanList(raw?.quickWins || raw?.quick_wins),
    nextActions: cleanList(raw?.nextActions || raw?.next_actions || raw?.actionPlan),
    metadata: {
      mode: raw?.metadata?.mode || options.mode || 'content',
      url: raw?.metadata?.url || options.url,
      primaryKeyword: raw?.metadata?.primaryKeyword || options.primaryKeyword,
      source: raw?.metadata?.source || options.source,
      routedTo: raw?.routed_to || raw?.metadata?.routedTo,
    },
  };
}

export const analyzeText = async (text: string, options: AuditOptions = {}): Promise<AuditResult> => {
  const payload = {
    input: text,
    text,
    mode: options.mode || (options.url ? 'url' : 'content'),
    ...options,
  };

  try {
    const res = await fetch(`${ECHO_BRIDGE_URL}/audit`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${ECHO_BRIDGE_SECRET}`,
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(180_000),
    });

    if (!res.ok) throw new Error(`Audit bridge error ${res.status}: ${await res.text()}`);
    const data = await res.json();
    return normaliseAuditResult(data.audit || data, options);
  } catch (bridgeError) {
    console.warn("Hermes audit bridge failed, falling back to Gemini:", bridgeError);
  }

  const ai = getAiClient();
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: `You are a senior Bright Forge SEO auditor. Run a practical SEO audit.
      Audit mode: ${payload.mode}
      URL, if supplied: ${options.url || 'not supplied'}
      Primary keyword, if supplied: ${options.primaryKeyword || 'not supplied'}
      Regional source: ${options.source || 'us'}
      Competitor, if supplied: ${options.competitor || 'not supplied'}

      Input:
      "${text.substring(0, 8000)}"

      Score the page/content from 0-100. Prioritise indexability, crawlability, on-page basics, content intent match, E-E-A-T, schema, performance risks, and conversion issues. Be specific, not generic.
      Return JSON only.`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            score: { type: Type.NUMBER },
            summary: { type: Type.STRING },
            strengths: { type: Type.ARRAY, items: { type: Type.STRING } },
            quickWins: { type: Type.ARRAY, items: { type: Type.STRING } },
            nextActions: { type: Type.ARRAY, items: { type: Type.STRING } },
            issues: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  severity: { type: Type.STRING, enum: ["high", "medium", "low"] },
                  category: { type: Type.STRING },
                  message: { type: Type.STRING },
                  recommendation: { type: Type.STRING },
                  impact: { type: Type.STRING },
                  effort: { type: Type.STRING },
                  priority: { type: Type.NUMBER },
                  evidence: { type: Type.STRING }
                },
                required: ["severity", "category", "message", "recommendation"]
              }
            }
          },
          required: ["score", "summary", "issues"]
        }
      }
    });

    if (response.text) return normaliseAuditResult(JSON.parse(response.text), options);
    throw new Error("Analysis failed");
  } catch (error) {
    console.error("Audit failed:", error);
    throw error;
  }
};

export const generateProjectTasks = async (goal: string): Promise<Task[]> => {
  const ai = getAiClient();
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: `You are a project manager. Create a comprehensive task list for a new client group with the goal: "${goal}".
      Generate 4-8 specific, actionable tasks.
      For each task, assign a status from the current workflow ('To Do', 'Working on it', 'Review', 'Needs Evidence', 'Send to client', 'Done'),
      a priority (High, Medium, Low), and a realistic due date (YYYY-MM-DD format within next 60 days).`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              id: { type: Type.STRING },
              title: { type: Type.STRING },
              status: { type: Type.STRING, enum: ['To Do', 'Working on it', 'Review', 'Needs Evidence', 'Send to client', 'Done'] },
              priority: { type: Type.STRING, enum: ['High', 'Medium', 'Low'] },
              dueDate: { type: Type.STRING }
            },
            required: ["id", "title", "status", "priority", "dueDate"]
          }
        }
      }
    });

    if (response.text) {
      return JSON.parse(response.text) as Task[];
    }
    return [];
  } catch (error) {
    console.error("Task generation failed:", error);
    throw error;
  }
};

async function callEchoBridge(
  history: string,
  message: string,
  executingUser: { id: string; name: string },
  model: string = 'auto'
): Promise<string> {
  const res = await fetch(`${ECHO_BRIDGE_URL}/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${ECHO_BRIDGE_SECRET}`,
    },
    body: JSON.stringify({
      history,
      message,
      userId: executingUser.id,
      userName: executingUser.name,
      model
    }),
    signal: AbortSignal.timeout(120_000),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Bridge error ${res.status}: ${err}`);
  }
  const data = await res.json();
  return data.response || '';
}

export const getChatResponse = async (
  history: string,
  message: string,
  executingUser?: { id: string; name: string }
): Promise<string> => {
  const bridgeUser = executingUser || { id: 'portal', name: 'Portal User' };
  try {
    return await callEchoBridge(history, message, bridgeUser);
  } catch (bridgeError) {
    console.error("Chat response failed: Echo bridge unavailable", bridgeError);
    throw new Error("Echo bridge unavailable. Start the local Hermes bridge rather than using paid/browser-side AI fallback.");
  }
};

export const generateSEOStrategy = async (
  domain: string,
  goal: string,
  competitors: string = ""
): Promise<any> => {
  const ai = getAiClient();
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: `You are a Senior Technical SEO Strategist at Bright Forge SEO.
      Generate a comprehensive 3-month SEO strategy and task plan.
      Domain: ${domain}
      Goal: ${goal}
      Competitors: ${competitors || 'None specified'}

      Create an actionable roadmap with specific tasks across 3 months.
      For each month, provide 3-5 specific, actionable tasks with titles and detailed descriptions.`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            summary: { type: Type.STRING },
            months: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  month: { type: Type.NUMBER },
                  focus: { type: Type.STRING },
                  tasks: {
                    type: Type.ARRAY,
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        title: { type: Type.STRING },
                        description: { type: Type.STRING },
                        priority: { type: Type.STRING, enum: ["High", "Medium", "Low"] }
                      },
                      required: ["title", "description", "priority"]
                    }
                  }
                },
                required: ["month", "focus", "tasks"]
              }
            }
          },
          required: ["summary", "months"]
        }
      }
    });

    if (response.text) {
      return JSON.parse(response.text);
    }
    throw new Error("No strategy generated");
  } catch (error) {
    console.error("Gemini SEO strategy generation failed:", error);
    throw error;
  }
};

export const generateClientEmail = async (context: string): Promise<string> => {
  const ai = getAiClient();
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: `Write a professional client email based on the following context. 
      Keep it polite, concise, and focused.
      
      Context: ${context}`,
    });
    return response.text || "Email generation failed.";
  } catch (error) {
    console.error("Email generation failed:", error);
    return "Error generating email.";
  }
};

export const checkContentQA = async (content: string, qaRules: string): Promise<QACorrection[]> => {
  const ai = getAiClient();
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: `Review the content against these QA rules and return exact corrections only.

QA rules:
${qaRules}

Content:
${content.substring(0, 6000)}

Return a JSON array of corrections. Each correction must contain:
- find: the exact text from the content to replace
- replace: the corrected replacement text, including HTML if a link or formatting is needed

If no corrections are needed, return an empty array.`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              find: { type: Type.STRING },
              replace: { type: Type.STRING }
            },
            required: ["find", "replace"]
          }
        }
      }
    });
    
    if (response.text) {
      return JSON.parse(response.text) as QACorrection[];
    }
    return [];
  } catch (error) {
    console.error("QA checking failed:", error);
    return [];
  }
};
