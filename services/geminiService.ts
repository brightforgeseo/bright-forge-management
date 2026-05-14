import { GoogleGenAI, Type } from "@google/genai";
import { KeywordResult, AuditResult, ContentResult, Task } from "../types";
import { getClaudeChatResponse, generateClaudeContent, generateClaudeKeywords, analyzeClaudeText, generateSEOStrategy } from "./claudeService";
import { generateLittleEchoContent } from "./littleEchoService";
import { runEchoAgent } from "./echoAgent";

// Re-export Claude SEO strategy function for use in projects
export { generateSEOStrategy };

const getAiClient = () => {
  let apiKey;
  try {
    apiKey = process.env.API_KEY;
  } catch (e) {
    // process not defined
  }
  
  if (!apiKey) {
    // Fallback or throw specific error
    console.warn("API Key not found in environment variables");
    // We don't throw immediately here to allow UI to render, but calls will fail if not caught
  }
  return new GoogleGenAI({ apiKey: apiKey || 'dummy_key_to_prevent_init_crash' });
};

export const generateKeywords = async (seedKeyword: string): Promise<KeywordResult[]> => {
  // Use Claude Sonnet 4.5 for better keyword analysis
  try {
    return await generateClaudeKeywords(seedKeyword);
  } catch (claudeError) {
    console.warn("Claude keyword generation failed, falling back to Gemini:", claudeError);

    // Fallback to Gemini if Claude fails
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
  }
};

export const generateContent = async (topic: string, tone: string, keywords: string): Promise<ContentResult> => {
  // Try Little Echo first (local, zero cost), fall back to Claude, then Gemini
  try {
    return await generateLittleEchoContent(topic, tone, keywords);
  } catch (echoError) {
    console.warn("Little Echo unavailable, falling back to Claude:", echoError);
  }

  try {
    return await generateClaudeContent(topic, tone, keywords);
  } catch (claudeError) {
    console.warn("Claude content generation failed, falling back to Gemini:", claudeError);

    // Fallback to Gemini if Claude fails
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
  }
};

export const analyzeText = async (text: string): Promise<AuditResult> => {
  // Use Claude Sonnet 4.5 for detailed SEO analysis
  try {
    return await analyzeClaudeText(text);
  } catch (claudeError) {
    console.warn("Claude audit failed, falling back to Gemini:", claudeError);

    // Fallback to Gemini if Claude fails
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
  }
};

export const generateProjectTasks = async (goal: string): Promise<Task[]> => {
  const ai = getAiClient();

  try {
    // Note: 'owner' field removed from prompt to save tokens and match data model
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

// Bridge URL and secret — set VITE_ECHO_BRIDGE_URL and VITE_ECHO_BRIDGE_SECRET
// in your .env.local to enable the OpenClaw Echo bridge.
const ECHO_BRIDGE_URL = (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_ECHO_BRIDGE_URL) || '';
const ECHO_BRIDGE_SECRET = (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_ECHO_BRIDGE_SECRET) || 'brightforge-echo-bridge-2026';

async function callEchoBridge(
  history: string,
  message: string,
  executingUser: { id: string; name: string }
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
  // Route through the OpenClaw Echo bridge when configured — this makes the
  // portal chat go through the live Echo agent session instead of a stateless
  // API call. Falls back to the local echoAgent if the bridge is unavailable.
  try {
    if (executingUser?.id && ECHO_BRIDGE_URL) {
      return await callEchoBridge(history, message, executingUser);
    }
    if (executingUser?.id) {
      return await runEchoAgent(history, message, executingUser);
    }
    return await getClaudeChatResponse(history, message);
  } catch (claudeError) {
    console.warn("Echo bridge/agent failed, falling back to Gemini:", claudeError);

    // Fallback to Gemini if Claude fails
    const ai = getAiClient();

    try {
      // Truncate history if it gets too long to avoid token limits (roughly last 8000 chars)
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
  }
};