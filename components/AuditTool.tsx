import React, { useMemo, useState } from 'react';
import { AlertCircle, AlertTriangle, CheckCircle, Clipboard, Copy, ExternalLink, FileText, Gauge, Globe, ListChecks, Loader2, ScanLine, Sparkles, Target, Zap } from 'lucide-react';
import { analyzeText } from '../services/geminiService';
import { AuditMode, AuditResult } from '../types';

type ResultTab = 'issues' | 'quickWins' | 'actions';

const auditModes: { id: AuditMode; label: string; description: string; icon: React.ElementType }[] = [
  { id: 'url', label: 'URL Audit', description: 'Fetch and audit a live page through the bridge.', icon: Globe },
  { id: 'content', label: 'Content Audit', description: 'Paste copy, metadata, or HTML for on-page review.', icon: FileText },
  { id: 'technical', label: 'Technical Review', description: 'Prioritise crawl, indexability, schema and performance risks.', icon: Gauge },
];

const countries = [
  { value: 'us', label: 'United States' },
  { value: 'uk', label: 'United Kingdom' },
  { value: 'au', label: 'Australia' },
  { value: 'ca', label: 'Canada' },
  { value: 'ph', label: 'Philippines' },
];

const severityStyles = {
  high: {
    icon: AlertCircle,
    label: 'High',
    badge: 'bg-red-500/15 text-red-300 border-red-500/30',
    border: '#ef4444',
  },
  medium: {
    icon: AlertTriangle,
    label: 'Medium',
    badge: 'bg-yellow-500/15 text-yellow-200 border-yellow-500/30',
    border: '#eab308',
  },
  low: {
    icon: CheckCircle,
    label: 'Low',
    badge: 'bg-blue-500/15 text-blue-200 border-blue-500/30',
    border: '#3b82f6',
  },
};

const scoreLabel = (score: number) => {
  if (score >= 80) return 'Strong';
  if (score >= 60) return 'Needs polish';
  if (score >= 40) return 'Needs work';
  return 'High risk';
};

const AuditTool: React.FC = () => {
  const [mode, setMode] = useState<AuditMode>('url');
  const [url, setUrl] = useState('');
  const [text, setText] = useState('');
  const [primaryKeyword, setPrimaryKeyword] = useState('');
  const [source, setSource] = useState('us');
  const [competitor, setCompetitor] = useState('');
  const [includeTechnical, setIncludeTechnical] = useState(true);
  const [activeTab, setActiveTab] = useState<ResultTab>('issues');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<AuditResult | null>(null);
  const [lastRun, setLastRun] = useState('');

  const inputValue = mode === 'url' ? url : text;
  const issues = useMemo(() => [...(result?.issues || [])].sort((a, b) => (a.priority || 99) - (b.priority || 99)), [result]);
  const highIssues = issues.filter((issue) => issue.severity === 'high').length;
  const mediumIssues = issues.filter((issue) => issue.severity === 'medium').length;
  const quickWins = result?.quickWins?.length ? result.quickWins : issues.filter((issue) => String(issue.effort || '').toLowerCase() === 'low').slice(0, 5).map((issue) => issue.recommendation);
  const actions = result?.nextActions?.length ? result.nextActions : issues.slice(0, 5).map((issue) => issue.recommendation);

  const handleAudit = async () => {
    if (!inputValue.trim()) return;
    setLoading(true);
    setError('');
    try {
      const auditInput = mode === 'url' ? url.trim() : text.trim();
      const data = await analyzeText(auditInput, {
        mode,
        url: mode === 'url' ? url.trim() : undefined,
        primaryKeyword: primaryKeyword.trim() || undefined,
        source,
        includeTechnical,
        competitor: competitor.trim() || undefined,
      });
      setResult(data);
      setActiveTab('issues');
      setLastRun(new Date().toLocaleString());
    } catch (err: any) {
      console.error(err);
      setError(err?.message || 'Audit failed.');
    } finally {
      setLoading(false);
    }
  };

  const copyReport = async () => {
    if (!result) return;
    const lines = [
      `SEO Audit${result.metadata?.url ? `: ${result.metadata.url}` : ''}`,
      `Score: ${result.score}/100 (${scoreLabel(result.score)})`,
      '',
      'Executive summary:',
      result.summary,
      '',
      'Priority issues:',
      ...issues.map((issue, index) => `${index + 1}. [${issue.severity.toUpperCase()}] ${issue.category || 'SEO'}: ${issue.message}\n   Fix: ${issue.recommendation}${issue.impact ? `\n   Impact: ${issue.impact}` : ''}`),
      '',
      'Next actions:',
      ...actions.map((action, index) => `${index + 1}. ${action}`),
    ];
    await navigator.clipboard.writeText(lines.join('\n'));
  };

  const copyTaskBrief = async () => {
    if (!result) return;
    const topIssues = issues.slice(0, 5).map((issue, index) => `${index + 1}. ${issue.message} — ${issue.recommendation}`).join('\n');
    await navigator.clipboard.writeText(`SEO audit implementation brief\n\nTarget: ${url || primaryKeyword || 'Pasted content'}\nScore: ${result.score}/100\n\nTop fixes:\n${topIssues}\n\nAcceptance criteria:\n- High-priority SEO issues are resolved or documented if blocked.\n- Metadata, heading structure, internal links, schema and indexability checks are reviewed.\n- Changes are tested before publishing.`);
  };

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto space-y-8">
      <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4">
        <div className="space-y-2">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-brand-500/10 border border-brand-500/20 text-brand-200 text-sm font-semibold">
            <ScanLine className="w-4 h-4" />
            SEO Audit Tool
          </div>
          <h2 className="text-3xl font-bold text-white">Audit pages like an SEO, not a toy scanner.</h2>
          <p className="text-portal-soft max-w-3xl">Run URL, content, or technical checks and get prioritised fixes with impact, effort, quick wins, and an implementation brief.</p>
        </div>
        {result && (
          <div className="flex flex-wrap gap-2">
            <button onClick={copyReport} className="px-4 py-2 rounded-xl bg-portal-surface2 hover:bg-white/10 text-portal-text border border-white/[0.07] flex items-center gap-2 transition-colors">
              <Copy className="w-4 h-4" /> Copy Report
            </button>
            <button onClick={copyTaskBrief} className="px-4 py-2 rounded-xl bg-brand-600 hover:bg-brand-700 text-white font-semibold flex items-center gap-2 transition-colors">
              <Clipboard className="w-4 h-4" /> Copy Task Brief
            </button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[420px_1fr] gap-6">
        <div className="space-y-5">
          <div className="grid grid-cols-1 gap-3">
            {auditModes.map((item) => {
              const Icon = item.icon;
              const active = mode === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setMode(item.id)}
                  className={`text-left p-4 rounded-2xl border transition-all ${active ? 'bg-brand-500/15 border-brand-500/40 shadow-lg shadow-brand-500/10' : 'bg-portal-surface border-white/[0.07] hover:bg-portal-surface2'}`}
                >
                  <div className="flex items-start gap-3">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${active ? 'bg-brand-500 text-white' : 'bg-portal-surface2 text-portal-soft'}`}>
                      <Icon className="w-5 h-5" />
                    </div>
                    <div>
                      <p className="font-bold text-white">{item.label}</p>
                      <p className="text-sm text-portal-soft mt-1">{item.description}</p>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          <div className="bg-portal-surface p-5 rounded-2xl shadow-lg shadow-black/20 border border-white/[0.07] space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="space-y-2">
                <span className="text-sm font-semibold text-portal-soft">Primary keyword</span>
                <input value={primaryKeyword} onChange={(e) => setPrimaryKeyword(e.target.value)} placeholder="e.g. plumber SEO" className="w-full px-4 py-3 rounded-xl bg-portal-surface2 border border-white/[0.07] text-white outline-none focus:ring-2 focus:ring-brand-500" />
              </label>
              <label className="space-y-2">
                <span className="text-sm font-semibold text-portal-soft">Country</span>
                <select value={source} onChange={(e) => setSource(e.target.value)} className="w-full px-4 py-3 rounded-xl bg-portal-surface2 border border-white/[0.07] text-white outline-none focus:ring-2 focus:ring-brand-500">
                  {countries.map((country) => <option key={country.value} value={country.value}>{country.label}</option>)}
                </select>
              </label>
            </div>

            <label className="space-y-2 block">
              <span className="text-sm font-semibold text-portal-soft">Competitor URL or domain <span className="font-normal text-portal-soft/70">optional</span></span>
              <input value={competitor} onChange={(e) => setCompetitor(e.target.value)} placeholder="competitor.com" className="w-full px-4 py-3 rounded-xl bg-portal-surface2 border border-white/[0.07] text-white outline-none focus:ring-2 focus:ring-brand-500" />
            </label>

            <label className="flex items-center justify-between gap-3 p-3 rounded-xl bg-portal-surface2 border border-white/[0.07]">
              <div>
                <p className="text-sm font-semibold text-white">Include technical checks</p>
                <p className="text-xs text-portal-soft">Indexability, crawlability, schema and performance risk notes.</p>
              </div>
              <input type="checkbox" checked={includeTechnical} onChange={(e) => setIncludeTechnical(e.target.checked)} className="w-5 h-5 accent-brand-500" />
            </label>
          </div>

          <div className="bg-portal-surface p-1 rounded-2xl shadow-lg shadow-black/20 border border-white/[0.07]">
            {mode === 'url' ? (
              <div className="p-4 space-y-3">
                <label className="space-y-2 block">
                  <span className="text-sm font-semibold text-portal-soft">Page URL</span>
                  <input
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    placeholder="https://example.com/service-page"
                    className="w-full px-4 py-3 rounded-xl bg-white text-slate-900 outline-none focus:ring-2 focus:ring-brand-500 placeholder-slate-400"
                  />
                </label>
                {url && <a href={url.startsWith('http') ? url : `https://${url}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm text-brand-300 hover:text-brand-200"><ExternalLink className="w-4 h-4" /> Open page</a>}
              </div>
            ) : (
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder={mode === 'technical' ? 'Paste crawl notes, page HTML, Lighthouse notes, metadata, or technical findings here...' : 'Paste article copy, metadata, headings, or HTML snippet here...'}
                className="w-full h-80 p-5 rounded-xl outline-none resize-none text-slate-900 bg-white text-base leading-relaxed focus:ring-2 focus:ring-brand-500 placeholder-slate-400"
              />
            )}
          </div>

          {error && <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-red-200 text-sm">{error}</div>}

          <button
            onClick={handleAudit}
            disabled={loading || !inputValue.trim()}
            className="w-full py-4 bg-brand-600 hover:bg-brand-700 text-white rounded-xl font-bold shadow-lg shadow-brand-600/20 disabled:opacity-50 transition-all flex items-center justify-center gap-2"
          >
            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <ScanLine className="w-5 h-5" />}
            {loading ? 'Running SEO Audit...' : 'Run SEO Audit'}
          </button>
        </div>

        <div className="space-y-6">
          {result ? (
            <div className="animate-fadeIn space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="md:col-span-2 bg-portal-surface p-6 rounded-2xl shadow-lg shadow-black/20 border border-white/[0.07] flex items-center justify-between gap-4">
                  <div>
                    <h3 className="text-lg font-semibold text-portal-text">SEO Score</h3>
                    <p className="text-portal-soft text-sm mt-1">{scoreLabel(result.score)}{lastRun ? ` • ${lastRun}` : ''}</p>
                  </div>
                  <div className="relative w-24 h-24 flex items-center justify-center shrink-0">
                    <svg className="w-full h-full transform -rotate-90">
                      <circle cx="48" cy="48" r="40" stroke="rgba(255,255,255,0.08)" strokeWidth="8" fill="transparent" />
                      <circle cx="48" cy="48" r="40" stroke={result.score > 70 ? '#22c55e' : result.score > 45 ? '#eab308' : '#ef4444'} strokeWidth="8" fill="transparent" strokeDasharray={251.2} strokeDashoffset={251.2 - (251.2 * result.score) / 100} className="transition-all duration-1000 ease-out" />
                    </svg>
                    <span className="absolute text-2xl font-bold text-white">{result.score}</span>
                  </div>
                </div>
                <div className="bg-portal-surface p-5 rounded-2xl border border-white/[0.07]">
                  <div className="flex items-center gap-2 text-red-300"><AlertCircle className="w-5 h-5" /><span className="font-bold text-2xl">{highIssues}</span></div>
                  <p className="text-sm text-portal-soft mt-2">High priority issues</p>
                </div>
                <div className="bg-portal-surface p-5 rounded-2xl border border-white/[0.07]">
                  <div className="flex items-center gap-2 text-yellow-200"><Zap className="w-5 h-5" /><span className="font-bold text-2xl">{quickWins.length}</span></div>
                  <p className="text-sm text-portal-soft mt-2">Quick wins found</p>
                </div>
              </div>

              <div className="bg-portal-surface p-6 rounded-2xl shadow-lg shadow-black/20 border border-white/[0.07]">
                <div className="flex items-center gap-2 mb-3 text-white font-semibold"><Sparkles className="w-5 h-5 text-brand-300" /> Executive Summary</div>
                <p className="text-portal-soft leading-relaxed">{result.summary}</p>
                {!!result.strengths?.length && (
                  <div className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-3">
                    {result.strengths.slice(0, 4).map((strength, index) => (
                      <div key={index} className="flex items-start gap-2 text-sm text-green-200 bg-green-500/10 border border-green-500/20 rounded-xl p-3">
                        <CheckCircle className="w-4 h-4 mt-0.5 shrink-0" /> {strength}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="bg-portal-surface rounded-2xl shadow-lg shadow-black/20 border border-white/[0.07] overflow-hidden">
                <div className="flex flex-wrap border-b border-white/[0.07]">
                  {[
                    { id: 'issues', label: `Issues (${issues.length})`, icon: AlertTriangle },
                    { id: 'quickWins', label: `Quick Wins (${quickWins.length})`, icon: Zap },
                    { id: 'actions', label: 'Action Plan', icon: ListChecks },
                  ].map((tab) => {
                    const Icon = tab.icon;
                    const active = activeTab === tab.id;
                    return (
                      <button key={tab.id} onClick={() => setActiveTab(tab.id as ResultTab)} className={`px-5 py-4 text-sm font-semibold flex items-center gap-2 border-b-2 transition-colors ${active ? 'text-white border-brand-500 bg-brand-500/10' : 'text-portal-soft border-transparent hover:text-white hover:bg-white/[0.03]'}`}>
                        <Icon className="w-4 h-4" /> {tab.label}
                      </button>
                    );
                  })}
                </div>

                <div className="p-5 space-y-4">
                  {activeTab === 'issues' && issues.map((issue, idx) => {
                    const sev = severityStyles[issue.severity] || severityStyles.medium;
                    const Icon = sev.icon;
                    return (
                      <div key={idx} className="p-5 rounded-xl bg-portal-surface2 border border-white/[0.07] border-l-4" style={{ borderLeftColor: sev.border }}>
                        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
                          <div className="flex items-start gap-3">
                            <Icon className="w-5 h-5 shrink-0 mt-0.5" style={{ color: sev.border }} />
                            <div>
                              <div className="flex flex-wrap items-center gap-2 mb-2">
                                <span className={`px-2 py-1 text-xs font-bold rounded-full border ${sev.badge}`}>{sev.label}</span>
                                {issue.category && <span className="px-2 py-1 text-xs rounded-full bg-white/[0.06] text-portal-soft border border-white/[0.07]">{issue.category}</span>}
                                {issue.effort && <span className="px-2 py-1 text-xs rounded-full bg-white/[0.06] text-portal-soft border border-white/[0.07]">Effort: {issue.effort}</span>}
                              </div>
                              <p className="font-semibold text-white">{issue.message}</p>
                              {issue.evidence && <p className="text-sm text-portal-soft mt-2">Evidence: {issue.evidence}</p>}
                              {issue.impact && <p className="text-sm text-portal-soft mt-2">Impact: {issue.impact}</p>}
                              <p className="text-sm text-portal-soft mt-3"><span className="text-white font-semibold">Fix:</span> {issue.recommendation}</p>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}

                  {activeTab === 'quickWins' && (
                    quickWins.length ? quickWins.map((win, index) => (
                      <div key={index} className="flex items-start gap-3 p-4 rounded-xl bg-green-500/10 border border-green-500/20 text-green-100">
                        <Zap className="w-5 h-5 mt-0.5 shrink-0" />
                        <p>{win}</p>
                      </div>
                    )) : <p className="text-portal-soft">No low-effort wins returned. Brutal, but probably honest.</p>
                  )}

                  {activeTab === 'actions' && (
                    <div className="space-y-3">
                      {actions.map((action, index) => (
                        <div key={index} className="flex items-start gap-4 p-4 rounded-xl bg-portal-surface2 border border-white/[0.07]">
                          <div className="w-8 h-8 rounded-full bg-brand-500 text-white flex items-center justify-center font-bold shrink-0">{index + 1}</div>
                          <p className="text-portal-text pt-1">{action}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="h-full min-h-[520px] flex flex-col items-center justify-center text-portal-soft bg-portal-surface rounded-2xl border border-white/[0.07] shadow-lg shadow-black/20 p-8 text-center">
              <div className="w-16 h-16 bg-portal-surface2 rounded-full flex items-center justify-center mb-4">
                <Target className="w-8 h-8 text-portal-text" />
              </div>
              <p className="font-semibold text-white">Ready to audit</p>
              <p className="text-sm max-w-md mt-2">Use URL Audit for live pages, Content Audit for pasted copy, or Technical Review for crawl notes and implementation checks.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AuditTool;
