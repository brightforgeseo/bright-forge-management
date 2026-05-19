import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Inbox, Mail, Paperclip, RefreshCw, Search, ShieldCheck } from 'lucide-react';
import { User } from '../types';
import { BusinessInboxMessage, fetchBusinessInbox } from '../services/businessInboxService';

const BEN_USER_ID = 'f9f11222-d2a9-4ae8-a327-8c4621d90b7c';

interface Props {
  currentUser: User;
  addToast?: (type: 'success' | 'error' | 'info', message: string) => void;
}

const formatDate = (value: string) => {
  if (!value) return 'Unknown date';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
};

const cleanSender = (value: string) => value.replace(/<[^>]+>/g, '').replace(/"/g, '').trim() || value;

const BusinessInbox: React.FC<Props> = ({ currentUser, addToast }) => {
  const isAllowed = currentUser.id === BEN_USER_ID;
  const [messages, setMessages] = useState<BusinessInboxMessage[]>([]);
  const [selectedId, setSelectedId] = useState<string>('');
  const [account, setAccount] = useState('seo@brightforgeseo.com');
  const [syncedAt, setSyncedAt] = useState('');
  const [query, setQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const loadInbox = async () => {
    if (!isAllowed) return;
    setIsLoading(true);
    setError('');
    try {
      const data = await fetchBusinessInbox(currentUser.id, 30);
      setMessages(data.messages || []);
      setAccount(data.account || 'seo@brightforgeseo.com');
      setSyncedAt(data.syncedAt || '');
      setSelectedId(prev => prev && data.messages?.some(m => m.id === prev) ? prev : data.messages?.[0]?.id || '');
    } catch (e: any) {
      const msg = e?.message || 'Could not load the business inbox.';
      setError(msg);
      addToast?.('error', msg);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { loadInbox(); }, [isAllowed, currentUser.id]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return messages;
    return messages.filter(m => [m.subject, m.from, m.to, m.snippet, m.body].some(v => (v || '').toLowerCase().includes(q)));
  }, [messages, query]);

  const selected = filtered.find(m => m.id === selectedId) || filtered[0];

  if (!isAllowed) {
    return (
      <div className="p-6 max-w-3xl mx-auto">
        <div className="rounded-2xl border border-red-500/20 bg-red-500/10 p-6 flex gap-4">
          <ShieldCheck className="w-6 h-6 text-red-300 flex-shrink-0" />
          <div>
            <h1 className="text-xl font-bold text-white">Private inbox</h1>
            <p className="text-sm text-white/60 mt-1">This business email command centre is owner-only.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full p-4 lg:p-6 text-white">
      <div className="mb-4 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-white/50 text-xs uppercase tracking-widest font-semibold">
            <Inbox className="w-4 h-4" /> Private command centre
          </div>
          <h1 className="text-2xl lg:text-3xl font-bold mt-1">Business Inbox</h1>
          <p className="text-sm text-white/55 mt-1">{account} · read-only · no send button, because we are not lunatics.</p>
        </div>
        <button
          onClick={loadInbox}
          disabled={isLoading}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-brand-500/20 hover:bg-brand-600 disabled:opacity-60"
        >
          <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </div>

      {error && (
        <div className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 p-3 flex items-center gap-2 text-sm text-red-100">
          <AlertTriangle className="w-4 h-4" /> {error}
        </div>
      )}

      <div className="grid h-[calc(100vh-190px)] min-h-[620px] grid-cols-1 lg:grid-cols-[390px_1fr] gap-4">
        <section className="rounded-2xl border border-white/10 bg-portal-surface overflow-hidden flex flex-col">
          <div className="p-3 border-b border-white/10">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/35" />
              <input
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Search inbox"
                className="w-full rounded-xl border border-white/10 bg-white/5 py-2.5 pl-9 pr-3 text-sm text-white placeholder-white/30 outline-none focus:border-brand-400/60"
              />
            </div>
            <div className="mt-2 text-xs text-white/40">
              {filtered.length} messages{syncedAt ? ` · synced ${formatDate(syncedAt)}` : ''}
            </div>
          </div>

          <div className="overflow-y-auto flex-1">
            {isLoading && messages.length === 0 ? (
              <div className="p-8 text-center text-white/45 text-sm">Loading inbox…</div>
            ) : filtered.length === 0 ? (
              <div className="p-8 text-center text-white/45 text-sm">No matching messages.</div>
            ) : filtered.map(message => {
              const active = selected?.id === message.id;
              return (
                <button
                  key={message.id}
                  onClick={() => setSelectedId(message.id)}
                  className={`w-full text-left p-3 border-b border-white/[0.06] transition-colors ${active ? 'bg-brand-500/15' : 'hover:bg-white/[0.04]'}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-white truncate">{cleanSender(message.from)}</p>
                      <p className="text-sm text-white/75 truncate mt-0.5">{message.subject}</p>
                    </div>
                    <span className="text-[11px] text-white/35 whitespace-nowrap">{formatDate(message.date)}</span>
                  </div>
                  <p className="text-xs text-white/45 line-clamp-2 mt-1.5">{message.snippet || message.body || 'No preview available'}</p>
                  {message.hasAttachments && (
                    <div className="mt-2 inline-flex items-center gap-1 rounded-full bg-white/7 px-2 py-0.5 text-[11px] text-white/50">
                      <Paperclip className="w-3 h-3" /> {message.attachments.length} attachment{message.attachments.length === 1 ? '' : 's'}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </section>

        <section className="rounded-2xl border border-white/10 bg-portal-surface overflow-hidden flex flex-col">
          {selected ? (
            <>
              <div className="p-5 border-b border-white/10 bg-white/[0.02]">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <h2 className="text-xl font-bold text-white break-words">{selected.subject}</h2>
                    <p className="text-sm text-white/55 mt-2">From: {selected.from}</p>
                    <p className="text-sm text-white/40 mt-1">To: {selected.to || account}</p>
                    {selected.cc && <p className="text-sm text-white/40 mt-1">Cc: {selected.cc}</p>}
                  </div>
                  <div className="text-right text-xs text-white/40 whitespace-nowrap">{formatDate(selected.date)}</div>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto p-5">
                <div className="prose prose-invert max-w-none whitespace-pre-wrap text-sm leading-7 text-white/78">
                  {selected.body || selected.snippet || 'No readable body found for this message.'}
                </div>
                {selected.attachments.length > 0 && (
                  <div className="mt-6 border-t border-white/10 pt-4">
                    <h3 className="text-sm font-semibold text-white/70 mb-2">Attachments</h3>
                    <div className="space-y-2">
                      {selected.attachments.map((att, idx) => (
                        <div key={`${att.filename}-${idx}`} className="flex items-center gap-2 rounded-xl bg-white/[0.04] border border-white/10 px-3 py-2 text-sm text-white/65">
                          <Paperclip className="w-4 h-4" />
                          <span className="flex-1 truncate">{att.filename}</span>
                          <span className="text-xs text-white/35">{Math.round(att.size / 1024)} KB</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-white/40">
              <Mail className="w-10 h-10 mb-3" />
              <p>Select an email.</p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
};

export default BusinessInbox;
