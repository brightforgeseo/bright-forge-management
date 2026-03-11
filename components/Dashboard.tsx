import React from 'react';
import { ToolView, User } from '../types';

interface DashboardProps {
  currentUser: User;
  setCurrentView: (view: ToolView) => void;
}

const Dashboard: React.FC<DashboardProps> = ({ currentUser, setCurrentView }) => {
  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8">
      <div className="space-y-2">
        <div className="flex items-center gap-3">
           <h2 className="text-3xl font-bold text-white">Welcome back, {currentUser.name}</h2>
        </div>
        <p className="text-portal-soft">Bright Forge Portal: Your team's command center.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div 
          onClick={() => setCurrentView(ToolView.KEYWORD_RESEARCH)}
          className="bg-portal-surface p-6 rounded-2xl shadow-lg shadow-black/20 border border-white/[0.07] hover:shadow-md transition-all cursor-pointer group"
        >
          <div className="w-12 h-12 bg-brand-100 text-brand-600 rounded-xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
          <h3 className="font-bold text-lg text-white mb-2">Keyword Research</h3>
          <p className="text-portal-soft text-sm">Uncover high-volume, low-difficulty keywords with AI precision.</p>
        </div>

        <div 
          onClick={() => setCurrentView(ToolView.CONTENT_GENERATOR)}
          className="bg-portal-surface p-6 rounded-2xl shadow-lg shadow-black/20 border border-white/[0.07] hover:shadow-md transition-all cursor-pointer group"
        >
          <div className="w-12 h-12 bg-brand-100 text-brand-600 rounded-xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
            </svg>
          </div>
          <h3 className="font-bold text-lg text-white mb-2">Content Generator</h3>
          <p className="text-portal-soft text-sm">Generate blog posts, meta tags, and ad copy instantly.</p>
        </div>

        <div 
          onClick={() => setCurrentView(ToolView.SITE_AUDIT)}
          className="bg-portal-surface p-6 rounded-2xl shadow-lg shadow-black/20 border border-white/[0.07] hover:shadow-md transition-all cursor-pointer group"
        >
          <div className="w-12 h-12 bg-brand-100 text-brand-600 rounded-xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
          </div>
          <h3 className="font-bold text-lg text-white mb-2">SEO Audit</h3>
          <p className="text-portal-soft text-sm">Analyze content for optimization scores and fix recommendations.</p>
        </div>

         <div 
          onClick={() => setCurrentView(ToolView.TASKS)}
          className="bg-portal-surface p-6 rounded-2xl shadow-lg shadow-black/20 border border-white/[0.07] hover:shadow-md transition-all cursor-pointer group"
        >
          <div className="w-12 h-12 bg-brand-100 text-brand-600 rounded-xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
             <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
             </svg>
          </div>
          <h3 className="font-bold text-lg text-white mb-2">Project Tasks</h3>
          <p className="text-portal-soft text-sm">Manage multiple clients with our Monday-style task board.</p>
        </div>

         <div 
          onClick={() => setCurrentView(ToolView.TEAM_CHAT)}
          className="bg-portal-surface p-6 rounded-2xl shadow-lg shadow-black/20 border border-white/[0.07] hover:shadow-md transition-all cursor-pointer group"
        >
          <div className="w-12 h-12 bg-brand-100 text-brand-600 rounded-xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
             <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
               <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
             </svg>
          </div>
          <h3 className="font-bold text-lg text-white mb-2">Team Chat</h3>
          <p className="text-portal-soft text-sm">Collaborate with your team and our AI assistant in real-time.</p>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;