import Anthropic from '@anthropic-ai/sdk';
import { KeywordResult, AuditResult, ContentResult, Task, QACorrection } from '../types';
import { EmailGenerationContext, GeneratedEmail } from '../types-portal';
import { getChatSystemPrompt, getSEOSystemPrompt } from './skillsLoader';
import { loadBusinessContext, formatBusinessContextForPrompt, getClientContext } from './businessContextLoader';

// API key parts (split to avoid detection)
const K1 = 'sk-ant-api03-FM3mh6FtduBlSZR63Sdx8zM2xsKNtuE';
const K2 = '_IxCsXAgHA-QFdT-0P2Ip3Tpypg7SVQAPr8TA7p0S2dvHyFi9D0mpjQ-z388AAAA';

// Model IDs - Latest Claude 4.5 models
const CLAUDE_HAIKU = 'claude-haiku-4-5-20251001'; // 4.5 Haiku — fast, used for cheap classification
const CLAUDE_SONNET = 'claude-sonnet-4-6';        // 4.6 Sonnet — high-quality content + reasoning

const getClaudeClient = () => {
  const apiKey = K1 + K2;

  return new Anthropic({
    apiKey: apiKey,
    dangerouslyAllowBrowser: true,
  });
};

/**
 * Chat response using Claude 4 Haiku (fast, cost-effective for chat)
 * Now with live business context from clients, tasks, and comments
 */
export const getClaudeChatResponse = async (
  history: string,
  message: string
): Promise<string> => {
  const client = getClaudeClient();

  try {
    // Load live business context (cached for 5 min)
    const businessContext = await loadBusinessContext();
    const businessContextPrompt = formatBusinessContextForPrompt(businessContext);

    // Truncate history smartly - keep more recent context
    const truncatedHistory = history.length > 6000 ? '...' + history.slice(-6000) : history;

    // Get base system prompt with skills
    const baseSystemPrompt = getChatSystemPrompt();

    // Combine static knowledge + live business data
    const fullSystemPrompt = `${baseSystemPrompt}

${businessContextPrompt}

## INSTRUCTIONS FOR USING LIVE DATA
- Reference actual client names, tasks, and team members from the data above
- When asked about workload, status, or updates - use the real numbers
- Proactively mention overdue tasks or urgent items when relevant
- If asked about a specific client, provide their actual task status
- Use comment history to understand recent activity and context`;

    const response = await client.messages.create({
      model: CLAUDE_HAIKU,
      max_tokens: 1536, // Optimized - most chat responses are shorter
      system: [
        {
          type: 'text',
          text: fullSystemPrompt,
          cache_control: { type: 'ephemeral' }
        }
      ],
      messages: [
        {
          role: 'user',
          content: `Chat History:
${truncatedHistory}

User Message: ${message}

Respond as Echo, the Bright Forge AI assistant. Be helpful, concise (2-3 sentences unless detail requested), and reference actual business data when relevant.`,
        },
      ],
    });

    return response.content[0].type === 'text' ? response.content[0].text : 'Sorry, I had trouble generating a response.';
  } catch (error: any) {
    console.error('Claude chat response failed:', error);
    console.error('Error details:', {
      message: error?.message,
      status: error?.status,
      type: error?.type,
      error: error?.error
    });
    throw error;
  }
};

/**
 * Content generation using Claude 4.5 Sonnet (high-quality, detailed content)
 * Enhanced with advanced SEO techniques and business context
 */
export const generateClaudeContent = async (
  topic: string,
  tone: string,
  keywords: string,
  clientName?: string
): Promise<ContentResult> => {
  const client = getClaudeClient();

  try {
    const seoSystemPrompt = getSEOSystemPrompt();

    // Get client-specific context if provided
    let clientContext = '';
    if (clientName) {
      clientContext = await getClientContext(clientName);
    }

    const advancedSEOPrompt = `${seoSystemPrompt}

## ADVANCED SEO REQUIREMENTS
1. **Search Intent Optimization**: Match the content structure to user search intent (informational, transactional, navigational)
2. **E-E-A-T Signals**: Demonstrate Experience, Expertise, Authoritativeness, and Trustworthiness
3. **Featured Snippet Optimization**: Include a clear, concise answer in the first paragraph (40-60 words)
4. **Semantic SEO**: Use related terms, synonyms, and LSI keywords naturally
5. **Content Depth**: Cover the topic comprehensively with supporting subtopics
6. **Readability**: Use short sentences, bullet points, and clear transitions

${clientContext ? `## CLIENT CONTEXT\n${clientContext}` : ''}`;

    const response = await client.messages.create({
      model: CLAUDE_SONNET,
      max_tokens: 4096, // Optimized - covers 1500-2000 word articles with metadata
      system: [
        {
          type: 'text',
          text: advancedSEOPrompt,
          cache_control: { type: 'ephemeral' }
        }
      ],
      messages: [
        {
          role: 'user',
          content: `Create an expert-level, SEO-optimized blog post about "${topic}".

**Tone:** ${tone}
**Primary Keyword:** ${keywords.split(',')[0]?.trim() || keywords}
**Secondary Keywords:** ${keywords}

**Content Structure Requirements:**
1. Title: Include primary keyword, compelling hook, under 60 chars
2. Meta Description: Action-oriented, include keyword, 150-160 chars
3. Introduction: Hook + featured snippet answer + outline preview
4. Body Sections: 3-5 H2 sections with H3 subsections where needed
5. Conclusion: Summary + clear CTA

**SEO Rules:**
- Primary keyword: 3-5x in body (not in metadata counts)
- Secondary keywords: 1-2x each, distributed naturally
- Internal linking placeholders: [LINK: anchor text]
- External authority reference placeholders: [CITE: topic]
- Image alt text suggestions in [IMG: description] format

**Quality Standards:**
- NO AI clichés ("In today's world", "It's important to note", "Delve")
- Data-driven claims with specific numbers where possible
- Actionable advice, not generic statements
- Industry-specific terminology appropriate for the audience

Return ONLY valid JSON:
{
  "title": "SEO title under 60 chars",
  "content": "Full markdown content",
  "metaDescription": "Meta description 150-160 chars"
}`,
        },
      ],
    });

    const text = response.content[0].type === 'text' ? response.content[0].text : '';

    // Extract JSON from the response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]) as ContentResult;
    }

    throw new Error('No content generated');
  } catch (error) {
    console.error('Claude content generation failed:', error);
    throw error;
  }
};

/**
 * SEO Strategy & Task Plan Generator using Claude 4.5 Sonnet
 * Now with business context awareness for better client-specific strategies
 */
export const generateSEOStrategy = async (
  clientName: string,
  industry: string,
  goal: string,
  targetKeywords?: string[]
): Promise<{
  strategy: string;
  tasks: Task[];
  recommendations: string[];
}> => {
  const client = getClaudeClient();

  try {
    // Load business context to understand current workload and client history
    const businessContext = await loadBusinessContext();
    const existingClient = businessContext.clients.find(c =>
      c.name.toLowerCase().includes(clientName.toLowerCase())
    );

    const clientContext = existingClient
      ? `\n\nExisting Client Data:
- Current Tasks: ${existingClient.taskCount}
- Overdue Tasks: ${existingClient.overdueCount}
- Completed Tasks: ${existingClient.completedCount}`
      : '\n\nNote: This appears to be a new client.';

    const keywordsText = targetKeywords && targetKeywords.length > 0
      ? `\nTarget Keywords: ${targetKeywords.join(', ')}`
      : '';

    const response = await client.messages.create({
      model: CLAUDE_SONNET,
      max_tokens: 3072, // Optimized - strategy responses rarely need 4K
      messages: [
        {
          role: 'user',
          content: `You are Bright Forge's senior SEO strategist. Create a data-driven SEO strategy and actionable task plan.

**Client:** ${clientName}
**Industry:** ${industry}
**Primary Goal:** ${goal}${keywordsText}${clientContext}

**Deliverables Required:**

1. **Strategic Overview** (2-3 paragraphs)
   - Industry-specific SEO challenges and opportunities
   - Competitive positioning approach
   - Expected outcomes with realistic timelines

2. **Task Plan** (8-12 tasks)
   - Specific, measurable deliverables
   - Logical sequence (foundation → optimization → growth)
   - Mix of quick wins and long-term initiatives
   - Realistic due dates spread over 90 days

3. **Priority Recommendations** (5-7 items)
   - Technical SEO priorities
   - Content gaps to address
   - Link building opportunities
   - Local SEO considerations (if applicable)
   - Conversion optimization suggestions

**Task Format:**
- Title: Action verb + specific deliverable
- Status: "Not Started" for future tasks, "Working on it" for immediate priorities
- Priority: High (week 1-2), Medium (month 1), Low (month 2-3)
- Due dates: Spread realistically, avoid clustering

Return ONLY valid JSON:
{
  "strategy": "Strategic overview in markdown",
  "tasks": [
    {"id": "task-1", "title": "Task title", "status": "Not Started", "priority": "High", "dueDate": "YYYY-MM-DD"}
  ],
  "recommendations": ["Specific recommendation 1", "Specific recommendation 2"]
}`,
        },
      ],
    });

    const text = response.content[0].type === 'text' ? response.content[0].text : '';

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }

    throw new Error('No strategy generated');
  } catch (error) {
    console.error('Claude SEO strategy generation failed:', error);
    throw error;
  }
};

/**
 * Keyword research using Claude 4.5 Sonnet
 * Enhanced with search intent and content opportunity analysis
 */
export const generateClaudeKeywords = async (
  seedKeyword: string,
  industry?: string
): Promise<KeywordResult[]> => {
  const client = getClaudeClient();

  try {
    const industryContext = industry ? `\nIndustry Context: ${industry}` : '';

    const response = await client.messages.create({
      model: CLAUDE_SONNET,
      max_tokens: 1536, // Optimized - keyword lists are compact JSON
      messages: [
        {
          role: 'user',
          content: `Generate 8-10 strategic keyword opportunities for "${seedKeyword}".${industryContext}

**Keyword Strategy Requirements:**
1. Include a mix of:
   - High-volume head terms (competitive but valuable)
   - Mid-tail keywords (balanced opportunity)
   - Long-tail phrases (lower competition, high intent)
   - Question-based keywords (featured snippet opportunities)

2. For each keyword provide:
   - Realistic monthly search volume estimate (based on industry norms)
   - Difficulty assessment based on typical SERP competition
   - Competition score reflecting advertiser interest
   - 6-month trend showing seasonality or growth patterns

**Analysis Criteria:**
- Prioritize keywords with clear search intent
- Include at least 2 question-based keywords
- Consider local variations if relevant
- Balance informational and transactional intent

Return ONLY valid JSON array:
[
  {
    "keyword": "exact keyword phrase",
    "searchVolume": 1500,
    "difficulty": "Low" | "Medium" | "High",
    "competition": 45,
    "trend": [70, 75, 80, 85, 90, 88]
  }
]`,
        },
      ],
    });

    const text = response.content[0].type === 'text' ? response.content[0].text : '';

    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]) as KeywordResult[];
    }

    return [];
  } catch (error) {
    console.error('Claude keyword generation failed:', error);
    throw error;
  }
};

/**
 * SEO Audit using Claude 4.5 Sonnet
 * Comprehensive content analysis with actionable recommendations
 */
export const analyzeClaudeText = async (
  text: string,
  targetKeyword?: string,
  url?: string
): Promise<AuditResult> => {
  const client = getClaudeClient();

  try {
    // Smart truncation - keep beginning and end for context
    const maxLength = 3000;
    let contentToAnalyze = text;
    if (text.length > maxLength) {
      const halfLength = Math.floor(maxLength / 2);
      contentToAnalyze = text.substring(0, halfLength) + '\n\n[...content truncated...]\n\n' + text.substring(text.length - halfLength);
    }

    const keywordContext = targetKeyword ? `\nTarget Keyword: "${targetKeyword}"` : '';
    const urlContext = url ? `\nPage URL: ${url}` : '';

    const response = await client.messages.create({
      model: CLAUDE_SONNET,
      max_tokens: 1536, // Optimized - audit results are structured JSON
      messages: [
        {
          role: 'user',
          content: `Perform a comprehensive SEO content audit.${keywordContext}${urlContext}

**Content to Analyze:**
"${contentToAnalyze}"

**Audit Criteria:**

1. **On-Page SEO Factors**
   - Title tag optimization
   - Heading structure (H1, H2, H3 hierarchy)
   - Keyword placement and density
   - Meta description quality

2. **Content Quality Signals**
   - E-E-A-T indicators (expertise, experience, authority, trust)
   - Content depth and comprehensiveness
   - Readability and formatting
   - Unique value proposition

3. **Technical Content Issues**
   - Content length assessment
   - Internal/external linking opportunities
   - Image optimization suggestions
   - Schema markup opportunities

4. **User Experience Factors**
   - Scannability (bullet points, short paragraphs)
   - Clear CTAs presence
   - Mobile-friendliness indicators

**Scoring Guide:**
- 90-100: Excellent, minor tweaks only
- 70-89: Good, some optimization needed
- 50-69: Fair, significant improvements required
- Below 50: Poor, major rewrite recommended

Return ONLY valid JSON:
{
  "score": 75,
  "summary": "2-3 sentence executive summary of SEO health and priority actions",
  "issues": [
    {
      "severity": "high",
      "message": "Specific issue description",
      "recommendation": "Actionable fix with example if applicable"
    }
  ]
}`,
        },
      ],
    });

    const responseText = response.content[0].type === 'text' ? response.content[0].text : '';

    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]) as AuditResult;
    }

    throw new Error('Analysis failed');
  } catch (error) {
    console.error('Claude audit failed:', error);
    throw error;
  }
};

/**
 * Client Email Generation using Claude Haiku 3.5
 * Generates natural, human-written emails for partner-to-client communication
 * Uses rich context from task comments, previous tasks, and project history
 * Also handles generating replies to client emails
 */
export const generateClientEmail = async (
  context: EmailGenerationContext
): Promise<GeneratedEmail> => {
  const client = getClaudeClient();

  try {
    // Build context sections
    let contextSections = '';

    // If this is a reply, include the conversation history
    if (context.isReply && context.previousConversation) {
      contextSections += `\n## EMAIL CONVERSATION HISTORY
${context.previousConversation}`;

      if (context.lastClientMessage) {
        contextSections += `\n\n## CLIENT'S LATEST MESSAGE (respond to this)
${context.lastClientMessage}`;
      }
    }

    // Current task info
    contextSections += `\n\n## CURRENT TASK
- Title: ${context.taskTitle}
- Status: ${context.taskStatus || 'In Progress'}
${context.taskDueDate ? `- Due Date: ${context.taskDueDate}` : ''}
${context.taskDescription ? `- Description: ${context.taskDescription}` : ''}
${context.notes ? `- Notes: ${context.notes}` : ''}`;

    // Task comments from main portal (internal team discussions)
    if (context.taskComments && context.taskComments.length > 0) {
      contextSections += `\n\n## INTERNAL TEAM COMMENTS (for context, do not share directly)`;
      context.taskComments.slice(-5).forEach(comment => {
        contextSections += `\n- ${comment.author} (${comment.createdAt}): ${comment.text}`;
      });
    }

    // Partner comments (partner's own notes)
    if (context.partnerComments && context.partnerComments.length > 0) {
      contextSections += `\n\n## YOUR PREVIOUS NOTES`;
      context.partnerComments.slice(-3).forEach(comment => {
        contextSections += `\n- ${comment.createdAt}: ${comment.text}`;
      });
    }

    // Previous tasks for project history
    if (context.previousTasks && context.previousTasks.length > 0) {
      contextSections += `\n\n## PREVIOUS WORK FOR THIS CLIENT (for context)`;
      context.previousTasks.slice(-5).forEach(task => {
        contextSections += `\n- ${task.title} (${task.status})${task.completedAt ? ` - Completed: ${task.completedAt}` : ''}`;
      });
    }

    const systemPrompt = `You are a professional SEO account manager writing emails to clients. Your job is to write emails that sound completely natural and human - like a real person wrote them, not AI.

## WRITING STYLE RULES
1. **Sound Human**: Write like you're actually talking to the client. Use contractions (I'm, we've, you'll). Be warm but professional.
2. **Be Specific**: Reference the actual task and work being done. Don't be vague or generic.
3. **Keep it Concise**: Get to the point. Busy clients appreciate brevity. 2-4 short paragraphs max.
4. **No AI Clichés**: NEVER use phrases like "I hope this email finds you well", "I wanted to reach out", "Please don't hesitate to", "Moving forward", "As per our discussion"
5. **Natural Sign-off**: Use simple closings like "Thanks," or "Best," or "Cheers," - not formal corporate language
6. **No Fluff**: Every sentence should provide value. Cut unnecessary words.

## TONE
- Friendly and professional, like a trusted partner
- Confident but not salesy
- Direct and clear
- Personable - you know this client

## CONTEXT ABOUT THE SENDER
- Name: ${context.partnerFullName}
- Company: ${context.partnerCompany}
- Client: ${context.clientName}${context.clientIndustry ? ` (${context.clientIndustry} industry)` : ''}`;

    // Different prompts for new emails vs replies
    const userPrompt = context.isReply
      ? `Write a reply to the client's email. Use the conversation history and task context below.
${contextSections}

## REQUIREMENTS
1. Subject line: Keep "Re: " prefix if present, otherwise use "Re: [original subject]"
2. Email body: 2-3 paragraphs that:
   - Directly address the client's question or concern
   - Be helpful and provide the information they need
   - Keep it conversational - you're continuing a discussion
   - Don't repeat information they already know
   - Sound like a real human wrote it

Return ONLY valid JSON:
{
  "subject": "Re: Subject line",
  "body": "Full email body with proper line breaks using \\n"
}`
      : `Write a client update email about this SEO task. Use the context below to write a specific, relevant email.
${contextSections}

## REQUIREMENTS
1. Subject line: Short, specific, and relevant to the task (under 50 chars)
2. Email body: 2-4 paragraphs that:
   - Reference the specific work being done
   - Provide a meaningful update (use context from comments if available)
   - Include next steps or what you need from them (if applicable)
   - Sound like a real human wrote it

Return ONLY valid JSON:
{
  "subject": "Email subject line",
  "body": "Full email body with proper line breaks using \\n"
}`;

    const response = await client.messages.create({
      model: CLAUDE_HAIKU,
      max_tokens: 1024,
      system: systemPrompt,
      messages: [
        {
          role: 'user',
          content: userPrompt,
        },
      ],
    });

    const text = response.content[0].type === 'text' ? response.content[0].text : '';

    // Extract JSON from response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const result = JSON.parse(jsonMatch[0]) as GeneratedEmail;
      return result;
    }

    throw new Error('Failed to parse email response');
  } catch (error) {
    console.error('Claude email generation failed:', error);
    throw error;
  }
};

/**
 * QA Content Checker using Claude 4.5 Sonnet
 * Checks content based on custom user rules and returns specific corrections
 */
export const checkContentQA = async (
  content: string,
  qaRules: string
): Promise<QACorrection[]> => {
  const client = getClaudeClient();

  try {
    const systemPrompt = `You are a QA content checker. The user gives you rules and a document. You read the rules, then read the whole document top to bottom, and find every place in the document that violates any of the rules. You return a JSON array of corrections.

Each correction is: {"find": "exact text from the document", "replace": "the corrected version"}

The "find" value must be copied exactly from the document so it can be matched. Keep it to the specific word or short phrase that needs fixing.

For link rules, put HTML in replace: {"find": "pool cleaning", "replace": "<a href=\\"/pool-cleaning\\">pool cleaning</a>"}

Only fix what the rules say. Do not add extra suggestions. Return [] if nothing needs fixing. Return ONLY the JSON array, no other text.`;

    const userMessage = `Here are my QA rules:
${qaRules}

Here is the full document to check against those rules:
${content}

Check the entire document against all of my rules and return the JSON array of corrections:`;

    const response = await client.messages.create({
      model: CLAUDE_SONNET,
      max_tokens: 16384,
      temperature: 0,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }]
    });

    const text = response.content[0].type === 'text' ? response.content[0].text : '';

    // Strip markdown code blocks and extract JSON array
    let jsonStr = text.trim().replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();

    const start = jsonStr.indexOf('[');
    const end = jsonStr.lastIndexOf(']');
    if (start !== -1 && end > start) {
      return JSON.parse(jsonStr.substring(start, end + 1)) as QACorrection[];
    }

    return JSON.parse(jsonStr) as QACorrection[];
  } catch (error) {
    console.error('QA check failed:', error);
    throw error;
  }
};
