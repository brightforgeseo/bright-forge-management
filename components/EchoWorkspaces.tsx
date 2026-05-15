/**
 * Echo Workspaces
 * Multiple independent AI chat sessions running in parallel.
 * Each workspace has its own history, bridge session, and model selection.
 * Talks directly to the portal bridge (localhost:18790) via littleEchoService pattern.
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Plus, X, Bot, Send, Loader2, Trash2, Edit2, Check, Zap, ChevronDown } from 'lucide-react';
import { User, ToastType } from '../types';

const BRIDGE_URL = (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_BRIDGE_URL) || 'http://localhost:18790';
const BRIDGE_SECRET = (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_ECHO_BRIDGE_SECRET) || 'brightforge-echo-bridge-2026';

type WorkspaceModel = 'sassin' | 'claude' | 'gemini';

const MODEL_CONFIG: Record<WorkspaceModel, {
  label: string;
  badge: string;
  badgeClass: string;
  dot: string;
  description: string;
}> = {
  sassin: {
    label: 'Little Sassin',
    badge: 'Local',
    badgeClass: 'bg-purple-500/20 text-purple-300',
    dot: 'bg-purple-400',
    description: 'Local model — fast, free, no API cost',
  },
  claude: {
    label: 'Claude',
    badge: 'Cloud',
    badgeClass: 'bg-blue-500/20 text-blue-300',
    dot: 'bg-blue-400',
    description: 'Claude via Hermes — best quality, uses API credits',
  },
  gemini: {
    label: 'Gemini',
    badge: 'Cloud',
    badgeClass: 'bg-emerald-500/20 text-emerald-300',
    dot: 'bg-emerald-400',
    description: 'Gemini Flash — cloud, fast, requires Gemini key',
  },
};

interface WorkspaceMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  timestamp: string;
  routedTo?: string;
}

interface Workspace {
  id: string;
  name: string;
  model: WorkspaceModel;
  messages: WorkspaceMessage[];
  isThinking: boolean;
  input: string;
}

function makeId() {
  return Math.random().toString(36).slice(2, 10);
}

function makeWorkspace(name?: string, model: WorkspaceModel = 'sassin'): Workspace {
  return {
    id: makeId(),
    name: name || 'New workspace',
    model,
    messages: [],
    isThinking: false,
    input: '',
  };
}

interface Props {
  currentUser: User;
  addToast: (type: ToastType, message: string) => void;
}

const MAX_WORKSPACES = 10;

const EchoWorkspaces: React.FC<Props> = ({ currentUser, addToast }) => {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([makeWorkspace('Workspace 1')]);
  const [activeId, setActiveId] = useState<string>(() => workspaces[0]?.id ?? '');
  const [editingTabId, setEditingTabId] = useState<string | null>(null);
  const [editingTabName, setEditingTabName] = useState('');
  const [modelPickerOpen, setModelPickerOpen] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const pickerRef = useRef<HTMLDivElement>(null);

  // Close picker on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setModelPickerOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useEffect(() => {
    if (!workspaces.find(w => w.id === activeId) && workspaces.length > 0) {
      setActiveId(workspaces[workspaces.length - 1].id);
    }
  }, [workspaces, activeId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [workspaces, activeId]);

  const activeWorkspace = workspaces.find(w => w.id === activeId) ?? workspaces[0];

  const updateWorkspace = useCallback((id: string, updater: (w: Workspace) => Workspace) => {
    setWorkspaces(prev => prev.map(w => w.id === id ? updater(w) : w));
  }, []);

  const addWorkspace = () => {
    if (workspaces.length >= MAX_WORKSPACES) {
      addToast('warning', `Maximum ${MAX_WORKSPACES} workspaces open at once`);
      return;
    }
    const ws = makeWorkspace(`Workspace ${workspaces.length + 1}`);
    setWorkspaces(prev => [...prev, ws]);
    setActiveId(ws.id);
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  const closeWorkspace = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (workspaces.length === 1) {
      setWorkspaces([makeWorkspace('Workspace 1')]);
      return;
    }
    const idx = workspaces.findIndex(w => w.id === id);
    const next = workspaces[idx === 0 ? 1 : idx - 1];
    setWorkspaces(prev => prev.filter(w => w.id !== id));
    setActiveId(next.id);
  };

  const clearWorkspace = (id: string) => {
    updateWorkspace(id, w => ({ ...w, messages: [] }));
  };

  const setWorkspaceModel = (id: string, model: WorkspaceModel) => {
    updateWorkspace(id, w => ({ ...w, model }));
    setModelPickerOpen(false);
  };

  const sendMessage = async (workspaceId: string) => {
    const ws = workspaces.find(w => w.id === workspaceId);
    if (!ws || !ws.input.trim() || ws.isThinking) return;

    const userText = ws.input.trim();
    const userMsg: WorkspaceMessage = {
      id: makeId(),
      role: 'user',
      text: userText,
      timestamp: new Date().toISOString(),
    };

    updateWorkspace(workspaceId, w => ({
      ...w,
      messages: [...w.messages, userMsg],
      input: '',
      isThinking: true,
    }));

    try {
      const res = await fetch(`${BRIDGE_URL}/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${BRIDGE_SECRET}`,
        },
        body: JSON.stringify({
          message: userText,
          userId: currentUser.id,
          sessionKey: `${currentUser.id}-ws-${workspaceId}`,
          userName: currentUser.name,
          history: [],
          model: ws.model,
        }),
      });

      if (!res.ok) throw new Error(`Bridge error ${res.status}`);
      const data = await res.json();

      const assistantMsg: WorkspaceMessage = {
        id: makeId(),
        role: 'assistant',
        text: data.response || '(no response)',
        timestamp: new Date().toISOString(),
        routedTo: data.routed_to,
      };

      updateWorkspace(workspaceId, w => ({
        ...w,
        messages: [...w.messages, assistantMsg],
        isThinking: false,
      }));
    } catch (err: any) {
      updateWorkspace(workspaceId, w => ({
        ...w,
        messages: [...w.messages, {
          id: makeId(),
          role: 'assistant',
          text: `Error: ${err.message}. Is the bridge running?`,
          timestamp: new Date().toISOString(),
        }],
        isThinking: false,
      }));
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>, wsId: string) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(wsId);
    }
  };

  const startRenameTab = (ws: Workspace, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingTabId(ws.id);
    setEditingTabName(ws.name);
  };

  const commitRename = (id: string) => {
    if (editingTabName.trim()) {
      updateWorkspace(id, w => ({ ...w, name: editingTabName.trim() }));
    }
    setEditingTabId(null);
  };

  const routeBadge = (routedTo?: string) => {
    if (!routedTo || routedTo === 'system') return null;
    const map: Record<string, { cls: string; label: string }> = {
      sassin: { cls: 'bg-purple-500/20 text-purple-300', label: 'Local' },
      'sassin-member': { cls: 'bg-purple-500/20 text-purple-300', label: 'Local' },
      hermes: { cls: 'bg-blue-500/20 text-blue-300', label: 'Claude' },
      'hermes-fallback': { cls: 'bg-yellow-500/20 text-yellow-300', label: 'Claude (fallback)' },
      gemini: { cls: 'bg-emerald-500/20 text-emerald-300', label: 'Gemini' },
      batch: { cls: 'bg-green-500/20 text-green-300', label: 'Batch' },
    };
    const m = map[routedTo] || { cls: 'bg-white/10 text-white/50', label: routedTo };
    return (
      <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${m.cls}`}>
        {m.label}
      </span>
    );
  };

  if (!activeWorkspace) return null;

  const activeCfg = MODEL_CONFIG[activeWorkspace.model];

  return (
    <div className="flex flex-col h-full bg-portal-bg">
      {/* Header */}
      <div className="flex-shrink-0 flex items-center justify-between px-4 py-3 border-b border-white/[0.07]">
        <div className="flex items-center gap-2">
          <Zap size={16} className="text-brand-400" />
          <span className="text-sm font-semibold text-white">Echo Workspaces</span>
          <span className="text-xs text-white/40">{workspaces.length}/{MAX_WORKSPACES} open</span>
        </div>
        <button
          onClick={addWorkspace}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-brand-500/20 hover:bg-brand-500/30 text-brand-300 text-xs font-medium transition-colors"
        >
          <Plus size={13} />
          New workspace
        </button>
      </div>

      {/* Tabs */}
      <div className="flex-shrink-0 flex items-end gap-1 px-3 pt-2 overflow-x-auto scrollbar-hide border-b border-white/[0.07]">
        {workspaces.map(ws => {
          const cfg = MODEL_CONFIG[ws.model];
          return (
            <div
              key={ws.id}
              onClick={() => setActiveId(ws.id)}
              className={`group flex-shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-t-lg cursor-pointer text-xs transition-colors max-w-[180px] ${
                ws.id === activeId
                  ? 'bg-portal-surface text-white border-t border-l border-r border-white/[0.07]'
                  : 'text-white/50 hover:text-white/80 hover:bg-white/5'
              }`}
            >
              {ws.isThinking
                ? <Loader2 size={11} className="animate-spin text-brand-400 flex-shrink-0" />
                : <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${cfg.dot}`} />
              }

              {editingTabId === ws.id ? (
                <input
                  autoFocus
                  value={editingTabName}
                  onChange={e => setEditingTabName(e.target.value)}
                  onBlur={() => commitRename(ws.id)}
                  onKeyDown={e => { if (e.key === 'Enter') commitRename(ws.id); if (e.key === 'Escape') setEditingTabId(null); }}
                  onClick={e => e.stopPropagation()}
                  className="bg-transparent border-b border-brand-400 outline-none w-20 text-white text-xs"
                />
              ) : (
                <span className="truncate">{ws.name}</span>
              )}

              {ws.id === activeId && editingTabId !== ws.id && (
                <button
                  onClick={e => startRenameTab(ws, e)}
                  className="opacity-0 group-hover:opacity-100 flex-shrink-0 p-0.5 hover:text-white transition-opacity"
                >
                  <Edit2 size={9} />
                </button>
              )}

              <button
                onClick={e => closeWorkspace(ws.id, e)}
                className="opacity-0 group-hover:opacity-100 flex-shrink-0 p-0.5 hover:text-red-400 transition-opacity ml-auto"
              >
                <X size={10} />
              </button>
            </div>
          );
        })}
      </div>

      {/* Active workspace messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4 min-h-0">
        {activeWorkspace.messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-center">
            <Bot size={32} className="text-white/20" />
            <p className="text-white/40 text-sm">Ask anything — task data, content, rankings, strategy.</p>
            <p className="text-white/25 text-xs">This workspace is isolated. Open more tabs to run parallel sessions.</p>
          </div>
        )}

        {activeWorkspace.messages.map(msg => (
          <div key={msg.id} className={`flex gap-2.5 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            {msg.role === 'assistant' && (
              <div className="flex-shrink-0 w-7 h-7 rounded-full bg-brand-500 flex items-center justify-center mt-0.5">
                <Bot size={14} className="text-white" />
              </div>
            )}
            <div className={`max-w-[75%] flex flex-col gap-1 ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
              <div
                className={`relative px-3.5 py-2.5 rounded-2xl text-sm ${
                  msg.role === 'user'
                    ? 'bg-brand-600 text-white rounded-tr-sm'
                    : 'bg-brand-500/10 border border-brand-500/20 text-portal-text rounded-tl-sm'
                }`}
              >
                <span className="whitespace-pre-wrap leading-relaxed">{msg.text}</span>
              </div>
              <div className="flex items-center gap-2 px-1">
                <span className="text-[10px] text-white/25">
                  {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
                {msg.role === 'assistant' && routeBadge(msg.routedTo)}
              </div>
            </div>
            {msg.role === 'user' && (
              <div className="flex-shrink-0 w-7 h-7 rounded-full bg-brand-500 flex items-center justify-center mt-0.5 text-white font-bold text-xs">
                {currentUser.name.charAt(0).toUpperCase()}
              </div>
            )}
          </div>
        ))}

        {activeWorkspace.isThinking && (
          <div className="flex gap-2.5 justify-start">
            <div className="flex-shrink-0 w-7 h-7 rounded-full bg-brand-500 flex items-center justify-center">
              <Bot size={14} className="text-white" />
            </div>
            <div className="bg-brand-500/10 border border-brand-500/20 rounded-2xl rounded-tl-sm px-3.5 py-2.5">
              <div className="flex items-center gap-1.5 py-0.5">
                <span className="w-2 h-2 bg-brand-400 rounded-full animate-bounce [animation-delay:-0.3s]" />
                <span className="w-2 h-2 bg-brand-400 rounded-full animate-bounce [animation-delay:-0.15s]" />
                <span className="w-2 h-2 bg-brand-400 rounded-full animate-bounce" />
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="flex-shrink-0 px-4 py-3 border-t border-white/[0.07]">
        {/* Model picker */}
        <div className="flex items-center justify-between mb-2">
          <div className="relative" ref={pickerRef}>
            <button
              onClick={() => setModelPickerOpen(o => !o)}
              className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 transition-colors text-xs"
            >
              <span className={`w-2 h-2 rounded-full ${activeCfg.dot}`} />
              <span className="text-white/70 font-medium">{activeCfg.label}</span>
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${activeCfg.badgeClass}`}>{activeCfg.badge}</span>
              <ChevronDown size={11} className={`text-white/40 transition-transform ${modelPickerOpen ? 'rotate-180' : ''}`} />
            </button>

            {modelPickerOpen && (
              <div className="absolute bottom-full mb-1 left-0 w-64 bg-portal-surface border border-white/[0.1] rounded-xl shadow-xl shadow-black/40 overflow-hidden z-50">
                {(Object.entries(MODEL_CONFIG) as [WorkspaceModel, typeof MODEL_CONFIG[WorkspaceModel]][]).map(([key, cfg]) => (
                  <button
                    key={key}
                    onClick={() => setWorkspaceModel(activeWorkspace.id, key)}
                    className={`w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-white/5 transition-colors ${
                      activeWorkspace.model === key ? 'bg-white/5' : ''
                    }`}
                  >
                    <span className={`w-2 h-2 rounded-full mt-1 flex-shrink-0 ${cfg.dot}`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-white">{cfg.label}</span>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${cfg.badgeClass}`}>{cfg.badge}</span>
                        {activeWorkspace.model === key && (
                          <Check size={11} className="text-brand-400 ml-auto flex-shrink-0" />
                        )}
                      </div>
                      <p className="text-xs text-white/40 mt-0.5">{cfg.description}</p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          <button
            onClick={() => clearWorkspace(activeWorkspace.id)}
            title="Clear workspace"
            className="p-1.5 rounded-lg text-white/25 hover:text-red-400 hover:bg-red-500/10 transition-colors"
          >
            <Trash2 size={13} />
          </button>
        </div>

        <div className="flex items-end gap-2">
          <div className="flex-1 relative">
            <textarea
              ref={inputRef}
              value={activeWorkspace.input}
              onChange={e => updateWorkspace(activeWorkspace.id, w => ({ ...w, input: e.target.value }))}
              onKeyDown={e => handleKeyDown(e, activeWorkspace.id)}
              placeholder={`Ask ${activeCfg.label} anything… (Enter to send, Shift+Enter for new line)`}
              rows={1}
              className="w-full bg-portal-surface border border-white/[0.08] rounded-xl px-4 py-3 text-sm text-white placeholder-white/30 outline-none focus:border-brand-500/50 resize-none overflow-hidden transition-colors"
              style={{ minHeight: '44px', maxHeight: '120px' }}
              onInput={e => {
                const el = e.currentTarget;
                el.style.height = 'auto';
                el.style.height = Math.min(el.scrollHeight, 120) + 'px';
              }}
              disabled={activeWorkspace.isThinking}
            />
          </div>
          <button
            onClick={() => sendMessage(activeWorkspace.id)}
            disabled={!activeWorkspace.input.trim() || activeWorkspace.isThinking}
            className="w-10 h-10 rounded-xl bg-brand-500 hover:bg-brand-600 disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center transition-colors flex-shrink-0"
          >
            {activeWorkspace.isThinking
              ? <Loader2 size={16} className="animate-spin text-white" />
              : <Send size={16} className="text-white" />
            }
          </button>
        </div>

        <p className="text-[10px] text-white/20 mt-1.5 pl-1">
          {activeWorkspace.messages.length} messages · session {currentUser.id.slice(0, 8)}-ws-{activeWorkspace.id}
        </p>
      </div>
    </div>
  );
};

export default EchoWorkspaces;
