/**
 * Echo Workspaces
 * Multiple independent AI chat sessions running in parallel.
 * Each workspace has its own history and bridge session — completely isolated.
 * Talks directly to the portal bridge (localhost:18790) via littleEchoService pattern.
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Plus, X, Bot, Send, Loader2, Trash2, Edit2, Check, Zap } from 'lucide-react';
import { User, ToastType } from '../types';

const BRIDGE_URL = (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_BRIDGE_URL) || 'http://localhost:18790';
const BRIDGE_SECRET = (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_ECHO_BRIDGE_SECRET) || 'brightforge-echo-bridge-2026';

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
  messages: WorkspaceMessage[];
  isThinking: boolean;
  input: string;
}

function makeId() {
  return Math.random().toString(36).slice(2, 10);
}

function makeWorkspace(name?: string): Workspace {
  return {
    id: makeId(),
    name: name || 'New workspace',
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
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Keep activeId in sync if workspaces change
  useEffect(() => {
    if (!workspaces.find(w => w.id === activeId) && workspaces.length > 0) {
      setActiveId(workspaces[workspaces.length - 1].id);
    }
  }, [workspaces, activeId]);

  // Scroll to bottom when active workspace messages change
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
      // Reset rather than close last one
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

    // Add user message, clear input, set thinking
    updateWorkspace(workspaceId, w => ({
      ...w,
      messages: [...w.messages, userMsg],
      input: '',
      isThinking: true,
    }));

    try {
      // Session ID is userId + workspaceId — keeps each workspace isolated on bridge
      const sessionUserId = `${currentUser.id}-ws-${workspaceId}`;

      const res = await fetch(`${BRIDGE_URL}/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${BRIDGE_SECRET}`,
        },
        body: JSON.stringify({
          message: userText,
          userId: currentUser.id,        // real ID — bridge checks admin status against this
          sessionKey: `${currentUser.id}-ws-${workspaceId}`, // unique per workspace tab
          userName: currentUser.name,
          history: [],
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
    if (!routedTo) return null;
    const colours: Record<string, string> = {
      sassin: 'bg-purple-500/20 text-purple-300',
      hermes: 'bg-blue-500/20 text-blue-300',
      'hermes-fallback': 'bg-yellow-500/20 text-yellow-300',
      batch: 'bg-green-500/20 text-green-300',
    };
    const labels: Record<string, string> = {
      sassin: 'Local',
      hermes: 'Claude',
      'hermes-fallback': 'Claude (fallback)',
      batch: 'Batch',
    };
    const cls = colours[routedTo] || 'bg-white/10 text-white/50';
    return (
      <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${cls}`}>
        {labels[routedTo] || routedTo}
      </span>
    );
  };

  if (!activeWorkspace) return null;

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
        {workspaces.map(ws => (
          <div
            key={ws.id}
            onClick={() => setActiveId(ws.id)}
            className={`group flex-shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-t-lg cursor-pointer text-xs transition-colors max-w-[160px] ${
              ws.id === activeId
                ? 'bg-portal-surface text-white border-t border-l border-r border-white/[0.07]'
                : 'text-white/50 hover:text-white/80 hover:bg-white/5'
            }`}
          >
            {ws.isThinking && (
              <Loader2 size={11} className="animate-spin text-brand-400 flex-shrink-0" />
            )}
            {!ws.isThinking && (
              <Bot size={11} className="text-white/40 flex-shrink-0" />
            )}

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
        ))}
      </div>

      {/* Active workspace messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4 min-h-0">
        {activeWorkspace.messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-center">
            <Bot size={32} className="text-white/20" />
            <p className="text-white/40 text-sm">Ask Echo anything — task data, content, rankings, strategy.</p>
            <p className="text-white/25 text-xs">This workspace is isolated. Open more tabs to run parallel sessions.</p>
          </div>
        )}

        {activeWorkspace.messages.map(msg => (
          <div key={msg.id} className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            {msg.role === 'assistant' && (
              <div className="flex-shrink-0 w-7 h-7 rounded-full bg-brand-500/20 flex items-center justify-center mt-0.5">
                <Bot size={14} className="text-brand-400" />
              </div>
            )}
            <div className={`max-w-[80%] ${msg.role === 'user' ? 'items-end' : 'items-start'} flex flex-col gap-1`}>
              <div
                className={`rounded-2xl px-4 py-2.5 text-sm whitespace-pre-wrap leading-relaxed ${
                  msg.role === 'user'
                    ? 'bg-brand-500 text-white rounded-tr-sm'
                    : 'bg-portal-surface text-white/90 rounded-tl-sm border border-white/[0.06]'
                }`}
              >
                {msg.text}
              </div>
              <div className="flex items-center gap-2 px-1">
                <span className="text-[10px] text-white/25">
                  {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
                {msg.role === 'assistant' && routeBadge(msg.routedTo)}
              </div>
            </div>
          </div>
        ))}

        {activeWorkspace.isThinking && (
          <div className="flex gap-3 justify-start">
            <div className="flex-shrink-0 w-7 h-7 rounded-full bg-brand-500/20 flex items-center justify-center">
              <Loader2 size={14} className="text-brand-400 animate-spin" />
            </div>
            <div className="bg-portal-surface border border-white/[0.06] rounded-2xl rounded-tl-sm px-4 py-2.5">
              <div className="flex gap-1 items-center h-5">
                <span className="w-1.5 h-1.5 bg-white/30 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="w-1.5 h-1.5 bg-white/30 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="w-1.5 h-1.5 bg-white/30 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="flex-shrink-0 px-4 py-3 border-t border-white/[0.07]">
        <div className="flex items-end gap-2">
          <div className="flex-1 relative">
            <textarea
              ref={inputRef}
              value={activeWorkspace.input}
              onChange={e => updateWorkspace(activeWorkspace.id, w => ({ ...w, input: e.target.value }))}
              onKeyDown={e => handleKeyDown(e, activeWorkspace.id)}
              placeholder="Ask Echo anything… (Enter to send, Shift+Enter for new line)"
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
          <div className="flex flex-col gap-1.5">
            <button
              onClick={() => sendMessage(activeWorkspace.id)}
              disabled={!activeWorkspace.input.trim() || activeWorkspace.isThinking}
              className="w-10 h-10 rounded-xl bg-brand-500 hover:bg-brand-600 disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center transition-colors"
            >
              {activeWorkspace.isThinking
                ? <Loader2 size={16} className="animate-spin text-white" />
                : <Send size={16} className="text-white" />
              }
            </button>
            <button
              onClick={() => clearWorkspace(activeWorkspace.id)}
              title="Clear workspace"
              className="w-10 h-10 rounded-xl bg-white/5 hover:bg-red-500/20 hover:text-red-400 text-white/30 flex items-center justify-center transition-colors"
            >
              <Trash2 size={14} />
            </button>
          </div>
        </div>
        <p className="text-[10px] text-white/25 mt-2 pl-1">
          Workspace session: <code className="font-mono">{currentUser.id.slice(0, 8)}-ws-{activeWorkspace.id}</code>
          &nbsp;·&nbsp;{activeWorkspace.messages.length} messages
        </p>
      </div>
    </div>
  );
};

export default EchoWorkspaces;
