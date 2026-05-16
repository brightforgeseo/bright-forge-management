import React, { useMemo, useState } from 'react';
import {
  Activity,
  BarChart3,
  Check,
  ClipboardList,
  Copy,
  Download,
  FileText,
  Globe2,
  HelpCircle,
  Layers,
  Search,
  Send,
  SlidersHorizontal,
  Sparkles,
  Target,
} from 'lucide-react';
import { AreaChart, Area, ResponsiveContainer } from 'recharts';
import { generateKeywords } from '../services/geminiService';
import { KeywordResearchOptions, KeywordResult } from '../types';

type ResultTab = 'keywords' | 'clusters' | 'questions' | 'contentPlan';
type KeywordMode = NonNullable<KeywordResearchOptions['mode']>;

interface KeywordToolProps {
  onNavigateToContent?: () => void;
}

const MODE_OPTIONS: { value: KeywordMode; label: string; description: string }[] = [
  { value: 'related', label: 'Keyword Ideas', description: 'Commercial and supporting opportunities' },
  { value: 'long_tail', label: 'Long-tail', description: 'Lower competition phrase expansion' },
  { value: 'questions', label: 'Questions', description: 'FAQ and People Also Ask style ideas' },
  { value: 'content_plan', label: 'Content Plan', description: 'Clusters, page types and angles' },
  { value: 'competitor_gap', label: 'Competitor Gap', description: 'Needs domain and competitor inputs' },
];

const SOURCE_OPTIONS = [
  { value: 'us', label: 'United States' },
  { value: 'uk', label: 'United Kingdom' },
  { value: 'ca', label: 'Canada' },
  { value: 'au', label: 'Australia' },
  { value: 'ph', label: 'Philippines' },
];

const TAB_CONFIG: { id: ResultTab; label: string; icon: React.ReactNode }[] = [
  { id: 'keywords', label: 'Keywords', icon: <BarChart3 className="w-4 h-4" /> },
  { id: 'clusters', label: 'Clusters', icon: <Layers className="w-4 h-4" /> },
  { id: 'questions', label: 'Questions', icon: <HelpCircle className="w-4 h-4" /> },
  { id: 'contentPlan', label: 'Content Plan', icon: <FileText className="w-4 h-4" /> },
];

const formatNumber = (value?: number) => Number(value || 0).toLocaleString();
const formatCurrency = (value?: number) => typeof value === 'number' ? `$${value.toFixed(2)}` : '—';
const scoreOf = (row: KeywordResult) => Number(row.opportunityScore ?? 0);

const difficultyClass = (difficulty?: string) => {
  const value = String(difficulty || '').toLowerCase();
  if (value.includes('high')) return 'bg-red-500/15 text-red-300 border-red-500/30';
  if (value.includes('medium')) return 'bg-amber-500/15 text-amber-300 border-amber-500/30';
  return 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30';
};

const priorityClass = (priority?: string) => {
  const value = String(priority || '').toLowerCase();
  if (value.includes('quick')) return 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30';
  if (value.includes('build')) return 'bg-brand-500/15 text-brand-300 border-brand-500/30';
  if (value.includes('ignore')) return 'bg-red-500/15 text-red-300 border-red-500/30';
  return 'bg-slate-500/15 text-slate-300 border-white/[0.07]';
};

const csvEscape = (value: unknown) => {
  const text = Array.isArray(value) ? value.join('; ') : String(value ?? '');
  return `"${text.replace(/"/g, '""')}"`;
};

const isQuestionKeyword = (row: KeywordResult) => {
  const keyword = row.keyword.toLowerCase();
  return /^(who|what|where|when|why|how|can|should|does|do|is|are)\b/.test(keyword)
    || keyword.includes(' near me')
    || String(row.recommendedUse || '').toLowerCase().includes('faq')
    || String(row.intent || '').toLowerCase().includes('informational');
};

const KeywordTool: React.FC<KeywordToolProps> = ({ onNavigateToContent }) => {
  const [seed, setSeed] = useState('');
  const [source, setSource] = useState('us');
  const [mode, setMode] = useState<KeywordMode>('related');
  const [limit, setLimit] = useState(10);
  const [domain, setDomain] = useState('');
  const [competitors, setCompetitors] = useState('');
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<KeywordResult[]>([]);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState<ResultTab>('keywords');
  const [copied, setCopied] = useState<string | null>(null);
  const [lastRun, setLastRun] = useState<{ seed: string; source: string; mode: KeywordMode } | null>(null);

  const clusters = useMemo(() => {
    return results.reduce<Record<string, KeywordResult[]>>((acc, row) => {
      const cluster = row.cluster || 'General Opportunities';
      acc[cluster] = acc[cluster] || [];
      acc[cluster].push(row);
      return acc;
    }, {});
  }, [results]);

  const questions = useMemo(() => results.filter(isQuestionKeyword), [results]);

  const planGroups = useMemo(() => {
    return results.reduce<Record<string, KeywordResult[]>>((acc, row) => {
      const use = row.recommendedUse || 'Supporting Article';
      acc[use] = acc[use] || [];
      acc[use].push(row);
      return acc;
    }, {});
  }, [results]);

  const summary = useMemo(() => {
    const top = [...results].sort((a, b) => scoreOf(b) - scoreOf(a))[0] || results[0];
    const avgVolume = results.length ? Math.round(results.reduce((acc, row) => acc + (row.searchVolume || 0), 0) / results.length) : 0;
    const avgCpcRows = results.filter((row) => typeof row.cpc === 'number');
    const avgCpc = avgCpcRows.length ? avgCpcRows.reduce((acc, row) => acc + Number(row.cpc || 0), 0) / avgCpcRows.length : undefined;
    const quickWins = results.filter((row) => String(row.priority || '').toLowerCase().includes('quick') || scoreOf(row) >= 70).length;
    return { top, avgVolume, avgCpc, quickWins };
  }, [results]);

  const handleAnalyze = async () => {
    if (!seed.trim()) return;
    setLoading(true);
    setError('');
    setResults([]);
    setActiveTab('keywords');

    const options: KeywordResearchOptions = {
      source,
      mode,
      limit,
      domain: domain.trim() || undefined,
      competitors: competitors.split(',').map((item) => item.trim()).filter(Boolean),
    };

    try {
      const data = await generateKeywords(seed.trim(), options);
      setResults(data);
      setLastRun({ seed: seed.trim(), source, mode });
      if (!data.length) setError('The bridge returned no keyword rows. Try a broader seed or a different mode.');
    } catch (err: any) {
      setError(err?.message || 'Keyword research failed. Check that the bridge is running, then try again.');
    } finally {
      setLoading(false);
    }
  };

  const copyText = async (key: string, text: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 1800);
  };

  const exportCsv = () => {
    if (!results.length) return;
    const headers = ['keyword', 'searchVolume', 'difficulty', 'competition', 'intent', 'cpc', 'opportunityScore', 'priority', 'cluster', 'recommendedUse', 'reason', 'contentAngle', 'serpFeatures'];
    const rows = results.map((row) => headers.map((header) => csvEscape((row as any)[header])).join(','));
    const csv = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${(lastRun?.seed || seed || 'keywords').replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-keyword-research.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const sendToContentTool = () => {
    if (!results.length) return;
    const primary = summary.top || results[0];
    const payload = {
      topic: primary.keyword,
      keywords: results.slice(0, 8).map((row) => row.keyword).join(', '),
      aiPrompt: [
        primary.contentAngle ? `Use this content angle: ${primary.contentAngle}` : '',
        primary.reason ? `SEO rationale: ${primary.reason}` : '',
        `Recommended use: ${primary.recommendedUse || 'Supporting Article'}`,
        `Seed keyword: ${lastRun?.seed || seed}`,
      ].filter(Boolean).join('\n'),
    };
    try {
      localStorage.setItem('keywordResearchContentSeed', JSON.stringify(payload));
      window.dispatchEvent(new CustomEvent('keywordResearchContentSeed', { detail: payload }));
    } catch {}
    onNavigateToContent?.();
  };

  const copyTaskBrief = () => {
    const brief = [
      `Keyword research follow-up: ${lastRun?.seed || seed}`,
      '',
      `Source: ${(lastRun?.source || source).toUpperCase()}`,
      `Mode: ${(lastRun?.mode || mode).replace('_', ' ')}`,
      '',
      'Priority keywords:',
      ...results.slice(0, 10).map((row, index) => `${index + 1}. ${row.keyword} — ${formatNumber(row.searchVolume)} searches, ${row.difficulty}, ${row.priority || 'Review'}`),
      '',
      'Recommended actions:',
      ...Object.entries(planGroups).map(([use, rows]) => `- ${use}: ${rows.slice(0, 4).map((row) => row.keyword).join(', ')}`),
    ].join('\n');
    copyText('task', brief);
  };

  const renderKeywordRow = (row: KeywordResult, idx: number) => (
    <tr key={`${row.keyword}-${idx}`} className="hover:bg-portal-dark/70 transition-colors align-top">
      <td className="px-4 py-4 min-w-[260px]">
        <div className="space-y-2">
          <div className="flex items-start gap-2">
            <span className="font-semibold text-white leading-snug">{row.keyword}</span>
            {row.opportunityScore !== undefined && (
              <span className="shrink-0 px-2 py-0.5 rounded-full bg-brand-500/15 text-brand-300 text-[11px] border border-brand-500/20">
                {Math.round(Number(row.opportunityScore))}
              </span>
            )}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {row.intent && <span className="px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-300 text-[11px] border border-blue-500/20">{row.intent}</span>}
            {row.priority && <span className={`px-2 py-0.5 rounded-full text-[11px] border ${priorityClass(row.priority)}`}>{row.priority}</span>}
            {row.recommendedUse && <span className="px-2 py-0.5 rounded-full bg-white/[0.04] text-portal-soft text-[11px] border border-white/[0.07]">{row.recommendedUse}</span>}
          </div>
          {(row.reason || row.contentAngle) && (
            <p className="text-xs text-portal-soft leading-relaxed max-w-xl">
              {row.reason || row.contentAngle}
            </p>
          )}
        </div>
      </td>
      <td className="px-4 py-4 text-portal-text whitespace-nowrap">{formatNumber(row.searchVolume)}</td>
      <td className="px-4 py-4 whitespace-nowrap">{formatCurrency(row.cpc)}</td>
      <td className="px-4 py-4 whitespace-nowrap">
        <span className={`px-2 py-1 rounded-full text-xs font-semibold border ${difficultyClass(row.difficulty)}`}>
          {row.difficulty || 'Medium'}
        </span>
      </td>
      <td className="px-4 py-4 min-w-[110px]">
        <div className="flex items-center gap-2">
          <div className="flex-1 bg-portal-surface2 rounded-full h-1.5 overflow-hidden">
            <div className="bg-brand-600 h-1.5 rounded-full" style={{ width: `${Math.max(0, Math.min(100, row.competition || 0))}%` }} />
          </div>
          <span className="text-xs text-portal-soft w-8 text-right">{Math.round(row.competition || 0)}</span>
        </div>
      </td>
      <td className="px-4 py-4 min-w-[150px]">
        <div className="h-10 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={(row.trend || []).map((val, i) => ({ i, val }))}>
              <Area type="monotone" dataKey="val" stroke="#ea580c" fill="#ea580c22" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </td>
      <td className="px-4 py-4 min-w-[180px]">
        <div className="flex flex-wrap gap-1">
          {(row.serpFeatures || []).slice(0, 4).map((feature) => (
            <span key={feature} className="px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-300 text-[11px] border border-purple-500/20">{feature}</span>
          ))}
        </div>
      </td>
      <td className="px-4 py-4 text-right">
        <button
          onClick={() => copyText(row.keyword, row.keyword)}
          className="p-2 rounded-lg text-portal-soft hover:text-white hover:bg-white/[0.06] transition-colors"
          title="Copy keyword"
        >
          {copied === row.keyword ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
        </button>
      </td>
    </tr>
  );

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8">
      <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4">
        <div className="space-y-2">
          <h2 className="text-3xl font-bold text-white">Keyword Research</h2>
          <p className="text-portal-soft">Bridge-powered keyword research with SE Ranking data, clusters and content actions.</p>
        </div>
        {lastRun && (
          <div className="text-xs text-portal-soft bg-portal-surface border border-white/[0.07] rounded-xl px-3 py-2">
            Last run: <span className="text-white font-medium">{lastRun.seed}</span> · {lastRun.source.toUpperCase()} · {lastRun.mode.replace('_', ' ')}
          </div>
        )}
      </div>

      <div className="bg-portal-surface p-6 rounded-2xl shadow-lg shadow-black/20 border border-white/[0.07] space-y-5">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          <div className="lg:col-span-5">
            <label className="block text-sm font-medium text-portal-text mb-2">Seed Keyword</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-portal-soft w-5 h-5" />
              <input
                type="text"
                value={seed}
                onChange={(e) => setSeed(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && !loading && handleAnalyze()}
                className="w-full pl-10 pr-4 py-3 rounded-xl border border-white/[0.07] focus:ring-2 focus:ring-brand-500 focus:border-transparent outline-none transition-all bg-white text-slate-900 placeholder-slate-400"
                placeholder="e.g. plumber seo"
              />
            </div>
          </div>

          <div className="lg:col-span-3">
            <label className="block text-sm font-medium text-portal-text mb-2">Country</label>
            <div className="relative">
              <Globe2 className="absolute left-3 top-1/2 -translate-y-1/2 text-portal-soft w-4 h-4" />
              <select value={source} onChange={(e) => setSource(e.target.value)} className="w-full pl-9 pr-4 py-3 rounded-xl border border-white/[0.07] bg-portal-dark text-portal-text outline-none focus:ring-2 focus:ring-brand-500">
                {SOURCE_OPTIONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
              </select>
            </div>
          </div>

          <div className="lg:col-span-2">
            <label className="block text-sm font-medium text-portal-text mb-2">Keyword Count</label>
            <select value={limit} onChange={(e) => setLimit(Number(e.target.value))} className="w-full px-4 py-3 rounded-xl border border-white/[0.07] bg-portal-dark text-portal-text outline-none focus:ring-2 focus:ring-brand-500">
              {[5, 7, 10, 15, 25, 50].map((count) => <option key={count} value={count}>{count}</option>)}
            </select>
          </div>

          <div className="lg:col-span-2 flex items-end">
            <button
              onClick={handleAnalyze}
              disabled={loading || !seed.trim()}
              className="w-full px-6 py-3 bg-brand-600 hover:bg-brand-700 text-white rounded-xl font-semibold shadow-lg shadow-brand-600/20 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
            >
              {loading ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Activity className="w-5 h-5" />}
              {loading ? 'Researching…' : 'Analyze'}
            </button>
          </div>
        </div>

        <div>
          <label className="flex items-center gap-2 text-sm font-medium text-portal-text mb-3"><SlidersHorizontal className="w-4 h-4" /> Research Mode</label>
          <div className="grid grid-cols-1 md:grid-cols-5 gap-2">
            {MODE_OPTIONS.map((item) => {
              const active = mode === item.value;
              return (
                <button
                  key={item.value}
                  type="button"
                  onClick={() => setMode(item.value)}
                  className={`relative text-left p-3 rounded-xl border transition-all ${active ? 'border-brand-500 bg-brand-500/10' : 'border-white/[0.07] hover:border-white/20 bg-portal-dark/50'}`}
                >
                  <p className={`text-sm font-semibold ${active ? 'text-white' : 'text-portal-text'}`}>{item.label}</p>
                  <p className="text-xs text-portal-soft mt-1 leading-snug">{item.description}</p>
                  {active && <span className="absolute top-2 right-2 w-2 h-2 rounded-full bg-brand-500" />}
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-portal-text mb-2">Your Domain <span className="text-portal-soft font-normal">(optional)</span></label>
            <div className="relative">
              <Target className="absolute left-3 top-1/2 -translate-y-1/2 text-portal-soft w-4 h-4" />
              <input
                value={domain}
                onChange={(e) => setDomain(e.target.value)}
                className="w-full pl-9 pr-4 py-3 rounded-xl border border-white/[0.07] bg-white text-slate-900 placeholder-slate-400 outline-none focus:ring-2 focus:ring-brand-500"
                placeholder="example.com"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-portal-text mb-2">Competitor Domains <span className="text-portal-soft font-normal">(comma separated)</span></label>
            <input
              value={competitors}
              onChange={(e) => setCompetitors(e.target.value)}
              className="w-full px-4 py-3 rounded-xl border border-white/[0.07] bg-white text-slate-900 placeholder-slate-400 outline-none focus:ring-2 focus:ring-brand-500"
              placeholder="competitor1.com, competitor2.com"
            />
          </div>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-red-500/10 text-red-300 rounded-xl border border-red-500/20">
          {error}
        </div>
      )}

      {loading && (
        <div className="min-h-[320px] border-2 border-dashed border-brand-500/30 rounded-2xl bg-portal-dark/50 flex flex-col items-center justify-center gap-4 text-center">
          <div className="animate-spin rounded-full h-10 w-10 border-2 border-brand-500 border-t-transparent" />
          <div>
            <p className="text-portal-text font-semibold">Hermes is checking keyword data…</p>
            <p className="text-sm text-portal-soft mt-1">The bridge can use SE Ranking MCP tools, so this may take a minute.</p>
          </div>
        </div>
      )}

      {results.length > 0 && !loading && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-portal-surface p-5 rounded-2xl shadow-lg shadow-black/20 border border-white/[0.07]">
              <p className="text-sm text-portal-soft mb-1">Top Opportunity</p>
              <h3 className="text-lg font-bold text-white leading-snug">{summary.top?.keyword}</h3>
              <span className={`inline-block mt-3 px-2 py-1 rounded-full text-xs border ${priorityClass(summary.top?.priority)}`}>{summary.top?.priority || 'Review'}</span>
            </div>
            <div className="bg-portal-surface p-5 rounded-2xl shadow-lg shadow-black/20 border border-white/[0.07]">
              <p className="text-sm text-portal-soft mb-1">Avg Search Volume</p>
              <h3 className="text-2xl font-bold text-white">{formatNumber(summary.avgVolume)}</h3>
              <p className="text-xs text-portal-soft mt-2">Across {results.length} returned rows</p>
            </div>
            <div className="bg-portal-surface p-5 rounded-2xl shadow-lg shadow-black/20 border border-white/[0.07]">
              <p className="text-sm text-portal-soft mb-1">Avg CPC</p>
              <h3 className="text-2xl font-bold text-white">{formatCurrency(summary.avgCpc)}</h3>
              <p className="text-xs text-portal-soft mt-2">Commercial value signal</p>
            </div>
            <div className="bg-portal-surface p-5 rounded-2xl shadow-lg shadow-black/20 border border-white/[0.07]">
              <p className="text-sm text-portal-soft mb-1">Quick Wins</p>
              <h3 className="text-2xl font-bold text-white">{summary.quickWins}</h3>
              <p className="text-xs text-portal-soft mt-2">Priority or 70+ opportunity score</p>
            </div>
          </div>

          <div className="bg-portal-surface rounded-2xl shadow-lg shadow-black/20 border border-white/[0.07] overflow-hidden">
            <div className="p-4 border-b border-white/[0.07] bg-portal-dark flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
              <div className="flex flex-wrap items-center gap-1.5">
                {TAB_CONFIG.map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${activeTab === tab.id ? 'bg-brand-500/20 text-brand-400' : 'text-portal-soft hover:text-portal-text hover:bg-white/[0.04]'}`}
                  >
                    {tab.icon}
                    {tab.label}
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button onClick={() => copyText('all', results.map((row) => row.keyword).join(', '))} className="flex items-center gap-2 text-sm font-medium text-portal-soft hover:text-white hover:bg-white/[0.06] px-3 py-2 rounded-lg transition-colors">
                  {copied === 'all' ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                  Copy Keywords
                </button>
                <button onClick={exportCsv} className="flex items-center gap-2 text-sm font-medium text-portal-soft hover:text-white hover:bg-white/[0.06] px-3 py-2 rounded-lg transition-colors">
                  <Download className="w-4 h-4" /> Export CSV
                </button>
                <button onClick={copyTaskBrief} className="flex items-center gap-2 text-sm font-medium text-portal-soft hover:text-white hover:bg-white/[0.06] px-3 py-2 rounded-lg transition-colors">
                  {copied === 'task' ? <Check className="w-4 h-4 text-emerald-400" /> : <ClipboardList className="w-4 h-4" />}
                  Task Brief
                </button>
                <button onClick={sendToContentTool} className="flex items-center gap-2 text-sm font-semibold text-white bg-brand-600 hover:bg-brand-700 px-3 py-2 rounded-lg transition-colors">
                  <Send className="w-4 h-4" /> Send to Content
                </button>
              </div>
            </div>

            {activeTab === 'keywords' && (
              <div className="overflow-x-auto">
                <table className="w-full text-left min-w-[1180px]">
                  <thead className="bg-portal-dark border-b border-white/[0.07]">
                    <tr>
                      <th className="px-4 py-4 text-xs font-semibold text-portal-soft uppercase tracking-wider">Keyword</th>
                      <th className="px-4 py-4 text-xs font-semibold text-portal-soft uppercase tracking-wider">Volume</th>
                      <th className="px-4 py-4 text-xs font-semibold text-portal-soft uppercase tracking-wider">CPC</th>
                      <th className="px-4 py-4 text-xs font-semibold text-portal-soft uppercase tracking-wider">Diff</th>
                      <th className="px-4 py-4 text-xs font-semibold text-portal-soft uppercase tracking-wider">Comp</th>
                      <th className="px-4 py-4 text-xs font-semibold text-portal-soft uppercase tracking-wider">Trend</th>
                      <th className="px-4 py-4 text-xs font-semibold text-portal-soft uppercase tracking-wider">SERP Features</th>
                      <th className="px-4 py-4 text-xs font-semibold text-portal-soft uppercase tracking-wider text-right">Copy</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/[0.06]">
                    {results.map(renderKeywordRow)}
                  </tbody>
                </table>
              </div>
            )}

            {activeTab === 'clusters' && (
              <div className="p-5 grid grid-cols-1 lg:grid-cols-2 gap-4">
                {Object.entries(clusters).map(([cluster, rows]) => (
                  <div key={cluster} className="rounded-2xl border border-white/[0.07] bg-portal-dark/50 p-4 space-y-3">
                    <div className="flex items-center justify-between gap-3">
                      <h3 className="font-bold text-white">{cluster}</h3>
                      <span className="text-xs text-portal-soft">{rows.length} keywords</span>
                    </div>
                    <div className="space-y-2">
                      {rows.sort((a, b) => scoreOf(b) - scoreOf(a)).map((row) => (
                        <div key={row.keyword} className="flex items-center justify-between gap-3 rounded-xl bg-portal-surface/80 border border-white/[0.05] px-3 py-2">
                          <div>
                            <p className="text-sm font-semibold text-portal-text">{row.keyword}</p>
                            <p className="text-xs text-portal-soft">{row.recommendedUse || 'Supporting Article'} · {formatNumber(row.searchVolume)} searches</p>
                          </div>
                          <span className="text-sm font-bold text-brand-400">{Math.round(scoreOf(row) || 0)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {activeTab === 'questions' && (
              <div className="p-5 space-y-3">
                {(questions.length ? questions : results.filter((row) => String(row.recommendedUse || '').toLowerCase().includes('faq'))).map((row) => (
                  <div key={row.keyword} className="rounded-2xl border border-white/[0.07] bg-portal-dark/50 p-4 flex flex-col md:flex-row md:items-start md:justify-between gap-3">
                    <div>
                      <p className="font-semibold text-white">{row.keyword}</p>
                      <p className="text-sm text-portal-soft mt-1">{row.contentAngle || row.reason || 'Use this as an FAQ, explainer section or supporting article.'}</p>
                    </div>
                    <div className="flex flex-wrap gap-2 shrink-0">
                      <span className="px-2 py-1 rounded-full bg-white/[0.04] text-portal-soft text-xs border border-white/[0.07]">{formatNumber(row.searchVolume)} searches</span>
                      <span className={`px-2 py-1 rounded-full text-xs border ${difficultyClass(row.difficulty)}`}>{row.difficulty}</span>
                    </div>
                  </div>
                ))}
                {!questions.length && <p className="text-sm text-portal-soft">No clear question keywords were returned. Try Questions mode for a better FAQ set.</p>}
              </div>
            )}

            {activeTab === 'contentPlan' && (
              <div className="p-5 space-y-4">
                {Object.entries(planGroups).map(([use, rows]) => (
                  <div key={use} className="rounded-2xl border border-white/[0.07] bg-portal-dark/50 p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <Sparkles className="w-4 h-4 text-brand-400" />
                      <h3 className="font-bold text-white">{use}</h3>
                    </div>
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                      {rows.map((row) => (
                        <div key={row.keyword} className="rounded-xl bg-portal-surface/80 border border-white/[0.05] p-3">
                          <p className="font-semibold text-portal-text">{row.keyword}</p>
                          <p className="text-xs text-portal-soft mt-1 leading-relaxed">{row.contentAngle || row.reason || 'Create content that satisfies the search intent and links to the relevant money page.'}</p>
                          <div className="flex flex-wrap gap-1.5 mt-3">
                            <span className="px-2 py-0.5 rounded-full bg-brand-500/10 text-brand-300 text-[11px] border border-brand-500/20">{row.intent || 'Intent TBD'}</span>
                            <span className={`px-2 py-0.5 rounded-full text-[11px] border ${priorityClass(row.priority)}`}>{row.priority || 'Review'}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default KeywordTool;
