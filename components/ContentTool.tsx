import React, { useState } from 'react';
import { PenTool, Copy, Check, Sparkles } from 'lucide-react';
import { generateContent } from '../services/geminiService';
import { ContentResult } from '../types';

const ContentTool: React.FC = () => {
  const [topic, setTopic] = useState('');
  const [keywords, setKeywords] = useState('');
  const [tone, setTone] = useState('Professional');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ContentResult | null>(null);
  const [copied, setCopied] = useState(false);

  const handleGenerate = async () => {
    if (!topic.trim()) return;
    setLoading(true);
    try {
      const data = await generateContent(topic, tone, keywords);
      setResult(data);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = () => {
    if (!result) return;
    const text = `# ${result.title}\n\n${result.content}`;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="p-8 max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-8">
      {/* Input Column */}
      <div className="lg:col-span-1 space-y-6">
        <div className="space-y-2">
          <h2 className="text-3xl font-bold text-slate-900">Content Generator</h2>
          <p className="text-slate-500">Create SEO-optimized articles in seconds.</p>
        </div>

        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Topic / Title</label>
            <input
              className="w-full p-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-brand-500 outline-none"
              placeholder="e.g. Benefits of Remote Work"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Target Keywords</label>
            <input
              className="w-full p-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-brand-500 outline-none"
              placeholder="productivity, work-life balance"
              value={keywords}
              onChange={(e) => setKeywords(e.target.value)}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Tone of Voice</label>
            <select
              className="w-full p-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-brand-500 outline-none bg-white"
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
            disabled={loading || !topic}
            className="w-full py-4 bg-brand-600 hover:bg-brand-700 text-white rounded-xl font-bold shadow-lg shadow-brand-600/20 disabled:opacity-50 transition-all flex items-center justify-center gap-2 mt-4"
          >
            {loading ? <div className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent" /> : <Sparkles className="w-5 h-5" />}
            Generate Article
          </button>
        </div>
      </div>

      {/* Output Column */}
      <div className="lg:col-span-2">
        {result ? (
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden h-full flex flex-col">
             <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
               <span className="text-sm font-semibold text-slate-500 uppercase tracking-wide">Preview</span>
               <button 
                 onClick={handleCopy}
                 className="flex items-center gap-2 text-sm font-medium text-brand-600 hover:bg-brand-50 px-3 py-1.5 rounded-lg transition-colors"
               >
                 {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                 {copied ? 'Copied!' : 'Copy Markdown'}
               </button>
             </div>
             <div className="p-8 overflow-y-auto max-h-[800px] prose prose-slate max-w-none">
                <h1 className="text-3xl font-bold text-slate-900 mb-2">{result.title}</h1>
                <div className="bg-yellow-50 border border-yellow-100 p-4 rounded-lg mb-6 text-sm text-yellow-800">
                   <strong>Meta Description:</strong> {result.metaDescription}
                </div>
                <div className="whitespace-pre-wrap text-slate-700 leading-relaxed">
                  {result.content}
                </div>
             </div>
          </div>
        ) : (
          <div className="h-full min-h-[400px] flex flex-col items-center justify-center text-slate-400 border-2 border-dashed border-slate-200 rounded-2xl bg-slate-50/50">
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