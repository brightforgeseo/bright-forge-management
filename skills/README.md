# Bright Forge SEO Skills Package

## Overview
This package contains all the standardized SEO guidelines, processes, and templates for Bright Forge SEO agency operations and Claude API integration.

## Files Included (21 Total)

### Core Guidelines
1. **bright-forge-seo-main.md** - Agency overview, standards, and business principles
2. **content-standards.md** - Writing quality requirements and structure guidelines
3. **api-system-prompt.md** - Main system prompt for Claude API integration

### SEO Optimization
4. **keyword-integration.md** - Critical keyword usage rules (PRIMARY: 3-5x, SECONDARY: 2-4x)
5. **linking-strategy.md** - Internal linking framework with batch variation strategies
6. **article-editing-optimization.md** - Step-by-step content optimization process
7. **on-page-optimization-checklist.md** - Complete on-page SEO checklist
8. **local-seo-guidelines.md** - Local SEO strategy and implementation guide

### Client Management
9. **client-brief-template.md** - Template for documenting client requirements
10. **client-onboarding-checklist.md** - Complete onboarding process (4-week timeline)
11. **seo-proposal-template.md** - Professional proposal structure for new clients

### Content & Strategy
12. **content-brief-template.md** - Detailed brief template for content creation
13. **keyword-research-process.md** - Complete keyword research methodology
14. **link-building-outreach.md** - 12 email templates and outreach strategies

### Reporting & Analysis
15. **content-audit-process.md** - Comprehensive content audit methodology
16. **click-loss-report.md** - Process for diagnosing and recovering lost traffic
17. **monthly-reporting-template.md** - Complete monthly report structure
18. **competitor-analysis-framework.md** - Comprehensive competitor analysis template

### Technical SEO
19. **technical-seo-audit.md** - Complete technical audit checklist

## How to Use with Claude API

### Basic Implementation

```javascript
// 1. Load the core skills
const coreSkills = await Promise.all([
  readFile('api-system-prompt.md'),
  readFile('keyword-integration.md'),
  readFile('linking-strategy.md'),
  readFile('content-standards.md')
]);

// 2. Combine into system prompt
const systemPrompt = coreSkills.join('\n\n---\n\n');

// 3. Make API call
const response = await fetch('https://api.anthropic.com/v1/messages', {
  method: 'POST',
  headers: {
    'x-api-key': 'YOUR_API_KEY',
    'anthropic-version': '2023-06-01',
    'content-type': 'application/json'
  },
  body: JSON.stringify({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 4096,
    messages: [
      {
        role: 'system',
        content: systemPrompt
      },
      {
        role: 'user',
        content: 'Write an SEO article about [topic]...'
      }
    ]
  })
});
```

### Client-Specific Content

```javascript
// Add client brief to the system prompt
const clientBrief = await readFile('clients/vestd-brief.md'); // Create from template
const fullPrompt = systemPrompt + '\n\n---\n\n' + clientBrief;

// Now all content will follow client-specific guidelines
```

### Task-Specific Loading

```javascript
// For article creation
const articleSkills = [
  'api-system-prompt.md',
  'keyword-integration.md',
  'linking-strategy.md',
  'content-standards.md'
];

// For content audits
const auditSkills = [
  'api-system-prompt.md',
  'content-audit-process.md'
];

// For proposals
const proposalSkills = [
  'seo-proposal-template.md'
];
```

## Critical Rules Summary

### Keywords
- **Primary (PK)**: 3-5x in body only
- **Secondary (SK)**: 2-4x each, never repeat across cluster
- Body count separate from metadata

### Links
- No URL appears 2x in same article
- No repeated anchor text across articles
- Vary strategy batch to batch
- 5-8 links per article

### Content Quality
- No AI language patterns
- Data-driven statements
- Professional expertise tone
- Scannable structure (3-4 sentence paragraphs)

## Directory Structure Recommendation

```
/your-portal/
├── skills/
│   ├── bright-forge-seo-main.md
│   ├── api-system-prompt.md
│   ├── keyword-integration.md
│   ├── linking-strategy.md
│   ├── content-standards.md
│   ├── article-editing-optimization.md
│   ├── content-audit-process.md
│   ├── click-loss-report.md
│   └── seo-proposal-template.md
├── clients/
│   ├── vestd-brief.md (created from template)
│   ├── ace-scaffolding-brief.md
│   └── jobman-brief.md
└── templates/
    └── client-brief-template.md
```

## Cost Optimization with Skills

### Prompt Caching
Skills are perfect for prompt caching:
- First request: ~5,000 tokens = $0.015
- Cached requests: ~5,000 tokens = $0.0015 (90% savings)

For 880 articles/month:
- Without caching: $13.20
- With caching: $1.65
- **Savings: $11.55/month**

### Best Practices
1. Keep skills under 10,000 tokens total for best caching
2. Load all skills at start of conversation
3. Reuse same system prompt across batch
4. Update skills file, not inline instructions

## Updating Skills

When you need to change a rule:
1. Edit the appropriate .md file
2. Redeploy to your portal
3. All future requests use new guidelines
4. Version control recommended (Git)

## Support

For issues or questions about implementing these skills:
- Review the api-system-prompt.md for core instructions
- Check keyword-integration.md and linking-strategy.md for specific rules
- Use client-brief-template.md to document new clients

## Version
Package created: November 2024
Agency: Bright Forge SEO
Clients: 44+
Team: 6 members
Monthly revenue: ₱1.1M+
