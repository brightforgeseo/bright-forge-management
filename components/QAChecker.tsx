import React, { useState, useRef } from 'react';
import { CheckCircle, AlertCircle, Copy, Check, FileText } from 'lucide-react';
import { checkContentQA } from '../services/claudeService';
import { QACorrection } from '../types';

const QAChecker: React.FC = () => {
  const [qaRules, setQaRules] = useState('');
  const [loading, setLoading] = useState(false);
  const [corrections, setCorrections] = useState<QACorrection[]>([]);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const editorRef = useRef<HTMLDivElement>(null);

  const handleCheck = async () => {
    if (!qaRules.trim()) {
      setError('Please enter your QA rules.');
      return;
    }
    if (!editorRef.current?.innerText.trim()) {
      setError('Please paste your content.');
      return;
    }

    setLoading(true);
    setError(null);
    setCorrections([]);

    try {
      const content = editorRef.current.innerText;
      const result = await checkContentQA(content, qaRules);
      setCorrections(result);
    } catch (err: any) {
      setError(err.message || 'QA check failed');
    } finally {
      setLoading(false);
    }
  };

  const applyCorrections = () => {
    if (!editorRef.current || corrections.length === 0) return;

    // Sort by length (longest first) to avoid partial matches
    const sorted = [...corrections].sort((a, b) => b.find.length - a.find.length);

    sorted.forEach(c => {
      if (!c.find || !c.replace) return;

      const isHtmlReplace = /<[a-z][a-z0-9]*[\s>]/i.test(c.replace);

      if (isHtmlReplace) {
        // For HTML replacements (like adding links), we must use innerHTML
        const escaped = c.find.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        editorRef.current!.innerHTML = editorRef.current!.innerHTML.replace(new RegExp(escaped, 'g'), c.replace);
      } else {
        // For text-only corrections, replace inside text nodes to preserve formatting
        const walker = document.createTreeWalker(
          editorRef.current!,
          NodeFilter.SHOW_TEXT
        );

        const textNodes: Text[] = [];
        let node;
        while ((node = walker.nextNode())) {
          textNodes.push(node as Text);
        }

        textNodes.forEach(textNode => {
          if (textNode.textContent && textNode.textContent.includes(c.find)) {
            textNode.textContent = textNode.textContent.split(c.find).join(c.replace);
          }
        });
      }
    });

    setCorrections([]);
  };

  const handleCopy = async () => {
    if (!editorRef.current) return;

    const html = editorRef.current.innerHTML;
    const text = editorRef.current.innerText;

    try {
      // Copy as rich text (HTML) so it pastes with formatting into Google Docs/Word
      await navigator.clipboard.write([
        new ClipboardItem({
          'text/html': new Blob([html], { type: 'text/html' }),
          'text/plain': new Blob([text], { type: 'text/plain' })
        })
      ]);
    } catch {
      // Fallback for older browsers - select and copy
      const selection = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(editorRef.current);
      selection?.removeAllRanges();
      selection?.addRange(range);
      document.execCommand('copy');
      selection?.removeAllRanges();
    }

    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <div className="mb-6">
        <h2 className="text-3xl font-bold text-white">QA Checker</h2>
        <p className="text-portal-soft">Check and fix content based on your custom rules.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Editor Panel */}
        <div className="lg:col-span-2">
          <div className="bg-portal-surface rounded-2xl shadow-lg shadow-black/20 border border-white/[0.07] overflow-hidden">
            <div className="bg-portal-dark px-4 py-3 border-b border-white/[0.07] flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm text-portal-soft">
                <FileText className="w-4 h-4" />
                <span>Document Editor</span>
              </div>
              <button
                onClick={handleCopy}
                className="flex items-center gap-1 text-sm text-portal-soft hover:text-brand-600"
              >
                {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                {copied ? 'Copied!' : 'Copy'}
              </button>
            </div>
            <div
              ref={editorRef}
              contentEditable
              className="min-h-[500px] p-6 outline-none prose prose-slate max-w-none"
              style={{ fontFamily: 'Arial, sans-serif', fontSize: '14px', lineHeight: '1.6' }}
              data-placeholder="Paste your document here from Word or Google Docs..."
            />
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          <div className="bg-portal-surface p-6 rounded-2xl shadow-lg shadow-black/20 border border-white/[0.07]">
            <label className="block text-sm font-medium text-portal-text mb-2">
              Your QA Rules
            </label>
            <textarea
              className="w-full p-3 rounded-xl border border-white/[0.07] focus:ring-2 focus:ring-brand-500 outline-none resize-none"
              rows={8}
              placeholder="Enter your QA rules...

Examples:
- Fix spelling and grammar errors
- Change 'perth' to 'Perth'
- Ensure 'Indigo Pool Care' is capitalised correctly
- Remove passive voice"
              value={qaRules}
              onChange={(e) => setQaRules(e.target.value)}
            />

            <button
              onClick={handleCheck}
              disabled={loading}
              className="w-full mt-4 px-4 py-3 bg-brand-500 text-white rounded-xl font-medium hover:bg-brand-600 disabled:bg-portal-surface2 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Checking...
                </>
              ) : (
                <>
                  <CheckCircle className="w-5 h-5" />
                  Find Issues
                </>
              )}
            </button>

            {error && (
              <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm flex items-start gap-2">
                <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
                {error}
              </div>
            )}
          </div>

          {/* Corrections Panel */}
          {corrections.length > 0 && (
            <div className="bg-portal-surface p-6 rounded-2xl shadow-lg shadow-black/20 border border-white/[0.07]">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-medium text-white">
                  Corrections Found
                  <span className="ml-2 px-2 py-0.5 bg-brand-100 text-brand-700 text-sm rounded-full">
                    {corrections.length}
                  </span>
                </h3>
              </div>

              <div className="space-y-2 max-h-64 overflow-y-auto mb-4">
                {corrections.map((c, i) => (
                  <div key={i} className="p-3 bg-portal-dark rounded-lg text-sm border-l-3 border-brand-500">
                    <div className="text-red-600 line-through">{c.find}</div>
                    <div className="text-green-600 font-medium">→ {c.replace}</div>
                  </div>
                ))}
              </div>

              <button
                onClick={applyCorrections}
                className="w-full px-4 py-3 bg-green-500 text-white rounded-xl font-medium hover:bg-green-600 flex items-center justify-center gap-2"
              >
                <Check className="w-5 h-5" />
                Apply All Corrections
              </button>
            </div>
          )}

          {corrections.length === 0 && !loading && !error && editorRef.current?.innerText.trim() && (
            <div className="bg-green-50 p-4 rounded-xl border border-green-200 text-green-700 text-sm flex items-center gap-2">
              <CheckCircle className="w-5 h-5" />
              No issues found!
            </div>
          )}
        </div>
      </div>

      <style>{`
        [contenteditable]:empty:before {
          content: attr(data-placeholder);
          color: #94a3b8;
        }
        [contenteditable] h1, [contenteditable] h2, [contenteditable] h3 {
          margin-top: 1em;
          margin-bottom: 0.5em;
        }
        [contenteditable] p {
          margin-bottom: 0.75em;
        }
        [contenteditable] a {
          color: #3b82f6;
        }
      `}</style>
    </div>
  );
};

export default QAChecker;
