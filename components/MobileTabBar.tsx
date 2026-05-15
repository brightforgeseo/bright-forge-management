/**
 * MobileTabBar — bottom navigation for mobile
 * Shows 5 key actions. Replaces the hamburger menu tap for frequent destinations.
 */

import React from 'react';
import { TableProperties, MessageSquare, CheckSquare, Zap, LayoutDashboard } from 'lucide-react';
import { ToolView } from '../types';

interface Props {
  currentView: ToolView;
  onNavigate: (view: ToolView) => void;
}

const TABS = [
  { view: ToolView.DASHBOARD,       icon: LayoutDashboard,  label: 'Home'  },
  { view: ToolView.TASKS,           icon: TableProperties,   label: 'Tasks' },
  { view: ToolView.MY_WORK,         icon: CheckSquare,       label: 'Mine'  },
  { view: ToolView.TEAM_CHAT,       icon: MessageSquare,     label: 'Chat'  },
  { view: ToolView.ECHO_WORKSPACES, icon: Zap,               label: 'Echo'  },
];

const MobileTabBar: React.FC<Props> = ({ currentView, onNavigate }) => (
  <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-50 bg-portal-surface border-t border-white/[0.07] safe-area-inset-bottom">
    <div className="flex items-stretch h-16">
      {TABS.map(({ view, icon: Icon, label }) => {
        const active = currentView === view;
        return (
          <button
            key={view}
            onClick={() => onNavigate(view)}
            className={`flex-1 flex flex-col items-center justify-center gap-1 transition-colors ${
              active ? 'text-brand-400' : 'text-white/40 hover:text-white/70'
            }`}
          >
            {active && (
              <span className="absolute top-0 w-8 h-0.5 rounded-full bg-brand-400 -translate-y-px" />
            )}
            <Icon size={20} strokeWidth={active ? 2.5 : 1.8} />
            <span className={`text-[10px] font-medium ${active ? 'text-brand-400' : 'text-white/40'}`}>
              {label}
            </span>
          </button>
        );
      })}
    </div>
  </nav>
);

export default MobileTabBar;
