import React, { useState } from 'react';
import { Search, ArrowUpRight, TrendingUp, Activity } from 'lucide-react';
import { generateKeywords } from '../services/geminiService';
import { KeywordResult } from '../types';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';

const KeywordTool: React.FC = () => {
  const [seed, setSeed] = useState('');
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<KeywordResult[]>([]);
  const [error, setError] = useState('');

  const handleAnalyze = async () => {
    if (!seed.trim()) return;
    setLoading(true);
    setError('');
    try {
      const data = await generateKeywords(seed);
      setResults(data);
    } catch (err) {
      setError('Failed to fetch keywords. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8">
      <div className="space-y-2">
        <h2 className="text-3xl font-bold text-white">Keyword Research</h2>
        <p className="text-portal-soft">Discover high-potential keywords with AI-driven competition analysis.</p>
      </div>

      {/* Input Section */}
      <div className="bg-portal-surface p-6 rounded-2xl shadow-lg shadow-black/20 border border-white/[0.07] flex flex-col md:flex-row gap-4 items-end md:items-center">
        <div className="flex-1 w-full">
          <label className="block text-sm font-medium text-portal-text mb-2">Target Keyword</label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-portal-soft w-5 h-5" />
            <input
              type="text"
              value={seed}
              onChange={(e) => setSeed(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAnalyze()}
              className="w-full pl-10 pr-4 py-3 rounded-xl border border-white/[0.07] focus:ring-2 focus:ring-brand-500 focus:border-transparent outline-none transition-all"
              placeholder="e.g. vintage coffee machines"
            />
          </div>
        </div>
        <button
          onClick={handleAnalyze}
          disabled={loading}
          className="w-full md:w-auto px-8 py-3 bg-brand-600 hover:bg-brand-700 text-white rounded-xl font-semibold shadow-lg shadow-brand-600/20 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
        >
          {loading ? (
            <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
          ) : (
            <>
              <Activity className="w-5 h-5" />
              Analyze
            </>
          )}
        </button>
      </div>

      {error && (
        <div className="p-4 bg-red-50 text-red-600 rounded-xl border border-red-100">
          {error}
        </div>
      )}

      {/* Results Section */}
      {results.length > 0 && (
        <div className="grid grid-cols-1 gap-6">
          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
             <div className="bg-portal-surface p-6 rounded-2xl shadow-lg shadow-black/20 border border-white/[0.07]">
                <p className="text-sm text-portal-soft mb-1">Top Opportunity</p>
                <h3 className="text-xl font-bold text-white">{results[0].keyword}</h3>
                <span className="inline-block mt-2 px-2 py-1 bg-green-100 text-green-700 text-xs rounded-full font-medium">
                  Low Difficulty
                </span>
             </div>
             <div className="bg-portal-surface p-6 rounded-2xl shadow-lg shadow-black/20 border border-white/[0.07]">
                <p className="text-sm text-portal-soft mb-1">Avg Search Volume</p>
                <h3 className="text-xl font-bold text-white">
                  {(results.reduce((acc, curr) => acc + curr.searchVolume, 0) / results.length).toLocaleString()}
                </h3>
             </div>
             <div className="bg-portal-surface p-6 rounded-2xl shadow-lg shadow-black/20 border border-white/[0.07]">
                <p className="text-sm text-portal-soft mb-1">Potential Traffic</p>
                <h3 className="text-xl font-bold text-white">High</h3>
             </div>
          </div>

          {/* Table & Chart */}
          <div className="bg-portal-surface rounded-2xl shadow-lg shadow-black/20 border border-white/[0.07] overflow-hidden">
            <div className="overflow-y-auto">
              <table className="w-full table-fixed text-left">
                <thead className="bg-portal-dark border-b border-white/[0.07]">
                  <tr>
                    <th className="px-2 lg:px-4 py-4 text-xs font-semibold text-portal-soft uppercase tracking-wider w-[30%]">Keyword</th>
                    <th className="px-2 lg:px-4 py-4 text-xs font-semibold text-portal-soft uppercase tracking-wider w-[15%]">Volume</th>
                    <th className="px-2 lg:px-4 py-4 text-xs font-semibold text-portal-soft uppercase tracking-wider w-[15%]">Diff</th>
                    <th className="px-2 lg:px-4 py-4 text-xs font-semibold text-portal-soft uppercase tracking-wider w-[15%]">Comp</th>
                    <th className="px-2 lg:px-4 py-4 text-xs font-semibold text-portal-soft uppercase tracking-wider w-[25%]">6 Month Trend</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {results.map((row, idx) => (
                    <tr key={idx} className="hover:bg-portal-dark transition-colors">
                      <td className="px-2 lg:px-4 py-4 font-medium text-white truncate">{row.keyword}</td>
                      <td className="px-2 lg:px-4 py-4 text-portal-soft">{row.searchVolume.toLocaleString()}</td>
                      <td className="px-2 lg:px-4 py-4">
                        <span className={`px-2 py-1 rounded-full text-xs font-semibold ${
                          row.difficulty === 'High' ? 'bg-red-100 text-red-700' :
                          row.difficulty === 'Medium' ? 'bg-yellow-100 text-yellow-700' :
                          'bg-green-100 text-green-700'
                        }`}>
                          {row.difficulty}
                        </span>
                      </td>
                      <td className="px-2 lg:px-4 py-4 text-portal-soft">
                        <div className="w-full bg-portal-surface2 rounded-full h-1.5">
                          <div
                            className="bg-brand-600 h-1.5 rounded-full"
                            style={{ width: `${row.competition}%` }}
                          />
                        </div>
                      </td>
                      <td className="px-2 lg:px-4 py-4">
                        <div className="h-10 w-full">
                          <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={row.trend.map((val, i) => ({ i, val }))}>
                              <Area
                                type="monotone"
                                dataKey="val"
                                stroke="#ea580c"
                                fill="#ffedd5"
                                strokeWidth={2}
                              />
                            </AreaChart>
                          </ResponsiveContainer>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default KeywordTool;