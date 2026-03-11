import React, { useState } from 'react';
import { ScanLine, AlertTriangle, CheckCircle, AlertCircle } from 'lucide-react';
import { analyzeText } from '../services/geminiService';
import { AuditResult } from '../types';

const AuditTool: React.FC = () => {
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AuditResult | null>(null);

  const handleAudit = async () => {
    if (!text.trim()) return;
    setLoading(true);
    try {
      const data = await analyzeText(text);
      setResult(data);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-8">
      <div className="space-y-2">
        <h2 className="text-3xl font-bold text-white">SEO Audit</h2>
        <p className="text-portal-soft">Paste your content or HTML snippet to identify optimization opportunities.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Input */}
        <div className="space-y-4">
          <div className="bg-portal-surface p-1 rounded-2xl shadow-lg shadow-black/20 border border-white/[0.07]">
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Paste your article text, meta tags, or HTML snippet here..."
              className="w-full h-96 p-6 rounded-xl outline-none resize-none text-portal-text text-base leading-relaxed focus:ring-2 focus:ring-brand-500 focus:rounded-xl transition-all"
            />
          </div>
          <button
            onClick={handleAudit}
            disabled={loading || !text}
            className="w-full py-4 bg-brand-600 hover:bg-brand-700 text-white rounded-xl font-bold shadow-lg shadow-brand-600/20 disabled:opacity-50 transition-all flex items-center justify-center gap-2"
          >
            {loading ? <div className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent" /> : <ScanLine className="w-5 h-5" />}
            Run Analysis
          </button>
        </div>

        {/* Results */}
        <div className="space-y-6">
          {result ? (
            <div className="animate-fadeIn space-y-6">
              {/* Score Card */}
              <div className="bg-portal-surface p-8 rounded-2xl shadow-lg shadow-black/20 border border-white/[0.07] flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-portal-text">SEO Score</h3>
                  <p className="text-portal-soft text-sm mt-1">Based on keyword usage, readability, and structure.</p>
                </div>
                <div className="relative w-24 h-24 flex items-center justify-center">
                   <svg className="w-full h-full transform -rotate-90">
                     <circle cx="48" cy="48" r="40" stroke="#e2e8f0" strokeWidth="8" fill="transparent" />
                     <circle 
                       cx="48" cy="48" r="40" 
                       stroke={result.score > 70 ? '#22c55e' : result.score > 40 ? '#eab308' : '#ef4444'} 
                       strokeWidth="8" 
                       fill="transparent" 
                       strokeDasharray={251.2}
                       strokeDashoffset={251.2 - (251.2 * result.score) / 100}
                       className="transition-all duration-1000 ease-out"
                     />
                   </svg>
                   <span className="absolute text-2xl font-bold text-white">{result.score}</span>
                </div>
              </div>

              {/* Summary */}
              <div className="bg-portal-surface p-6 rounded-2xl shadow-lg shadow-black/20 border border-white/[0.07]">
                <h4 className="font-semibold text-white mb-2">Executive Summary</h4>
                <p className="text-portal-soft leading-relaxed">{result.summary}</p>
              </div>

              {/* Issues */}
              <div className="space-y-3">
                <h4 className="font-semibold text-white ml-1">Detailed Insights</h4>
                {result.issues.map((issue, idx) => (
                  <div key={idx} className="bg-portal-surface p-5 rounded-xl shadow-lg shadow-black/20 border border-white/[0.07] border-l-4"
                       style={{ borderLeftColor: issue.severity === 'high' ? '#ef4444' : issue.severity === 'medium' ? '#eab308' : '#3b82f6' }}>
                    <div className="flex items-start gap-3">
                      {issue.severity === 'high' ? <AlertCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" /> : 
                       issue.severity === 'medium' ? <AlertTriangle className="w-5 h-5 text-yellow-500 shrink-0 mt-0.5" /> : 
                       <CheckCircle className="w-5 h-5 text-brand-500 shrink-0 mt-0.5" />}
                      <div>
                        <p className="font-medium text-white">{issue.message}</p>
                        <p className="text-portal-soft text-sm mt-1">Tip: {issue.recommendation}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
             <div className="h-full flex flex-col items-center justify-center text-portal-soft">
               <div className="w-16 h-16 bg-portal-surface2 rounded-full flex items-center justify-center mb-4">
                 <ScanLine className="w-8 h-8 text-portal-text" />
               </div>
               <p className="font-medium">Ready to audit</p>
             </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AuditTool;