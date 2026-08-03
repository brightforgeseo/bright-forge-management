/**
 * Command Palette — Cmd/Ctrl+K
 * Search views, clients, team members and jump instantly.
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Search, LayoutDashboard, MessageSquare, TableProperties, CheckSquare, PenTool, BarChart, FileCheck, Settings, Zap, Hash, User, ChevronRight, Mail, Command } from 'lucide-react';
import { ToolView, User as UserType, Profile } from '../types';
import { isBenBusinessOsUser, isBusinessInboxUser } from '../services/businessOsModel.mjs';

interface CommandItem {
  id: string;
  label: string;
  sublabel?: string;
  icon: React.ReactNode;
  action: () => void;
  category: 'navigation' | 'client' | 'team';
  keywords?: string[];
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onNavigate: (view: ToolView) => void;
  currentUser: UserType;
  clients?: { id: string; name: string }[];
  profiles?: Profile[];
}

const VIEW_ICONS: Record<ToolView, React.ReactNode> = {
  [ToolView.DASHBOARD]:          <LayoutDashboard size={16} />,
  [ToolView.BUSINESS_OS]:        <Command size={16} />,
  [ToolView.KEYWORD_RESEARCH]:   <Search size={16} />,
  [ToolView.CONTENT_GENERATOR]:  <PenTool size={16} />,
  [ToolView.SITE_AUDIT]:         <BarChart size={16} />,
  [ToolView.QA_CHECKER]:         <FileCheck size={16} />,
  [ToolView.TASKS]:              <TableProperties size={16} />,
  [ToolView.MY_WORK]:            <CheckSquare size={16} />,
  [ToolView.TEAM_CHAT]:          <MessageSquare size={16} />,
  [ToolView.BUSINESS_INBOX]:     <Mail size={16} />,
  [ToolView.ECHO_WORKSPACES]:    <Zap size={16} />,
  [ToolView.SETTINGS]:           <Settings size={16} />,
};

const VIEW_LABELS: Record<ToolView, string> = {
  [ToolView.DASHBOARD]:          'Dashboard',
  [ToolView.BUSINESS_OS]:        'Business OS',
  [ToolView.KEYWORD_RESEARCH]:   'Keyword Research',
  [ToolView.CONTENT_GENERATOR]:  'Content Generator',
  [ToolView.SITE_AUDIT]:         'SEO Audit',
  [ToolView.QA_CHECKER]:         'QA Checker',
  [ToolView.TASKS]:              'Project Tasks',
  [ToolView.MY_WORK]:            'My Work',
  [ToolView.TEAM_CHAT]:          'Team Chat',
  [ToolView.BUSINESS_INBOX]:     'Business Inbox',
  [ToolView.ECHO_WORKSPACES]:    'Echo Workspaces',
  [ToolView.SETTINGS]:           'Settings',
};

const VIEW_SHORTCUTS: Partial<Record<ToolView, string>> = {
  [ToolView.BUSINESS_OS]:     'G O',
  [ToolView.TASKS]:           'G T',
  [ToolView.TEAM_CHAT]:       'G C',
  [ToolView.ECHO_WORKSPACES]: 'G E',
  [ToolView.MY_WORK]:         'G M',
  [ToolView.DASHBOARD]:       'G D',
  [ToolView.BUSINESS_INBOX]:  'G I',
};

const CommandPalette: React.FC<Props> = ({ isOpen, onClose, onNavigate, currentUser, clients = [], profiles = [] }) => {
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const navItems: CommandItem[] = Object.values(ToolView)
    .filter(view => view !== ToolView.BUSINESS_OS || isBenBusinessOsUser(currentUser.id))
    .filter(view => view !== ToolView.BUSINESS_INBOX || isBusinessInboxUser(currentUser.id))
    .map(view => ({
    id: `view-${view}`,
    label: VIEW_LABELS[view],
    icon: VIEW_ICONS[view],
    action: () => { onNavigate(view); onClose(); },
    category: 'navigation' as const,
    keywords: [view.toLowerCase(), VIEW_LABELS[view].toLowerCase()],
  }));

  const clientItems: CommandItem[] = clients.map(c => ({
    id: `client-${c.id}`,
    label: c.name,
    sublabel: 'Open in Project Tasks',
    icon: <Hash size={16} />,
    action: () => { onNavigate(ToolView.TASKS); onClose(); },
    category: 'client' as const,
    keywords: [c.name.toLowerCase()],
  }));

  const teamItems: CommandItem[] = profiles.map(p => ({
    id: `member-${p.id}`,
    label: p.full_name || 'Unknown',
    sublabel: 'Open DM in Team Chat',
    icon: <User size={16} />,
    action: () => { onNavigate(ToolView.TEAM_CHAT); onClose(); },
    category: 'team' as const,
    keywords: [(p.full_name || '').toLowerCase()],
  }));

  const allItems = [...navItems, ...clientItems, ...teamItems];

  const filtered = query.trim() === ''
    ? navItems // default: show nav only
    : allItems.filter(item =>
        item.label.toLowerCase().includes(query.toLowerCase()) ||
        item.sublabel?.toLowerCase().includes(query.toLowerCase()) ||
        item.keywords?.some(k => k.includes(query.toLowerCase()))
      );

  // Group filtered results
  const grouped = {
    navigation: filtered.filter(i => i.category === 'navigation'),
    client: filtered.filter(i => i.category === 'client'),
    team: filtered.filter(i => i.category === 'team'),
  };

  const flatFiltered = [
    ...grouped.navigation,
    ...grouped.client,
    ...grouped.team,
  ];

  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelected(0);
      setTimeout(() => inputRef.current?.focus(), 30);
    }
  }, [isOpen]);

  useEffect(() => { setSelected(0); }, [query]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelected(s => Math.min(s + 1, flatFiltered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelected(s => Math.max(s - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      flatFiltered[selected]?.action();
    } else if (e.key === 'Escape') {
      onClose();
    }
  }, [flatFiltered, selected, onClose]);

  // Scroll selected into view
  useEffect(() => {
    const el = listRef.current?.querySelector(`[data-idx="${selected}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [selected]);

  if (!isOpen) return null;

  const renderGroup = (label: string, items: CommandItem[], offset: number) => {
    if (items.length === 0) return null;
    return (
      <div key={label}>
        <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-widest text-white/30">
          {label}
        </div>
        {items.map((item, i) => {
          const idx = offset + i;
          const isSelected = idx === selected;
          const shortcut = item.category === 'navigation'
            ? VIEW_SHORTCUTS[Object.values(ToolView).find(v => `view-${v}` === item.id) as ToolView]
            : undefined;
          return (
            <div
              key={item.id}
              data-idx={idx}
              onMouseEnter={() => setSelected(idx)}
              onClick={item.action}
              className={`flex items-center gap-3 px-3 py-2.5 mx-1 rounded-lg cursor-pointer transition-colors ${
                isSelected ? 'bg-brand-500/20 text-white' : 'text-white/70 hover:bg-white/5'
              }`}
            >
              <span className={`flex-shrink-0 ${isSelected ? 'text-brand-400' : 'text-white/40'}`}>
                {item.icon}
              </span>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">{item.label}</div>
                {item.sublabel && (
                  <div className="text-[11px] text-white/40 truncate">{item.sublabel}</div>
                )}
              </div>
              {shortcut && (
                <div className="flex gap-1 flex-shrink-0">
                  {shortcut.split(' ').map((k, ki) => (
                    <kbd key={ki} className="px-1.5 py-0.5 rounded bg-white/10 text-white/40 text-[10px] font-mono">{k}</kbd>
                  ))}
                </div>
              )}
              {isSelected && <ChevronRight size={14} className="text-white/30 flex-shrink-0" />}
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div
      className="fixed inset-0 z-[200] flex items-start justify-center pt-[15vh] px-4"
      onClick={onClose}
    >
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-lg bg-portal-surface border border-white/[0.10] rounded-2xl shadow-2xl overflow-hidden animate-fadeIn"
        onClick={e => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        {/* Search input */}
        <div className="flex items-center gap-3 px-4 py-3.5 border-b border-white/[0.07]">
          <Search size={16} className="text-white/40 flex-shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search views, clients, team members…"
            className="flex-1 bg-transparent text-white placeholder-white/30 text-sm outline-none"
          />
          <kbd className="px-1.5 py-0.5 rounded bg-white/10 text-white/40 text-[10px] font-mono flex-shrink-0">Esc</kbd>
        </div>

        {/* Results */}
        <div ref={listRef} className="py-2 max-h-[60vh] overflow-y-auto custom-scrollbar">
          {flatFiltered.length === 0 ? (
            <div className="px-4 py-8 text-center text-white/30 text-sm">No results for "{query}"</div>
          ) : (
            <>
              {renderGroup('Navigation', grouped.navigation, 0)}
              {renderGroup('Clients', grouped.client, grouped.navigation.length)}
              {renderGroup('Team Members', grouped.team, grouped.navigation.length + grouped.client.length)}
            </>
          )}
        </div>

        {/* Footer hint */}
        <div className="px-4 py-2 border-t border-white/[0.07] flex items-center gap-4 text-[10px] text-white/25">
          <span><kbd className="font-mono">↑↓</kbd> navigate</span>
          <span><kbd className="font-mono">↵</kbd> select</span>
          <span><kbd className="font-mono">Esc</kbd> close</span>
          <span className="ml-auto"><kbd className="font-mono">⌘K</kbd> or <kbd className="font-mono">Ctrl K</kbd> to open</span>
        </div>
      </div>
    </div>
  );
};

export default CommandPalette;
