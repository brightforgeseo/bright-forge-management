/**
 * All Bright Forge Skills - Bundled at Build Time
 * This file imports all skill markdown files so they can be used in the browser
 */

// Import all skill files as raw text using Parcel's raw transformer
import brightForgeMain from 'bundle-text:../skills/bright-forge-seo-main.md';
import apiSystemPrompt from 'bundle-text:../skills/api-system-prompt.md';
import articleEditing from 'bundle-text:../skills/article-editing-optimization.md';
import clickLossReport from 'bundle-text:../skills/click-loss-report.md';
import clientBrief from 'bundle-text:../skills/client-brief-template.md';
import clientOnboarding from 'bundle-text:../skills/client-onboarding-checklist.md';
import competitorAnalysis from 'bundle-text:../skills/competitor-analysis-framework.md';
import contentAudit from 'bundle-text:../skills/content-audit-process.md';
import contentBrief from 'bundle-text:../skills/content-brief-template.md';
import contentStandards from 'bundle-text:../skills/content-standards.md';
import keywordIntegration from 'bundle-text:../skills/keyword-integration.md';
import keywordResearch from 'bundle-text:../skills/keyword-research-process.md';
import linkBuilding from 'bundle-text:../skills/link-building-outreach.md';
import linkingStrategy from 'bundle-text:../skills/linking-strategy.md';
import localSEO from 'bundle-text:../skills/local-seo-guidelines.md';
import monthlyReporting from 'bundle-text:../skills/monthly-reporting-template.md';
import onPageOptimization from 'bundle-text:../skills/on-page-optimization-checklist.md';
import seoProposal from 'bundle-text:../skills/seo-proposal-template.md';
import technicalSEO from 'bundle-text:../skills/technical-seo-audit.md';

// Export all skills as a single knowledge base
export const getAllSkills = (): string => {
  return `
# BRIGHT FORGE SEO - COMPLETE KNOWLEDGE BASE
# This is the full agency documentation, guidelines, and processes

---

${brightForgeMain}

---

${apiSystemPrompt}

---

${articleEditing}

---

${clickLossReport}

---

${clientBrief}

---

${clientOnboarding}

---

${competitorAnalysis}

---

${contentAudit}

---

${contentBrief}

---

${contentStandards}

---

${keywordIntegration}

---

${keywordResearch}

---

${linkBuilding}

---

${linkingStrategy}

---

${localSEO}

---

${monthlyReporting}

---

${onPageOptimization}

---

${seoProposal}

---

${technicalSEO}

---

# END OF KNOWLEDGE BASE
`;
};

// Export individual skills for targeted use
export const skills = {
  brightForgeMain,
  apiSystemPrompt,
  articleEditing,
  clickLossReport,
  clientBrief,
  clientOnboarding,
  competitorAnalysis,
  contentAudit,
  contentBrief,
  contentStandards,
  keywordIntegration,
  keywordResearch,
  linkBuilding,
  linkingStrategy,
  localSEO,
  monthlyReporting,
  onPageOptimization,
  seoProposal,
  technicalSEO
};
