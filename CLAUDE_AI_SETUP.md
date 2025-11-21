# Claude AI Integration Setup Guide

## Overview

Bright Forge Portal now uses **Claude AI** for superior performance and quality:

- **Claude Haiku 3.5** → Chat (Ask AI) - Fast, cost-effective responses
- **Claude Sonnet 4** → Content Generation, Keywords, SEO Audit, Strategy Planning - High-quality, detailed outputs

## Features

### 1. **Team Chat - Ask AI**
Uses **Claude Haiku 3.5** for quick, intelligent responses in the #ask-ai channel.

### 2. **Content Generator**
Uses **Claude Sonnet 4** to create:
- SEO-optimized blog posts
- Meta descriptions
- Structured markdown content

### 3. **Keyword Research**
Uses **Claude Sonnet 4** for:
- Long-tail keyword suggestions
- Search volume estimates
- Competition analysis
- Trend data

### 4. **SEO Audit**
Uses **Claude Sonnet 4** for:
- Content analysis
- SEO scoring (0-100)
- Issue identification
- Actionable recommendations

### 5. **AI Strategy & Task Planner** (NEW!)
Uses **Claude Sonnet 4** to generate:
- Comprehensive SEO strategies
- Actionable task lists with priorities
- Due dates and status assignments
- Industry-specific recommendations

## Setup Instructions

### 1. Get Your Anthropic API Key

1. Visit [https://console.anthropic.com](https://console.anthropic.com)
2. Sign up or log in
3. Navigate to **API Keys**
4. Create a new API key
5. Copy the key (it starts with `sk-ant-...`)

### 2. Add API Key to Environment

#### Option A: Using Supabase Edge Functions (Recommended)

1. Go to your Supabase project
2. Navigate to **Settings** → **Edge Functions**
3. Add environment variable:
   - Name: `ANTHROPIC_API_KEY`
   - Value: Your Claude API key

#### Option B: Local Development

Create a `.env` file in the project root:

```bash
ANTHROPIC_API_KEY=sk-ant-your-key-here
API_KEY=your-gemini-key-here  # Fallback
```

### 3. Update Your Build/Deploy Process

If using Parcel or Webpack, ensure environment variables are loaded:

```javascript
// In your build config
process.env.ANTHROPIC_API_KEY
```

## Fallback Behavior

The system is designed with **graceful fallbacks**:

1. **Primary**: Claude AI (Haiku/Sonnet)
2. **Fallback**: Google Gemini (if Claude fails)

This ensures the application continues working even if:
- Claude API is down
- API key is missing
- Rate limits are exceeded

## Usage

### Chat (Ask AI)
Just type in the #ask-ai channel. The bot will respond using Claude Haiku.

### Content Generation
1. Go to **Content** tab
2. Enter topic, tone, and keywords
3. Click "Generate" - Uses Claude Sonnet 4

### SEO Strategy Generator (Projects)
```typescript
import { generateSEOStrategy } from './services/geminiService';

const result = await generateSEOStrategy(
  'Client Name',
  'E-commerce',
  'Increase organic traffic by 50%',
  ['seo optimization', 'content marketing']
);

console.log(result.strategy);  // Strategic overview
console.log(result.tasks);     // Task list
console.log(result.recommendations);  // SEO tips
```

## API Costs

### Claude Pricing (as of 2025)
- **Haiku 3.5**: ~$0.25 per million input tokens (very affordable for chat)
- **Sonnet 4**: ~$3 per million input tokens (premium quality)

### Typical Usage Costs
- Chat message: ~$0.0001
- Content generation: ~$0.01-0.03
- SEO audit: ~$0.005
- Strategy plan: ~$0.02-0.05

## Monitoring Usage

Check your usage in the Anthropic Console:
https://console.anthropic.com/settings/usage

## Troubleshooting

### "AI Service Unavailable" Error
- Check API key is set correctly
- Verify key has not exceeded rate limits
- Check Anthropic API status: https://status.anthropic.com

### Slow Responses
- Haiku should respond in 1-3 seconds
- Sonnet may take 5-10 seconds for long content
- Check network connectivity

### Fallback to Gemini
Check console logs for messages like:
```
Claude chat failed, falling back to Gemini
```

This means Claude is unavailable and Gemini is being used instead.

## Files Modified

- ✅ `services/claudeService.ts` - New Claude AI service
- ✅ `services/geminiService.ts` - Updated with Claude integration + fallbacks
- ✅ `package.json` - Added `@anthropic-ai/sdk`

## Model Information

### Claude Haiku 3.5
- **Speed**: Very fast (~1-2s)
- **Context**: 200K tokens
- **Best for**: Chat, quick responses

### Claude Sonnet 4
- **Speed**: Moderate (~5-8s)
- **Context**: 200K tokens
- **Best for**: Content creation, analysis, strategy

## Support

For issues with:
- **Claude AI**: Contact Anthropic support
- **Integration**: Check console logs and verify API keys
- **Feature requests**: Open an issue on GitHub

---

🎉 **You're all set!** Your SEO tools now have state-of-the-art AI powering them.
