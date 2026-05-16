/**
 * All Bright Forge Skills - Bundled at Build Time
 * This file imports all skill markdown files so they can be used in the browser
 */

// Import all skill files as raw text using Parcel's raw transformer
// MASTER KNOWLEDGE BASE — primary source of truth, loaded first.
// Single comprehensive doc covering agency identity, philosophy, services,
// pricing, white-label model, content standards, SEO methodology, GEO/AEO,
// industry playbooks, reporting, voice, QC, tooling, risk, and Ben's notes.
import masterKnowledge from 'bundle-text:../skills/master-knowledge-base.md';
import brightForgeMain from 'bundle-text:../skills/bright-forge-seo-main.md';

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
# BRIGHT FORGE SEO — COMPLETE OPERATING KNOWLEDGE BASE
# Single source of truth. The MASTER KNOWLEDGE BASE below is authoritative —
# when other skill docs disagree, the master doc wins.

# ============================================================================
# MASTER KNOWLEDGE BASE (authoritative — read this first)
# ============================================================================

${masterKnowledge}

# ============================================================================
# SUPPORTING SKILL DOCS (templates, checklists, process detail)
# ============================================================================

---

${brightForgeMain}

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
  masterKnowledge,
  brightForgeMain,

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
