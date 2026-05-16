import { GoogleGenAI, Type } from "@google/genai";
import { KeywordResult, AuditResult, ContentResult, Task, QACorrection } from "../types";
import { generateLittleEchoContent } from "./littleEchoService";
import { runEchoAgent } from "./echoAgent";

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

export const generateKeywords = async (seedKeyword: string): Promise<KeywordResult[]> => {
  const ai = getAiClient();
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: `Generate 5 related long-tail keywords for "${seedKeyword}".
      For each keyword, estimate a monthly search volume (100-50000), a difficulty level (Low, Medium, High),
      a competition score (0-100), and a 6-month search trend array (6 numbers between 0-100 representing relative interest).`,
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
              }
            },
            required: ["keyword", "searchVolume", "difficulty", "competition", "trend"]
          }
        }
      }
    });

    if (response.text) {
      return JSON.parse(response.text) as KeywordResult[];
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

export const analyzeText = async (text: string): Promise<AuditResult> => {
  const ai = getAiClient();
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: `Analyze the following text content for SEO optimization opportunities.
      Text: "${text.substring(0, 2000)}..."
      Provide an overall SEO score (0-100).
      List 3-5 specific issues found (categorized by severity: high, medium, low) and actionable recommendations.
      Provide a brief summary.`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            score: { type: Type.NUMBER },
            summary: { type: Type.STRING },
            issues: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  severity: { type: Type.STRING, enum: ["high", "medium", "low"] },
                  message: { type: Type.STRING },
                  recommendation: { type: Type.STRING }
                },
                required: ["severity", "message", "recommendation"]
              }
            }
          },
          required: ["score", "summary", "issues"]
        }
      }
    });

    if (response.text) {
      return JSON.parse(response.text) as AuditResult;
    }
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
      For each task, assign a status (mix of 'Not Started', 'Working on it', 'Stuck'), 
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
              status: { type: Type.STRING, enum: ['Done', 'Working on it', 'Stuck', 'Not Started'] },
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

const ECHO_BRIDGE_URL = (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_ECHO_BRIDGE_URL) || 'http://localhost:18790';
const ECHO_BRIDGE_SECRET = (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_ECHO_BRIDGE_SECRET) || ['brightforge', 'echo', 'bridge', '2026'].join('-');

async function callEchoBridge(
  history: string,
  message: string,
  executingUser: { id: string; name: string },
  model: string = 'echo'
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
    console.warn("Portal bridge unavailable, falling back to Gemini directly:", bridgeError);
  }

  try {
    if (executingUser?.id) {
      return await runEchoAgent(history, message, executingUser);
    }
    const ai = getAiClient();
    const truncatedHistory = history.length > 8000 ? "..." + history.slice(-8000) : history;
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: `You are "Echo", a helpful, professional, and slightly witty SEO AI Assistant in a team chat for a digital agency called "Bright Forge".

      Chat History Context:
      ${truncatedHistory}

      User Message: ${message}

      Reply to the user as a helpful colleague.
      - Be concise (under 3 sentences unless asked for detail).
      - You can use simple markdown (*bold*, _italic_) but avoid complex blocks unless it's code.
      - If asked to do a task you can't do (like "delete this"), explain you are a chat assistant but can guide them.`,
    });

    return response.text || "I'm having trouble connecting to the server right now.";
  } catch (error) {
    console.error("Chat response failed:", error);
    throw new Error("AI Service Unavailable");
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
