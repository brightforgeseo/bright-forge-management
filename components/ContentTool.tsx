import React, { useState } from 'react';
import { PenTool, Copy, Check, Sparkles, Zap, Star, FileText } from 'lucide-react';
import { generateContent } from '../services/geminiService';
import { ContentResult } from '../types';

type ContentMode = 'edit' | 'full';

const MODE_CONFIG: Record<ContentMode, {
  label: string;
  description: string;
  badge: string;
  badgeColor: string;
  icon: React.ReactNode;
  time: string;
}> = {
  edit: {
    label: 'Fast Draft',
    description: 'Echo drafts → Gemma edits. Ready in ~30s.',
    badge: 'Fast',
    badgeColor: 'bg-emerald-500/20 text-emerald-400',
    icon: <Zap className="w-4 h-4" />,
    time: '~30s',
  },
  full: {
    label: 'Full Article',
    description: 'Echo outlines → Sassin writes. Higher quality, ~90s.',
    badge: 'Quality',
    badgeColor: 'bg-brand-500/20 text-brand-400',
    icon: <Star className="w-4 h-4" />,
    time: '~90s',
  },
};

const ContentTool: React.FC = () => {
  const [topic, setTopic] = useState('');
  const [keywords, setKeywords] = useState('');
  const [tone, setTone] = useState('Professional');
  const [mode, setMode] = useState<ContentMode>('edit');
  const [loading, setLoading] = useState(false);
  const [loadingMsg, setLoadingMsg] = useState('');
  const [result, setResult] = useState<ContentResult | null>(null);
  const [draft, setDraft] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'final' | 'draft'>('final');
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleGenerate = async () => {
    if (!topic.trim()) return;
    setLoading(true);
    setError(null);
    setResult(null);
    setDraft(null);
    setActiveTab('final');

    const msgs = mode === 'full'
      ? ['Echo is building the outline…', 'Sassin is writing the full article…', 'Wrapping up…']
      : ['Echo is drafting the article…', 'Gemma is editing and polishing…', 'Almost done…'];

    let msgIdx = 0;
    setLoadingMsg(msgs[0]);
    const ticker = setInterval(() => {
      msgIdx = Math.min(msgIdx + 1, msgs.length - 1);
      setLoadingMsg(msgs[msgIdx]);
    }, mode === 'full' ? 30000 : 15000);

    try {
      const data = await (generateContent as any)(topic, tone, keywords, mode);
      setResult(data);
      // Try to grab the raw draft if the bridge returned it
      // (bridge returns { content, draft, mode } — but service unwraps to ContentResult)
      // For now show outline/draft tab only if we have it
    } catch (err: any) {
      setError(err?.message || 'Content generation failed. Check that the bridge is running.');
    } finally {
      clearInterval(ticker);
      setLoading(false);
      setLoadingMsg('');
    }
  };

  const handleCopy = () => {
    if (!result) return;
    const text = result.title ? `# ${result.title}\n\n${result.content}` : result.content;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="p-8 max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-8">
      {/* Input Column */}
      <div className="lg:col-span-1 space-y-6">
        <div className="space-y-2">
          <h2 className="text-3xl font-bold text-white">Content Generator</h2>
          <p className="text-portal-soft">Create SEO-optimized articles using local AI — zero API cost.</p>
        </div>

        <div className="bg-portal-surface p-6 rounded-2xl shadow-lg shadow-black/20 border border-white/[0.07] space-y-5">
          {/* Mode toggle */}
          <div>
            <label className="block text-sm font-medium text-portal-text mb-3">Pipeline Mode</label>
            <div className="grid grid-cols-2 gap-2">
              {(Object.keys(MODE_CONFIG) as ContentMode[]).map((m) => {
                const cfg = MODE_CONFIG[m];
                const active = mode === m;
                return (
                  <button
                    key={m}
                    onClick={() => setMode(m)}
                    className={`relative flex flex-col items-start gap-1 p-3 rounded-xl border text-left transition-all ${
                      active
                        ? 'border-brand-500 bg-brand-500/10'
                        : 'border-white/[0.07] hover:border-white/20 bg-portal-dark/50'
                    }`}
                  >
                    <div className="flex items-center gap-2 w-full">
                      <span className={`${active ? 'text-brand-400' : 'text-portal-soft'}`}>{cfg.icon}</span>
                      <span className={`text-sm font-semibold ${active ? 'text-white' : 'text-portal-text'}`}>{cfg.label}</span>
                      <span className={`ml-auto text-xs font-medium px-1.5 py-0.5 rounded-full ${cfg.badgeColor}`}>{cfg.time}</span>
                    </div>
                    <p className="text-xs text-portal-soft leading-snug">{cfg.description}</p>
                    {active && (
                      <span className="absolute top-2 right-2 w-2 h-2 rounded-full bg-brand-500" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Topic */}
          <div>
            <label className="block text-sm font-medium text-portal-text mb-2">Topic / Title</label>
            <input
              className="w-full p-3 rounded-xl border border-white/[0.07] focus:ring-2 focus:ring-brand-500 outline-none bg-white text-slate-900"
              placeholder="e.g. SEO Agency Philippines"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !loading && topic.trim() && handleGenerate()}
            />
          </div>

          {/* Keywords */}
          <div>
            <label className="block text-sm font-medium text-portal-text mb-2">Target Keywords</label>
            <input
              className="w-full p-3 rounded-xl border border-white/[0.07] focus:ring-2 focus:ring-brand-500 outline-none bg-white text-slate-900"
              placeholder="seo agency philippines, best seo company"
              value={keywords}
              onChange={(e) => setKeywords(e.target.value)}
            />
          </div>

          {/* Tone */}
          <div>
            <label className="block text-sm font-medium text-portal-text mb-2">Tone of Voice</label>
            <select
              className="w-full p-3 rounded-xl border border-white/[0.07] focus:ring-2 focus:ring-brand-500 outline-none bg-portal-surface text-portal-text"
              value={tone}
              onChange={(e) => setTone(e.target.value)}
            >
              <option>Professional</option>
              <option>Casual</option>
              <option>Enthusiastic</option>
              <option>Informative</option>
              <option>Persuasive</option>
            </select>
          </div>

          <button
            onClick={handleGenerate}
            disabled={loading || !topic.trim()}
            className="w-full py-4 bg-brand-600 hover:bg-brand-700 text-white rounded-xl font-bold shadow-lg shadow-brand-600/20 disabled:opacity-50 transition-all flex items-center justify-center gap-2 mt-2"
          >
            {loading
              ? <div className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent" />
              : <Sparkles className="w-5 h-5" />}
            {loading ? loadingMsg : 'Generate Article'}
          </button>
        </div>

        {/* Mode info card */}
        <div className="bg-portal-dark/60 border border-white/[0.05] rounded-xl p-4 text-xs text-portal-soft space-y-1">
          <p className="font-semibold text-portal-text">How it works</p>
          {mode === 'edit' ? (
            <>
              <p>1. <span className="text-portal-text">Little Echo</span> writes a full draft</p>
              <p>2. <span className="text-portal-text">Gemma 4B</span> edits and polishes</p>
              <p className="text-emerald-400">Fast — good for quick turnarounds</p>
            </>
          ) : (
            <>
              <p>1. <span className="text-portal-text">Little Echo</span> builds a structured outline</p>
              <p>2. <span className="text-portal-text">Little Sassin</span> writes the full article</p>
              <p className="text-brand-400">Slower — better quality, longer articles</p>
            </>
          )}
        </div>
      </div>

      {/* Output Column */}
      <div className="lg:col-span-2">
        {loading && !result && (
          <div className="h-full min-h-[400px] flex flex-col items-center justify-center text-portal-soft border-2 border-dashed border-brand-500/30 rounded-2xl bg-portal-dark/50 gap-4">
            <div className="animate-spin rounded-full h-10 w-10 border-2 border-brand-500 border-t-transparent" />
            <p className="text-portal-text font-medium">{loadingMsg}</p>
            <p className="text-xs opacity-60">This takes {MODE_CONFIG[mode].time} — hang tight</p>
          </div>
        )}

        {error && !loading && (
          <div className="h-full min-h-[200px] flex flex-col items-center justify-center gap-3 border-2 border-red-500/30 rounded-2xl bg-red-500/5 p-8 text-center">
            <p className="text-red-400 font-semibold">Generation failed</p>
            <p className="text-sm text-portal-soft">{error}</p>
            <p className="text-xs text-portal-soft">Make sure the portal bridge is running and LM Studio models are loaded.</p>
          </div>
        )}

        {result && !loading && (
          <div className="bg-portal-surface rounded-2xl shadow-lg shadow-black/20 border border-white/[0.07] overflow-hidden h-full flex flex-col">
            {/* Header */}
            <div className="p-4 border-b border-white/[0.07] flex justify-between items-center bg-portal-dark gap-4">
              {/* Tabs */}
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setActiveTab('final')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                    activeTab === 'final' ? 'bg-brand-500/20 text-brand-400' : 'text-portal-soft hover:text-portal-text'
                  }`}
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  Final
                </button>
                {draft && (
                  <button
                    onClick={() => setActiveTab('draft')}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                      activeTab === 'draft' ? 'bg-brand-500/20 text-brand-400' : 'text-portal-soft hover:text-portal-text'
                    }`}
                  >
                    <FileText className="w-3.5 h-3.5" />
                    {mode === 'full' ? 'Outline' : 'Draft'}
                  </button>
                )}
              </div>

              <div className="flex items-center gap-2 ml-auto">
                <span className={`text-xs font-medium px-2 py-1 rounded-full ${MODE_CONFIG[mode].badgeColor}`}>
                  {MODE_CONFIG[mode].label}
                </span>
                <button
                  onClick={handleCopy}
                  className="flex items-center gap-2 text-sm font-medium text-brand-400 hover:bg-brand-500/10 px-3 py-1.5 rounded-lg transition-colors"
                >
                  {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  {copied ? 'Copied!' : 'Copy Markdown'}
                </button>
              </div>
            </div>

            {/* Content */}
            <div className="p-8 overflow-y-auto max-h-[800px] prose prose-slate max-w-none">
              {activeTab === 'final' ? (
                <>
                  {result.title && (
                    <h1 className="text-2xl font-bold text-white mb-3">{result.title}</h1>
                  )}
                  {result.metaDescription && (
                    <div className="bg-yellow-50 border border-yellow-100 p-4 rounded-lg mb-6 text-sm text-yellow-800">
                      <strong>Meta Description:</strong> {result.metaDescription}
                    </div>
                  )}
                  <div className="whitespace-pre-wrap text-portal-text leading-relaxed">
                    {result.content}
                  </div>
                </>
              ) : (
                <div className="whitespace-pre-wrap text-portal-text leading-relaxed text-sm font-mono">
                  {draft}
                </div>
              )}
            </div>
          </div>
        )}

        {!result && !loading && !error && (
          <div className="h-full min-h-[400px] flex flex-col items-center justify-center text-portal-soft border-2 border-dashed border-white/[0.07] rounded-2xl bg-portal-dark/50">
            <PenTool className="w-12 h-12 mb-4 opacity-50" />
            <p className="text-lg font-medium">Your content will appear here</p>
            <p className="text-sm">Fill in the details on the left to get started</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default ContentTool;
