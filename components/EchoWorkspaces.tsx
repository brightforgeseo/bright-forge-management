import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Plus, X, Bot, Send, Loader2, Trash2, Edit2, Check, Zap, ChevronDown,
  Paperclip, FileText, Image as ImageIcon, Database, ClipboardPaste, Search,
  LayoutTemplate, Copy, Save, MessageSquare, FilePlus, Archive, ArchiveRestore,
  Sparkles, Target, PanelRightOpen, PanelRightClose, ClipboardList,
} from 'lucide-react';
import { ChatMessage, ClientBoardSummary, ToastType, User } from '../types';
import { fetchClientBoardSummaries, sendChatMessage } from '../services/databaseService';
import { getBridgeUrl } from '../lib/bridgeClient';

const BRIDGE_URL = getBridgeUrl();
const BRIDGE_SECRET = 'brightforge-echo-bridge-2026';
const GENERAL_CHANNEL_ID = '12d8fb3a-4ddf-4557-97ea-b9dbac2520bc';
const MAX_WORKSPACES = 10;
const MAX_CONTEXT_FILES = 20;
const MAX_STAGED_FILES = 8;

type WorkspaceModel = 'sassin' | 'hermes';
type WorkspaceTemplateId = 'blank' | 'client-strategy' | 'technical-seo' | 'content-planning' | 'rankings' | 'ai-readiness' | 'team-ops' | 'client-reply';
type WorkspaceStatus = 'Idle' | 'Preparing context' | 'Reading workspace files' | 'Checking pinned client' | 'Writing answer';

const MODEL_CONFIG: Record<WorkspaceModel, { label: string; badge: string; badgeClass: string; dot: string; description: string; bestFor: string }> = {
  sassin: {
    label: 'Little Sassin',
    badge: 'Local',
    badgeClass: 'bg-purple-500/20 text-purple-300',
    dot: 'bg-purple-400',
    description: 'Fast portal and task context answers with no API cost',
    bestFor: 'Quick board checks, team ops, status questions',
  },
  hermes: {
    label: 'ChatGPT 5.5',
    badge: 'Cloud',
    badgeClass: 'bg-blue-500/20 text-blue-300',
    dot: 'bg-blue-400',
    description: 'Highest quality for complex strategy, files, screenshots and rankings',
    bestFor: 'Deep analysis, file work, SE Ranking, complex client strategy',
  },
};

const WORKSPACE_TEMPLATES: Record<WorkspaceTemplateId, { label: string; description: string; model: WorkspaceModel; starter: string; operatingMode: string; outputHint: string }> = {
  blank: {
    label: 'Blank workspace',
    description: 'Freeform AI workspace with manual context',
    model: 'sassin',
    starter: '',
    operatingMode: 'General Bright Forge workspace. Ask clarifying questions only when context is genuinely missing.',
    outputHint: 'Answer directly and keep next actions clear.',
  },
  'client-strategy': {
    label: 'Client Strategy',
    description: 'Board-aware strategy, risks and next-stage optimisation',
    model: 'hermes',
    starter: 'Review this client workspace and give me the sharpest strategy, risks, quick wins and next actions.',
    operatingMode: 'Client strategy workspace. Focus on commercial SEO outcomes, current board reality and practical next-stage optimisation.',
    outputHint: 'Return strategy, risks, quick wins, 30-day priorities and evidence needed.',
  },
  'technical-seo': {
    label: 'Technical SEO',
    description: 'Technical diagnosis, fixes, evidence and implementation tasks',
    model: 'hermes',
    starter: 'Act as a senior technical SEO. Diagnose the issue, prioritise fixes and produce implementation-ready tasks.',
    operatingMode: 'Technical SEO workspace. Be precise, implementation-ready and evidence-led. Do not hand-wave.',
    outputHint: 'Return diagnosis, impact, fix steps, validation and portal task wording.',
  },
  'content-planning': {
    label: 'Content Planning',
    description: 'Topics, briefs, AI Prompts, clusters and article direction',
    model: 'hermes',
    starter: 'Build a content plan with target keywords, article angles, internal links and AI Prompts.',
    operatingMode: 'Content planning workspace. Use Bright Forge terminology. The user-facing instruction field is AI Prompt, not brief.',
    outputHint: 'Return clusters, article titles, target keywords, AI Prompts and priority order.',
  },
  rankings: {
    label: 'Rankings / SE Ranking',
    description: 'Ranking questions and movement analysis',
    model: 'hermes',
    starter: 'Check rankings and explain what changed, what matters and what we should do next.',
    operatingMode: 'Rankings workspace. Use Hermes/ChatGPT for SE Ranking data. Separate data-backed claims from assumptions.',
    outputHint: 'Return movement summary, causes, opportunities and next actions.',
  },
  'ai-readiness': {
    label: 'AI Readiness',
    description: 'Deep-dive AI search readiness and llms.txt planning',
    model: 'hermes',
    starter: 'Run a deep AI readiness review and include llms.txt, entity clarity, answerability and technical foundations.',
    operatingMode: 'AI readiness workspace. This must be a deep dive, not a shallow checklist.',
    outputHint: 'Return gaps, entity work, content opportunities, llms.txt recommendations and implementation tasks.',
  },
  'team-ops': {
    label: 'Team Ops',
    description: 'Operational sweeps, task uptake and accountability',
    model: 'sassin',
    starter: 'Review operational state and tell me what is stuck, overdue, unassigned or needs chasing.',
    operatingMode: 'Team operations workspace. Focus on boards, owners, blockers, overdue work and practical accountability.',
    outputHint: 'Return issues, owners, blockers, required evidence and chase wording.',
  },
  'client-reply': {
    label: 'Email / Client Reply',
    description: 'Client-safe replies with evidence and next steps',
    model: 'hermes',
    starter: 'Draft a client-facing reply. Use we, be clear, confident and practical.',
    operatingMode: 'Client reply workspace. Draft in Bright Forge voice. Use we, never I. Do not expose internal tooling.',
    outputHint: 'Return a polished client reply plus internal notes if useful.',
  },
};

export interface WorkspaceAttachment {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  kind: 'image' | 'document';
  dataUrl?: string;
  text?: string;
}

interface WorkspaceMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  timestamp: string;
  routedTo?: string;
  attachments?: Omit<WorkspaceAttachment, 'dataUrl' | 'text'>[];
}

interface WorkspaceOutput {
  id: string;
  title: string;
  text: string;
  sourceMessageId: string;
  createdAt: string;
  kind: WorkspaceTemplateId;
}

interface Workspace {
  id: string;
  name: string;
  model: WorkspaceModel;
  messages: WorkspaceMessage[];
  savedOutputs: WorkspaceOutput[];
  isThinking: boolean;
  status: WorkspaceStatus;
  input: string;
  contextFiles: WorkspaceAttachment[];
  pinnedClientId?: string;
  pinnedClientDbId?: string;
  pinnedClientName?: string;
  templateId: WorkspaceTemplateId;
  archived?: boolean;
}

interface Props {
  currentUser: User;
  addToast: (type: ToastType, message: string) => void;
}

function makeId() {
  return Math.random().toString(36).slice(2, 10);
}

function formatBytes(b: number) {
  if (b < 1024) return `${b}B`;
  if (b < 1024 * 1024) return `${Math.ceil(b / 1024)}KB`;
  return `${(b / (1024 * 1024)).toFixed(1)}MB`;
}

function templateTitle(templateId: WorkspaceTemplateId, clientName?: string) {
  const base = WORKSPACE_TEMPLATES[templateId]?.label || 'Workspace';
  return clientName ? `${clientName} ${base}`.slice(0, 42) : base;
}

function makeWorkspace(name?: string, templateId: WorkspaceTemplateId = 'blank', client?: ClientBoardSummary): Workspace {
  const template = WORKSPACE_TEMPLATES[templateId];
  return {
    id: makeId(),
    name: name || templateTitle(templateId, client?.name) || 'New workspace',
    model: template.model,
    messages: [],
    savedOutputs: [],
    isThinking: false,
    status: 'Idle',
    input: template.starter,
    contextFiles: [],
    pinnedClientId: client?.id,
    pinnedClientDbId: client?.db_id,
    pinnedClientName: client?.name,
    templateId,
    archived: false,
  };
}

function safeStoredAttachment(att: WorkspaceAttachment): WorkspaceAttachment {
  const keepDataUrl = att.dataUrl && att.dataUrl.length < 350000 ? att.dataUrl : undefined;
  return {
    ...att,
    dataUrl: keepDataUrl,
    text: att.text ? att.text.slice(0, 120000) : undefined,
  };
}

function buildWorkspaceBrief(ws: Workspace) {
  const template = WORKSPACE_TEMPLATES[ws.templateId] || WORKSPACE_TEMPLATES.blank;
  const clientLine = ws.pinnedClientName ? `Pinned client: ${ws.pinnedClientName}` : 'Pinned client: none';
  const contextLine = `${ws.contextFiles.length} context file${ws.contextFiles.length === 1 ? '' : 's'}`;
  const latestUser = [...ws.messages].reverse().find(m => m.role === 'user')?.text || 'No user message yet';
  return [
    `Workspace brief: ${ws.name}`,
    clientLine,
    `Mode: ${template.label}`,
    `Recommended model: ${MODEL_CONFIG[template.model].label}`,
    `Saved context: ${contextLine}`,
    `Latest ask: ${latestUser.slice(0, 500)}`,
    `Expected output: ${template.outputHint}`,
  ].join('\n');
}

function inferOutputTitle(text: string, ws: Workspace) {
  const firstLine = text.split('\n').map(l => l.trim()).find(Boolean) || WORKSPACE_TEMPLATES[ws.templateId].label;
  return firstLine.replace(/^#+\s*/, '').slice(0, 80);
}

const EchoWorkspaces: React.FC<Props> = ({ currentUser, addToast }) => {
  const [workspaces, setWorkspaces] = useState<Workspace[]>(() => {
    try {
      const saved = localStorage.getItem('echo-workspaces');
      if (saved) {
        const parsed = JSON.parse(saved) as Workspace[];
        return parsed.map(w => {
          const savedModel = (w as any).model;
          const model: WorkspaceModel = savedModel === 'hermes' || savedModel === 'sassin' ? savedModel : 'sassin';
          return {
            ...w,
            model,
            templateId: w.templateId || 'blank',
            savedOutputs: w.savedOutputs || [],
            isThinking: false,
            status: 'Idle',
            input: w.input || '',
            contextFiles: (w.contextFiles || []).map(safeStoredAttachment),
          };
        });
      }
    } catch {}
    return [makeWorkspace('Workspace 1')];
  });
  const [activeId, setActiveId] = useState<string>(() => {
    try { return localStorage.getItem('echo-workspaces-active') || ''; } catch { return ''; }
  });
  const [editingTabId, setEditingTabId] = useState<string | null>(null);
  const [editingTabName, setEditingTabName] = useState('');
  const [modelPickerOpen, setModelPickerOpen] = useState(false);
  const [templatePickerOpen, setTemplatePickerOpen] = useState(false);
  const [clientPickerOpen, setClientPickerOpen] = useState(false);
  const [attachMenuOpen, setAttachMenuOpen] = useState(false);
  const [workspaceSearch, setWorkspaceSearch] = useState('');
  const [clientSearch, setClientSearch] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [showOutputPanel, setShowOutputPanel] = useState(true);
  const [clients, setClients] = useState<ClientBoardSummary[]>([]);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const contextFileInputRef = useRef<HTMLInputElement>(null);
  const pickerRef = useRef<HTMLDivElement>(null);
  const templateRef = useRef<HTMLDivElement>(null);
  const clientRef = useRef<HTMLDivElement>(null);
  const attachMenuRef = useRef<HTMLDivElement>(null);

  const [stagedAttachments, setStagedAttachments] = useState<Record<string, WorkspaceAttachment[]>>({});

  useEffect(() => {
    let alive = true;
    fetchClientBoardSummaries().then(rows => { if (alive) setClients(rows); });
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (pickerRef.current && !pickerRef.current.contains(target)) setModelPickerOpen(false);
      if (templateRef.current && !templateRef.current.contains(target)) setTemplatePickerOpen(false);
      if (clientRef.current && !clientRef.current.contains(target)) setClientPickerOpen(false);
      if (attachMenuRef.current && !attachMenuRef.current.contains(target)) setAttachMenuOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useEffect(() => {
    if (!workspaces.find(w => w.id === activeId && (!w.archived || showArchived)) && workspaces.length > 0) {
      const next = workspaces.find(w => !w.archived) || workspaces[0];
      setActiveId(next.id);
    }
  }, [workspaces, activeId, showArchived]);

  useEffect(() => {
    try {
      const toSave = workspaces.map(w => ({
        ...w,
        messages: w.messages.slice(-80),
        savedOutputs: (w.savedOutputs || []).slice(-25),
        isThinking: false,
        status: 'Idle',
        contextFiles: (w.contextFiles || []).map(safeStoredAttachment),
      }));
      localStorage.setItem('echo-workspaces', JSON.stringify(toSave));
    } catch (err) {
      console.warn('[EchoWorkspaces] local storage quota hit, saving compact workspace state', err);
      try {
        const compact = workspaces.map(w => ({ ...w, messages: w.messages.slice(-25), contextFiles: (w.contextFiles || []).map(({ dataUrl, text, ...rest }) => rest) }));
        localStorage.setItem('echo-workspaces', JSON.stringify(compact));
      } catch {}
    }
  }, [workspaces]);

  useEffect(() => {
    try { localStorage.setItem('echo-workspaces-active', activeId); } catch {}
  }, [activeId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [workspaces, activeId]);

  const isOwner = currentUser.role === 'Owner';
  const availableModels = (Object.entries(MODEL_CONFIG) as [WorkspaceModel, typeof MODEL_CONFIG[WorkspaceModel]][])
    .filter(([key]) => key !== 'hermes' || isOwner);
  const activeWorkspace = workspaces.find(w => w.id === activeId) ?? workspaces.find(w => !w.archived) ?? workspaces[0];
  const activeCfg = MODEL_CONFIG[activeWorkspace?.model || 'sassin'] || MODEL_CONFIG.sassin;
  const activeTemplate = WORKSPACE_TEMPLATES[activeWorkspace?.templateId || 'blank'] || WORKSPACE_TEMPLATES.blank;

  const visibleWorkspaces = useMemo(() => {
    const q = workspaceSearch.trim().toLowerCase();
    return workspaces.filter(w => {
      if (!showArchived && w.archived) return false;
      if (!q) return true;
      return [w.name, w.pinnedClientName, WORKSPACE_TEMPLATES[w.templateId]?.label]
        .filter(Boolean)
        .some(v => String(v).toLowerCase().includes(q));
    });
  }, [workspaces, workspaceSearch, showArchived]);

  const filteredClients = useMemo(() => {
    const q = clientSearch.trim().toLowerCase();
    return clients.filter(c => !q || c.name.toLowerCase().includes(q)).slice(0, 80);
  }, [clients, clientSearch]);

  const updateWorkspace = useCallback((id: string, updater: (w: Workspace) => Workspace) => {
    setWorkspaces(prev => prev.map(w => w.id === id ? updater(w) : w));
  }, []);

  const addWorkspace = (templateId: WorkspaceTemplateId = 'blank', client?: ClientBoardSummary) => {
    if (workspaces.filter(w => !w.archived).length >= MAX_WORKSPACES) {
      addToast('info', `Maximum ${MAX_WORKSPACES} active workspaces open at once`);
      return;
    }
    const base = makeWorkspace(undefined, templateId, client);
    const ws = base.model === 'hermes' && !isOwner ? { ...base, model: 'sassin' as WorkspaceModel } : base;
    setWorkspaces(prev => [...prev, ws]);
    setActiveId(ws.id);
    setTemplatePickerOpen(false);
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  const closeWorkspace = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const active = workspaces.filter(w => !w.archived);
    if (active.length === 1) {
      setWorkspaces(prev => prev.map(w => w.id === id ? makeWorkspace('Workspace 1') : w));
      return;
    }
    const idx = active.findIndex(w => w.id === id);
    const next = active[idx === 0 ? 1 : idx - 1];
    setWorkspaces(prev => prev.filter(w => w.id !== id));
    setActiveId(next.id);
  };

  const archiveWorkspace = (id: string) => {
    updateWorkspace(id, w => ({ ...w, archived: !w.archived }));
    const next = workspaces.find(w => w.id !== id && !w.archived);
    if (next) setActiveId(next.id);
  };

  const clearChat = (id: string) => updateWorkspace(id, w => ({ ...w, messages: [] }));

  const setWorkspaceModel = (id: string, model: WorkspaceModel) => {
    updateWorkspace(id, w => ({ ...w, model }));
    setModelPickerOpen(false);
  };

  const applyTemplate = (id: string, templateId: WorkspaceTemplateId) => {
    const template = WORKSPACE_TEMPLATES[templateId];
    updateWorkspace(id, w => ({
      ...w,
      templateId,
      model: template.model === 'hermes' && !isOwner ? 'sassin' : template.model,
      name: w.name.startsWith('Workspace') || w.name === WORKSPACE_TEMPLATES[w.templateId]?.label ? templateTitle(templateId, w.pinnedClientName) : w.name,
      input: w.input.trim() ? w.input : template.starter,
    }));
    setTemplatePickerOpen(false);
  };

  const pinClient = (id: string, client?: ClientBoardSummary) => {
    updateWorkspace(id, w => ({
      ...w,
      pinnedClientId: client?.id,
      pinnedClientDbId: client?.db_id,
      pinnedClientName: client?.name,
      name: client ? templateTitle(w.templateId, client.name) : w.name,
    }));
    setClientPickerOpen(false);
    setClientSearch('');
  };

  const fileToAttachment = (file: File): Promise<WorkspaceAttachment> =>
    new Promise((resolve, reject) => {
      const isImage = file.type.startsWith('image/');
      const isText = file.type.startsWith('text/') || /\.(txt|md|csv|json|html?|xml)$/i.test(file.name);
      const reader = new FileReader();
      reader.onerror = () => reject(new Error(`Could not read ${file.name}`));
      reader.onload = () => resolve({
        id: makeId(),
        name: file.name || `image-${Date.now()}.png`,
        mimeType: file.type || (isImage ? 'image/png' : 'application/octet-stream'),
        size: file.size,
        kind: isImage ? 'image' : 'document',
        dataUrl: isImage || !isText ? String(reader.result || '') : undefined,
        text: isText && !isImage ? String(reader.result || '').slice(0, 120000) : undefined,
      });
      if (isImage || !isText) reader.readAsDataURL(file);
      else reader.readAsText(file);
    });

  const prepareFiles = async (files: FileList | File[], dest: 'stage' | 'context', wsId: string) => {
    const fileArray = Array.from(files).slice(0, 6);
    const tooLarge = fileArray.find(f => f.size > 8 * 1024 * 1024);
    if (tooLarge) {
      addToast('error', `${tooLarge.name} is too large. Keep uploads under 8MB`);
      return;
    }
    try {
      const atts = await Promise.all(fileArray.map(fileToAttachment));
      if (dest === 'stage') {
        setStagedAttachments(prev => ({ ...prev, [wsId]: [...(prev[wsId] || []), ...atts].slice(0, MAX_STAGED_FILES) }));
      } else {
        updateWorkspace(wsId, w => ({ ...w, contextFiles: [...(w.contextFiles || []), ...atts].slice(0, MAX_CONTEXT_FILES) }));
        addToast('success', `${atts.length} file${atts.length > 1 ? 's' : ''} saved to workspace context`);
      }
    } catch (err: any) {
      addToast('error', err.message || 'Could not read file');
    }
  };

  const removeStaged = (wsId: string, id: string) => setStagedAttachments(prev => ({ ...prev, [wsId]: (prev[wsId] || []).filter(a => a.id !== id) }));
  const removeContextFile = (wsId: string, id: string) => updateWorkspace(wsId, w => ({ ...w, contextFiles: w.contextFiles.filter(a => a.id !== id) }));
  const clearContextFiles = (wsId: string) => updateWorkspace(wsId, w => ({ ...w, contextFiles: [] }));

  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>, wsId: string) => {
    const items = Array.from(e.clipboardData.items || []) as DataTransferItem[];
    const files = items
      .filter(item => item.kind === 'file')
      .map(item => item.getAsFile())
      .filter((file): file is File => Boolean(file));
    if (files.length) {
      e.preventDefault();
      prepareFiles(files, 'stage', wsId);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>, wsId: string) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(wsId);
    }
  };

  const addSavedOutput = (workspaceId: string, text: string, sourceMessageId: string) => {
    updateWorkspace(workspaceId, w => ({
      ...w,
      savedOutputs: [{
        id: makeId(),
        title: inferOutputTitle(text, w),
        text,
        sourceMessageId,
        createdAt: new Date().toISOString(),
        kind: w.templateId,
      }, ...(w.savedOutputs || [])].slice(0, 25),
    }));
  };

  const sendMessage = async (workspaceId: string) => {
    const ws = workspaces.find(w => w.id === workspaceId);
    const staged = stagedAttachments[workspaceId] || [];
    if (!ws || (!ws.input.trim() && staged.length === 0) || ws.isThinking) return;

    const userText = ws.input.trim() || 'Analyse the attached file(s).';
    const userMsg: WorkspaceMessage = {
      id: makeId(),
      role: 'user',
      text: userText,
      timestamp: new Date().toISOString(),
      attachments: staged.map(({ dataUrl, text, ...a }) => a),
    };

    updateWorkspace(workspaceId, w => ({ ...w, messages: [...w.messages, userMsg], input: '', isThinking: true, status: 'Preparing context' }));
    setStagedAttachments(prev => ({ ...prev, [workspaceId]: [] }));

    const statusTimers = [
      window.setTimeout(() => updateWorkspace(workspaceId, w => w.isThinking ? ({ ...w, status: 'Reading workspace files' }) : w), 900),
      window.setTimeout(() => updateWorkspace(workspaceId, w => w.isThinking ? ({ ...w, status: 'Checking pinned client' }) : w), 1800),
      window.setTimeout(() => updateWorkspace(workspaceId, w => w.isThinking ? ({ ...w, status: 'Writing answer' }) : w), 3200),
    ];

    try {
      const pinnedClient = ws.pinnedClientId ? {
        id: ws.pinnedClientId,
        db_id: ws.pinnedClientDbId,
        name: ws.pinnedClientName,
      } : null;
      const res = await fetch(`${BRIDGE_URL}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${BRIDGE_SECRET}` },
        body: JSON.stringify({
          message: userText,
          userId: currentUser.id,
          sessionKey: `${currentUser.id}-ws-${workspaceId}`,
          userName: currentUser.name,
          history: [],
          model: ws.model,
          attachments: staged,
          contextFiles: ws.contextFiles || [],
          pinnedClient,
          workspaceTemplate: {
            id: ws.templateId,
            label: WORKSPACE_TEMPLATES[ws.templateId].label,
            operatingMode: WORKSPACE_TEMPLATES[ws.templateId].operatingMode,
            outputHint: WORKSPACE_TEMPLATES[ws.templateId].outputHint,
          },
          workspaceBrief: buildWorkspaceBrief(ws),
        }),
      });
      if (!res.ok) throw new Error(`Bridge error ${res.status}`);
      const data = await res.json();
      const assistantId = makeId();
      const assistantText = data.response || '(no response)';
      updateWorkspace(workspaceId, w => ({
        ...w,
        isThinking: false,
        status: 'Idle',
        messages: [...w.messages, { id: assistantId, role: 'assistant', text: assistantText, timestamp: new Date().toISOString(), routedTo: data.routed_to }],
      }));
      addSavedOutput(workspaceId, assistantText, assistantId);
    } catch (err: any) {
      updateWorkspace(workspaceId, w => ({
        ...w,
        isThinking: false,
        status: 'Idle',
        messages: [...w.messages, { id: makeId(), role: 'assistant', text: `Error: ${err.message}. Is the bridge running?`, timestamp: new Date().toISOString() }],
      }));
    } finally {
      statusTimers.forEach(window.clearTimeout);
    }
  };

  const copyText = async (text: string, label = 'Copied') => {
    await navigator.clipboard.writeText(text);
    addToast('success', label);
  };

  const saveOutput = (msg: WorkspaceMessage) => {
    if (!activeWorkspace || msg.role !== 'assistant') return;
    addSavedOutput(activeWorkspace.id, msg.text, msg.id);
    addToast('success', 'Save output complete');
  };

  const openInContentTool = (text: string) => {
    const payload = { topic: activeWorkspace?.pinnedClientName || '', aiPrompt: text, source: 'echo-workspace' };
    try {
      localStorage.setItem('keywordResearchContentSeed', JSON.stringify(payload));
      window.dispatchEvent(new CustomEvent('keywordResearchContentSeed', { detail: payload }));
      window.dispatchEvent(new CustomEvent('navigateToView', { detail: { view: 'CONTENT_GENERATOR' } }));
    } catch {}
    addToast('success', 'Saved for Content Tool');
  };

  const sendOutputToGeneral = async (text: string) => {
    const msg: ChatMessage = {
      id: makeId(),
      channelId: GENERAL_CHANNEL_ID,
      sender: 'Echo AI',
      senderId: currentUser.id,
      text: `[From Echo Workspace${activeWorkspace?.pinnedClientName ? `: ${activeWorkspace.pinnedClientName}` : ''}]\n\n${text}`,
      timestamp: new Date().toISOString(),
      isAi: true,
      avatar: 'bot',
    };
    await sendChatMessage(msg);
    addToast('success', 'Sent to General chat');
  };

  const makeTaskBrief = (text: string) => {
    const task = [
      `Task source: Echo Workspace${activeWorkspace?.pinnedClientName ? `, ${activeWorkspace.pinnedClientName}` : ''}`,
      '',
      'Action required:',
      text.slice(0, 2500),
      '',
      'Evidence needed before Done:',
      '- Link, screenshot or report showing the fix/output is complete',
    ].join('\n');
    copyText(task, 'Task brief copied');
  };

  const startRename = (ws: Workspace, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingTabId(ws.id);
    setEditingTabName(ws.name);
  };

  const commitRename = (id: string) => {
    if (editingTabName.trim()) updateWorkspace(id, w => ({ ...w, name: editingTabName.trim() }));
    setEditingTabId(null);
  };

  const routeBadge = (routedTo?: string) => {
    if (!routedTo || routedTo === 'system') return null;
    const map: Record<string, { cls: string; label: string }> = {
      sassin: { cls: 'bg-purple-500/20 text-purple-300', label: 'Local' },
      'sassin-member': { cls: 'bg-purple-500/20 text-purple-300', label: 'Local' },
      echo: { cls: 'bg-amber-500/20 text-amber-300', label: 'Local Echo' },
      hermes: { cls: 'bg-blue-500/20 text-blue-300', label: 'ChatGPT 5.5' },
      'hermes-input': { cls: 'bg-blue-500/20 text-blue-300', label: 'Input analysis' },
      'hermes-fallback': { cls: 'bg-yellow-500/20 text-yellow-300', label: 'ChatGPT fallback' },
      batch: { cls: 'bg-brand-500/20 text-brand-300', label: 'Batch' },
    };
    const m = map[routedTo] || { cls: 'bg-white/10 text-white/50', label: routedTo };
    return <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${m.cls}`}>{m.label}</span>;
  };

  if (!activeWorkspace) return null;

  const staged = stagedAttachments[activeWorkspace.id] || [];
  const contextFiles = activeWorkspace.contextFiles || [];
  const allOutputs = activeWorkspace.savedOutputs || [];

  return (
    <div className="flex flex-col h-full bg-portal-bg">
      <div className="flex-shrink-0 flex items-center justify-between px-4 py-3 border-b border-white/[0.07]">
        <div className="flex items-center gap-2">
          <Zap size={16} className="text-brand-400" />
          <span className="text-sm font-semibold text-white">Echo Workspaces</span>
          <span className="text-xs text-white/40">{workspaces.filter(w => !w.archived).length}/{MAX_WORKSPACES}</span>
          {activeWorkspace.pinnedClientName && <span className="hidden md:inline-flex text-[10px] px-2 py-0.5 rounded-full bg-brand-500/15 text-brand-300">{activeWorkspace.pinnedClientName}</span>}
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowOutputPanel(v => !v)} className="p-1.5 rounded-lg text-white/35 hover:text-white hover:bg-white/5" title="Toggle output panel">
            {showOutputPanel ? <PanelRightClose size={15} /> : <PanelRightOpen size={15} />}
          </button>
          <div className="relative" ref={templateRef}>
            <button onClick={() => setTemplatePickerOpen(o => !o)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/[0.05] hover:bg-white/[0.1] text-white/70 text-xs font-medium transition-colors">
              <LayoutTemplate size={13} /> Templates
            </button>
            {templatePickerOpen && (
              <div className="absolute right-0 mt-2 w-80 bg-portal-surface border border-white/[0.1] rounded-xl shadow-xl shadow-black/50 overflow-hidden z-50 p-1.5">
                {(Object.entries(WORKSPACE_TEMPLATES) as [WorkspaceTemplateId, typeof WORKSPACE_TEMPLATES[WorkspaceTemplateId]][]).map(([id, t]) => (
                  <button key={id} onClick={() => addWorkspace(id)} className="w-full flex items-start gap-3 px-3 py-2.5 rounded-lg text-left hover:bg-white/5 transition-colors">
                    <Sparkles size={14} className="text-brand-400 mt-0.5 flex-shrink-0" />
                    <span className="min-w-0">
                      <span className="block text-sm text-white font-medium">{t.label}</span>
                      <span className="block text-[11px] text-white/40">{t.description}</span>
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <button onClick={() => addWorkspace()} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-brand-500/20 hover:bg-brand-500/30 text-brand-300 text-xs font-medium transition-colors">
            <Plus size={13} /> New workspace
          </button>
        </div>
      </div>

      <div className="flex-shrink-0 flex items-center gap-2 px-3 py-2 border-b border-white/[0.07]">
        <div className="flex items-center gap-2 px-2.5 py-1.5 bg-white/[0.04] border border-white/[0.06] rounded-lg w-52">
          <Search size={12} className="text-white/30" />
          <input value={workspaceSearch} onChange={e => setWorkspaceSearch(e.target.value)} placeholder="Search workspaces" className="bg-transparent outline-none text-xs text-white placeholder-white/25 w-full" />
        </div>
        <button onClick={() => setShowArchived(v => !v)} className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs transition-colors ${showArchived ? 'bg-brand-500/15 text-brand-300' : 'text-white/35 hover:text-white hover:bg-white/5'}`}>
          <Archive size={12} /> Archived
        </button>
        <div className="flex items-end gap-1 overflow-x-auto scrollbar-hide min-w-0 flex-1">
          {visibleWorkspaces.map(ws => {
            const cfg = MODEL_CONFIG[ws.model] || MODEL_CONFIG.sassin;
            const hasCtx = (ws.contextFiles || []).length > 0;
            return (
              <div key={ws.id} onClick={() => setActiveId(ws.id)} className={`group flex-shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-lg cursor-pointer text-xs transition-colors max-w-[210px] ${ws.id === activeId ? 'bg-portal-surface text-white border border-white/[0.07]' : 'text-white/50 hover:text-white/80 hover:bg-white/5'}`}>
                {ws.isThinking ? <Loader2 size={11} className="animate-spin text-brand-400 flex-shrink-0" /> : <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${cfg.dot}`} />}
                {hasCtx && <span title="Has workspace context" className="flex-shrink-0"><Database size={9} className="text-brand-400/70" /></span>}
                {editingTabId === ws.id ? (
                  <input autoFocus value={editingTabName} onChange={e => setEditingTabName(e.target.value)} onBlur={() => commitRename(ws.id)} onKeyDown={e => { if (e.key === 'Enter') commitRename(ws.id); if (e.key === 'Escape') setEditingTabId(null); }} onClick={e => e.stopPropagation()} className="bg-transparent border-b border-brand-400 outline-none w-24 text-white text-xs" />
                ) : <span className="truncate">{ws.name}</span>}
                {ws.id === activeId && editingTabId !== ws.id && <button onClick={e => startRename(ws, e)} className="opacity-0 group-hover:opacity-100 text-white/25 hover:text-white"><Edit2 size={10} /></button>}
                <button onClick={e => { e.stopPropagation(); archiveWorkspace(ws.id); }} className="opacity-0 group-hover:opacity-100 text-white/25 hover:text-yellow-300">{ws.archived ? <ArchiveRestore size={10} /> : <Archive size={10} />}</button>
                <button onClick={e => closeWorkspace(ws.id, e)} className="opacity-0 group-hover:opacity-100 text-white/25 hover:text-red-400"><X size={10} /></button>
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex-shrink-0 px-4 py-2 border-b border-white/[0.07] bg-portal-surface/35">
        <div className="max-w-6xl mx-auto flex flex-wrap items-center gap-2">
          <div className="relative" ref={clientRef}>
            <button onClick={() => setClientPickerOpen(o => !o)} className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 transition-colors text-xs">
              <Target size={12} className="text-brand-400" />
              <span className="text-white/70">{activeWorkspace.pinnedClientName || 'Pin client'}</span>
              <ChevronDown size={11} className="text-white/30" />
            </button>
            {clientPickerOpen && (
              <div className="absolute top-full mt-2 left-0 w-80 bg-portal-surface border border-white/[0.1] rounded-xl shadow-xl shadow-black/50 overflow-hidden z-50 p-2">
                <input value={clientSearch} onChange={e => setClientSearch(e.target.value)} placeholder="Search clients" className="w-full mb-2 bg-white/[0.05] border border-white/[0.07] rounded-lg px-3 py-2 text-xs text-white placeholder-white/30 outline-none" />
                <button onClick={() => pinClient(activeWorkspace.id)} className="w-full text-left px-3 py-2 rounded-lg hover:bg-white/5 text-xs text-white/45">No pinned client</button>
                <div className="max-h-72 overflow-y-auto space-y-0.5">
                  {filteredClients.map(client => (
                    <button key={client.id} onClick={() => pinClient(activeWorkspace.id, client)} className="w-full flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-white/5 text-left">
                      <span className="w-6 h-6 rounded-md flex items-center justify-center text-[10px] text-white font-bold" style={{ backgroundColor: client.color || '#f97316' }}>{client.initials}</span>
                      <span className="text-xs text-white/80 truncate">{client.name}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="relative" ref={pickerRef}>
            <button onClick={() => setModelPickerOpen(o => !o)} className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 transition-colors text-xs">
              <span className={`w-2 h-2 rounded-full ${activeCfg.dot}`} />
              <span className="text-white/70 font-medium">{activeCfg.label}</span>
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${activeCfg.badgeClass}`}>{activeCfg.badge}</span>
              <ChevronDown size={11} className={`text-white/40 transition-transform ${modelPickerOpen ? 'rotate-180' : ''}`} />
            </button>
            {modelPickerOpen && (
              <div className="absolute top-full mt-2 left-0 w-72 bg-portal-surface border border-white/[0.1] rounded-xl shadow-xl shadow-black/40 overflow-hidden z-50">
                <div className="px-4 py-2 text-[10px] uppercase tracking-wider text-white/30 border-b border-white/[0.06]">Recommended model: {MODEL_CONFIG[activeTemplate.model].label}</div>
                {availableModels.map(([key, cfg]) => (
                  <button key={key} onClick={() => setWorkspaceModel(activeWorkspace.id, key)} className={`w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-white/5 transition-colors ${activeWorkspace.model === key ? 'bg-white/5' : ''}`}>
                    <span className={`w-2 h-2 rounded-full mt-1 flex-shrink-0 ${cfg.dot}`} />
                    <span className="flex-1 min-w-0">
                      <span className="flex items-center gap-2"><span className="text-sm font-medium text-white">{cfg.label}</span><span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${cfg.badgeClass}`}>{cfg.badge}</span>{activeWorkspace.model === key && <Check size={11} className="text-brand-400 ml-auto" />}</span>
                      <span className="block text-xs text-white/40 mt-0.5">{cfg.description}</span>
                      <span className="block text-[11px] text-white/25 mt-1">{cfg.bestFor}</span>
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <select value={activeWorkspace.templateId} onChange={e => applyTemplate(activeWorkspace.id, e.target.value as WorkspaceTemplateId)} className="bg-white/[0.05] border border-white/[0.06] rounded-lg px-2.5 py-1.5 text-xs text-white outline-none">
            {(Object.entries(WORKSPACE_TEMPLATES) as [WorkspaceTemplateId, typeof WORKSPACE_TEMPLATES[WorkspaceTemplateId]][]).map(([id, t]) => <option key={id} value={id}>{t.label}</option>)}
          </select>

          <span className="text-[11px] text-white/35 truncate min-w-[220px] flex-1">{activeTemplate.outputHint}</span>
          <button onClick={() => copyText(buildWorkspaceBrief(activeWorkspace), 'Workspace brief copied')} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs text-white/45 hover:text-white hover:bg-white/5"><ClipboardList size={12} /> Workspace brief</button>
        </div>
      </div>

      {contextFiles.length > 0 && (
        <div className="flex-shrink-0 px-4 py-2 border-b border-white/[0.06] bg-brand-500/[0.03]">
          <div className="max-w-6xl mx-auto flex items-center gap-2 overflow-x-auto scrollbar-hide">
            <span className="text-[10px] uppercase tracking-wider text-white/25 flex-shrink-0">Workspace context</span>
            {contextFiles.map(file => (
              <div key={file.id} className="group flex items-center gap-1.5 px-2 py-1 rounded-lg bg-white/[0.04] border border-white/[0.06] text-[11px] text-white/55 flex-shrink-0">
                {file.kind === 'image' ? <ImageIcon size={11} /> : <FileText size={11} />}
                <span className="max-w-[180px] truncate">{file.name}</span>
                <span className="text-white/25">{formatBytes(file.size)}</span>
                <button onClick={() => removeContextFile(activeWorkspace.id, file.id)} className="opacity-0 group-hover:opacity-100 text-white/25 hover:text-red-400"><X size={10} /></button>
              </div>
            ))}
            <button onClick={() => clearContextFiles(activeWorkspace.id)} className="flex-shrink-0 text-[10px] text-white/25 hover:text-red-400">Clear all</button>
          </div>
        </div>
      )}

      <div className="flex-1 min-h-0 flex">
        <div className="flex-1 overflow-y-auto py-4 min-h-0">
          <div className="max-w-3xl mx-auto px-4 space-y-4">
            {activeWorkspace.messages.length === 0 && (
              <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
                <Bot size={32} className="text-white/20" />
                <p className="text-white/45 text-sm">{activeTemplate.label}: {activeTemplate.description}</p>
                <p className="text-white/25 text-xs leading-relaxed">Pin a client, choose a template, attach files, then turn answers into outputs, tasks or team messages.</p>
              </div>
            )}

            {activeWorkspace.messages.map(msg => (
              <div key={msg.id} className={`group flex gap-2.5 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                {msg.role === 'assistant' && <div className="flex-shrink-0 w-7 h-7 rounded-full bg-brand-500 flex items-center justify-center mt-0.5"><Bot size={14} className="text-white" /></div>}
                <div className={`max-w-[75%] flex flex-col gap-1 ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                  <div className={`relative px-3.5 py-2.5 rounded-2xl text-sm ${msg.role === 'user' ? 'bg-brand-600 text-white rounded-tr-sm' : 'bg-brand-500/10 border border-brand-500/20 text-portal-text rounded-tl-sm'}`}>
                    {(msg.attachments || []).filter(a => a.kind === 'image').length > 0 && <div className="flex flex-wrap gap-1.5 mb-2">{(msg.attachments || []).filter(a => a.kind === 'image').map(att => <div key={att.id} className="flex items-center gap-1.5 text-[11px] bg-black/20 rounded-lg px-2 py-1 text-white/70"><ImageIcon size={11} /><span className="max-w-[160px] truncate">{att.name}</span><span className="text-white/35">{formatBytes(att.size)}</span></div>)}</div>}
                    <span className="whitespace-pre-wrap leading-relaxed">{msg.text}</span>
                    {(msg.attachments || []).filter(a => a.kind === 'document').length > 0 && <div className="mt-2 space-y-1">{(msg.attachments || []).filter(a => a.kind === 'document').map(att => <div key={att.id} className="flex items-center gap-2 rounded-lg bg-black/15 px-2 py-1.5 text-xs text-white/70"><FileText size={11} /><span className="truncate max-w-[200px]">{att.name}</span><span className="text-white/35">{formatBytes(att.size)}</span></div>)}</div>}
                    {msg.role === 'assistant' && (
                      <div className="absolute top-1 left-full ml-1 hidden group-hover:flex items-center gap-0.5 bg-portal-surface border border-white/[0.07] rounded-lg px-1 py-0.5 shadow-lg z-10">
                        <button onClick={() => copyText(msg.text)} title="Copy" className="p-1 text-white/35 hover:text-white"><Copy size={12} /></button>
                        <button onClick={() => saveOutput(msg)} title="Save output" className="p-1 text-white/35 hover:text-brand-300"><Save size={12} /></button>
                        <button onClick={() => makeTaskBrief(msg.text)} title="Copy task brief" className="p-1 text-white/35 hover:text-yellow-300"><FilePlus size={12} /></button>
                        <button onClick={() => openInContentTool(msg.text)} title="Open in Content Tool" className="p-1 text-white/35 hover:text-amber-300"><Sparkles size={12} /></button>
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2 px-1"><span className="text-[10px] text-white/25">{new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>{msg.role === 'assistant' && routeBadge(msg.routedTo)}</div>
                </div>
                {msg.role === 'user' && <div className="flex-shrink-0 w-7 h-7 rounded-full bg-brand-500 flex items-center justify-center mt-0.5 text-white font-bold text-xs">{currentUser.name.charAt(0).toUpperCase()}</div>}
              </div>
            ))}

            {activeWorkspace.isThinking && (
              <div className="flex gap-2.5 justify-start">
                <div className="flex-shrink-0 w-7 h-7 rounded-full bg-brand-500 flex items-center justify-center"><Bot size={14} className="text-white" /></div>
                <div className="bg-brand-500/10 border border-brand-500/20 rounded-2xl rounded-tl-sm px-3.5 py-2.5">
                  <div className="flex items-center gap-2"><span className="flex items-center gap-1.5"><span className="w-2 h-2 bg-brand-400 rounded-full animate-bounce [animation-delay:-0.3s]" /><span className="w-2 h-2 bg-brand-400 rounded-full animate-bounce [animation-delay:-0.15s]" /><span className="w-2 h-2 bg-brand-400 rounded-full animate-bounce" /></span><span className="text-xs text-white/45">{activeWorkspace.status}</span></div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        </div>

        {showOutputPanel && (
          <aside className="hidden xl:flex w-80 flex-col border-l border-white/[0.07] bg-portal-surface/35 min-h-0">
            <div className="px-4 py-3 border-b border-white/[0.07]">
              <div className="flex items-center justify-between"><span className="text-sm font-semibold text-white">Saved outputs</span><span className="text-xs text-white/30">{allOutputs.length}</span></div>
              <p className="text-[11px] text-white/35 mt-1">Drafts, briefs and useful answers from this workspace.</p>
            </div>
            <div className="flex-1 overflow-y-auto p-3 space-y-3">
              {allOutputs.length === 0 && <div className="rounded-xl border border-dashed border-white/[0.08] p-4 text-xs text-white/35 text-center">Assistant replies are saved here automatically. Use Save output for anything important.</div>}
              {allOutputs.map(out => (
                <div key={out.id} className="rounded-xl border border-white/[0.07] bg-white/[0.035] p-3 space-y-2">
                  <div className="flex items-start justify-between gap-2"><h4 className="text-xs font-semibold text-white line-clamp-2">{out.title}</h4><span className="text-[9px] text-white/25 flex-shrink-0">{new Date(out.createdAt).toLocaleDateString()}</span></div>
                  <p className="text-[11px] text-white/45 line-clamp-5 whitespace-pre-wrap">{out.text}</p>
                  <div className="flex flex-wrap gap-1.5">
                    <button onClick={() => copyText(out.text)} className="px-2 py-1 rounded-lg bg-white/[0.05] hover:bg-white/[0.1] text-[10px] text-white/55 flex items-center gap-1"><Copy size={10} /> Copy</button>
                    <button onClick={() => makeTaskBrief(out.text)} className="px-2 py-1 rounded-lg bg-white/[0.05] hover:bg-white/[0.1] text-[10px] text-white/55 flex items-center gap-1"><FilePlus size={10} /> Task</button>
                    <button onClick={() => openInContentTool(out.text)} className="px-2 py-1 rounded-lg bg-white/[0.05] hover:bg-white/[0.1] text-[10px] text-white/55 flex items-center gap-1"><Sparkles size={10} /> Content</button>
                    <button onClick={() => sendOutputToGeneral(out.text)} className="px-2 py-1 rounded-lg bg-brand-500/15 hover:bg-brand-500/25 text-[10px] text-brand-300 flex items-center gap-1"><MessageSquare size={10} /> General</button>
                  </div>
                </div>
              ))}
            </div>
          </aside>
        )}
      </div>

      <div className="flex-shrink-0 px-4 py-3 border-t border-white/[0.07]">
        {staged.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-2 max-w-3xl mx-auto">
            {staged.map(att => <div key={att.id} className="group flex items-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.04] overflow-hidden pr-2">{att.kind === 'image' && att.dataUrl ? <img src={att.dataUrl} alt={att.name} className="w-12 h-12 object-cover flex-shrink-0" /> : <div className="w-10 h-10 flex items-center justify-center flex-shrink-0">{att.kind === 'image' ? <ImageIcon size={16} className="text-brand-300" /> : <FileText size={16} className="text-blue-300" />}</div>}<div className="flex flex-col py-1"><span className="text-xs text-white/80 font-medium max-w-[140px] truncate">{att.name}</span><span className="text-[10px] text-white/30">{formatBytes(att.size)}</span></div><button onClick={() => removeStaged(activeWorkspace.id, att.id)} className="text-white/25 hover:text-red-400 ml-1"><X size={12} /></button></div>)}
          </div>
        )}

        <div className="max-w-3xl mx-auto flex items-end gap-2">
          <div className="relative flex-shrink-0" ref={attachMenuRef}>
            <button onClick={() => setAttachMenuOpen(o => !o)} disabled={activeWorkspace.isThinking} title="Add files" className="w-9 h-9 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center transition-colors text-white/50 hover:text-white"><Plus size={16} /></button>
            {attachMenuOpen && (
              <div className="absolute bottom-full mb-2 left-0 w-60 bg-portal-surface border border-white/[0.1] rounded-xl shadow-xl shadow-black/50 overflow-hidden z-50">
                <div className="p-1.5 space-y-0.5">
                  <button onClick={() => { fileInputRef.current?.click(); setAttachMenuOpen(false); }} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-white/5 text-left"><Paperclip size={15} className="text-white/50" /><span><span className="block text-sm text-white font-medium">Add to message</span><span className="block text-[11px] text-white/35">Sent with this message only</span></span></button>
                  <button onClick={() => { contextFileInputRef.current?.click(); setAttachMenuOpen(false); }} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-white/5 text-left"><Database size={15} className="text-brand-400" /><span><span className="block text-sm text-white font-medium">Save to workspace</span><span className="block text-[11px] text-white/35">AI sees it in every message</span></span></button>
                  <div className="h-px bg-white/[0.06] mx-2" />
                  <div className="flex items-center gap-3 px-3 py-2"><ClipboardPaste size={13} className="text-white/25" /><p className="text-[11px] text-white/30">Or paste a screenshot with Ctrl+V</p></div>
                </div>
              </div>
            )}
          </div>
          <input ref={fileInputRef} type="file" multiple className="hidden" accept="image/*,.pdf,.doc,.docx,.txt,.md,.csv,.json,.html,.xls,.xlsx" onChange={e => { if (e.target.files) prepareFiles(e.target.files, 'stage', activeWorkspace.id); e.currentTarget.value = ''; }} />
          <input ref={contextFileInputRef} type="file" multiple className="hidden" accept="image/*,.pdf,.doc,.docx,.txt,.md,.csv,.json,.html,.xls,.xlsx" onChange={e => { if (e.target.files) prepareFiles(e.target.files, 'context', activeWorkspace.id); e.currentTarget.value = ''; }} />
          <div className="flex-1 relative">
            <textarea ref={inputRef} value={activeWorkspace.input} onChange={e => updateWorkspace(activeWorkspace.id, w => ({ ...w, input: e.target.value }))} onKeyDown={e => handleKeyDown(e, activeWorkspace.id)} onPaste={e => handlePaste(e, activeWorkspace.id)} placeholder={`Ask ${activeCfg.label} anything. ${activeWorkspace.pinnedClientName ? `Pinned to ${activeWorkspace.pinnedClientName}` : 'Pin a client for sharper context'}...`} rows={1} className="w-full bg-portal-surface border border-white/[0.08] rounded-xl px-4 py-3 text-sm text-white placeholder-white/30 outline-none focus:border-brand-500/50 resize-none overflow-hidden transition-colors" style={{ minHeight: '44px', maxHeight: '120px' }} onInput={e => { const el = e.currentTarget; el.style.height = 'auto'; el.style.height = Math.min(el.scrollHeight, 120) + 'px'; }} disabled={activeWorkspace.isThinking} />
          </div>
          <button onClick={() => sendMessage(activeWorkspace.id)} disabled={(!activeWorkspace.input.trim() && staged.length === 0) || activeWorkspace.isThinking} className="w-10 h-10 rounded-xl bg-brand-500 hover:bg-brand-600 disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center transition-colors flex-shrink-0">{activeWorkspace.isThinking ? <Loader2 size={16} className="animate-spin text-white" /> : <Send size={16} className="text-white" />}</button>
        </div>
        <p className="max-w-3xl mx-auto text-[10px] text-white/20 mt-1.5 pl-1">{activeWorkspace.messages.length} messages · {allOutputs.length} saved outputs{contextFiles.length > 0 && ` · ${contextFiles.length} context file${contextFiles.length > 1 ? 's' : ''}`} · session {currentUser.id.slice(0, 8)}-ws-{activeWorkspace.id}</p>
      </div>
    </div>
  );
};

export default EchoWorkspaces;
