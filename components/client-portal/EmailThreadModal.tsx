import React, { useState, useEffect } from 'react';
import {
  X,
  Mail,
  Send,
  Sparkles,
  Loader2,
  RefreshCw,
  User,
  ArrowRight,
} from 'lucide-react';
import { PartnerAccount, PartnerTask } from '../../types-portal';
import { ToastType } from '../../types';
import {
  fetchEmailThread,
  sendEmailViaProvider,
  generateEmailWithAI,
  EmailMessage,
} from '../../services/clientPortalService';

interface EmailThreadModalProps {
  isOpen: boolean;
  onClose: () => void;
  task: PartnerTask;
  partnerAccount: PartnerAccount;
  addToast: (type: ToastType, message: string) => void;
}

const EmailThreadModal: React.FC<EmailThreadModalProps> = ({
  isOpen,
  onClose,
  task,
  partnerAccount,
  addToast,
}) => {
  const [messages, setMessages] = useState<EmailMessage[]>([]);
  const [hasThread, setHasThread] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [replyBody, setReplyBody] = useState('');
  const [showReplyForm, setShowReplyForm] = useState(false);

  useEffect(() => {
    if (isOpen) {
      loadThread();
    }
  }, [isOpen, task.task_id]);

  const loadThread = async () => {
    setIsLoading(true);
    try {
      const result = await fetchEmailThread(partnerAccount.id, task.task_id);
      if (result.success) {
        setMessages(result.messages);
        setHasThread(result.hasThread);
      } else {
        addToast('error', result.error || 'Failed to load email thread');
      }
    } catch (err) {
      console.error('Error loading thread:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const generateAIResponse = async () => {
    if (messages.length === 0) return;

    setIsGenerating(true);
    try {
      // Get the last message from client (not from partner)
      const clientMessages = messages.filter(m => !m.isFromPartner);
      const lastClientMessage = clientMessages[clientMessages.length - 1];

      if (!lastClientMessage) {
        addToast('error', 'No client message to respond to');
        return;
      }

      // Build context from conversation
      const conversationContext = messages
        .map(m => `${m.isFromPartner ? 'You' : 'Client'}: ${m.body}`)
        .join('\n\n---\n\n');

      // Generate reply using AI
      const result = await generateEmailWithAI({
        taskTitle: task.task?.title || 'Task',
        clientName: task.client_name || 'Client',
        notes: task.visible_notes || '',
        partnerName: partnerAccount.contact_name || 'Partner',
        partnerFullName: partnerAccount.contact_name || 'Partner',
        partnerCompany: partnerAccount.company_name || 'Company',
        isReply: true,
        previousConversation: conversationContext,
        lastClientMessage: lastClientMessage.body,
      });

      if (result) {
        setReplyBody(result.body);
        setShowReplyForm(true);
      } else {
        addToast('error', 'Failed to generate response');
      }
    } catch (err: any) {
      console.error('Error generating response:', err);
      addToast('error', 'Failed to generate AI response');
    } finally {
      setIsGenerating(false);
    }
  };

  const sendReply = async () => {
    if (!replyBody.trim()) return;

    const lastMessage = messages[messages.length - 1];
    const subject = lastMessage?.subject?.startsWith('Re:')
      ? lastMessage.subject
      : `Re: ${lastMessage?.subject || 'Your inquiry'}`;

    // Get recipient - the client's email
    const clientMessage = messages.find(m => !m.isFromPartner);
    const recipientEmail = clientMessage?.from?.match(/<(.+)>/)?.[1] || clientMessage?.from || '';

    if (!recipientEmail) {
      addToast('error', 'Could not determine recipient email');
      return;
    }

    setIsSending(true);
    try {
      const result = await sendEmailViaProvider(
        partnerAccount.id,
        recipientEmail,
        subject,
        replyBody,
        task.task_id,
        task.client_board_id
      );

      if (result.success) {
        addToast('success', 'Reply sent successfully!');
        setReplyBody('');
        setShowReplyForm(false);
        // Reload thread to show new message
        await loadThread();
      } else {
        addToast('error', result.error || 'Failed to send reply');
      }
    } catch (err: any) {
      console.error('Error sending reply:', err);
      addToast('error', 'Failed to send reply');
    } finally {
      setIsSending(false);
    }
  };

  const formatDate = (dateStr: string) => {
    try {
      const date = new Date(dateStr);
      return date.toLocaleString();
    } catch {
      return dateStr;
    }
  };

  const extractName = (from: string) => {
    const match = from.match(/^([^<]+)/);
    return match ? match[1].trim() : from;
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />

      <div className="relative w-full max-w-2xl max-h-[90vh] bg-zinc-900 rounded-2xl border border-zinc-800 shadow-2xl flex flex-col">
        {/* Header */}
        <div className="p-4 border-b border-zinc-800 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-purple-500/20 flex items-center justify-center">
              <Mail className="w-5 h-5 text-purple-400" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white">Email Thread</h2>
              <p className="text-sm text-zinc-400">{task.task?.title || 'Task'}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={loadThread}
              disabled={isLoading}
              className="p-2 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg transition-colors"
            >
              <RefreshCw className={`w-5 h-5 ${isLoading ? 'animate-spin' : ''}`} />
            </button>
            <button
              onClick={onClose}
              className="p-2 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 text-amber-400 animate-spin" />
            </div>
          ) : !hasThread ? (
            <div className="text-center py-12">
              <Mail className="w-12 h-12 text-zinc-600 mx-auto mb-4" />
              <p className="text-zinc-400">No emails sent for this task yet</p>
            </div>
          ) : (
            <div className="space-y-4">
              {messages.map((msg, idx) => (
                <div
                  key={msg.id}
                  className={`p-4 rounded-xl ${
                    msg.isFromPartner
                      ? 'bg-amber-500/10 border border-amber-500/20 ml-8'
                      : 'bg-zinc-800 border border-zinc-700 mr-8'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <div
                      className={`w-8 h-8 rounded-full flex items-center justify-center ${
                        msg.isFromPartner ? 'bg-amber-500/20' : 'bg-blue-500/20'
                      }`}
                    >
                      {msg.isFromPartner ? (
                        <Send className="w-4 h-4 text-amber-400" />
                      ) : (
                        <User className="w-4 h-4 text-blue-400" />
                      )}
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-medium text-white">
                        {msg.isFromPartner ? 'You' : extractName(msg.from)}
                      </p>
                      <p className="text-xs text-zinc-500">{formatDate(msg.date)}</p>
                    </div>
                  </div>
                  {idx === 0 && (
                    <p className="text-sm text-zinc-400 mb-2 font-medium">
                      Subject: {msg.subject}
                    </p>
                  )}
                  <p className="text-sm text-zinc-300 whitespace-pre-wrap">{msg.body}</p>
                </div>
              ))}

              {/* Reply indicator if last message is from client */}
              {messages.length > 0 && !messages[messages.length - 1].isFromPartner && (
                <div className="flex items-center justify-center gap-2 py-4">
                  <ArrowRight className="w-4 h-4 text-amber-400" />
                  <span className="text-sm text-amber-400">Client replied - generate a response below</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Reply Form */}
        {hasThread && (
          <div className="p-4 border-t border-zinc-800 flex-shrink-0">
            {showReplyForm ? (
              <div className="space-y-3">
                <textarea
                  value={replyBody}
                  onChange={(e) => setReplyBody(e.target.value)}
                  placeholder="Write your reply..."
                  className="w-full h-32 px-4 py-3 bg-zinc-800 border border-zinc-700 rounded-xl text-white placeholder-zinc-500 focus:outline-none focus:border-amber-400 resize-none"
                />
                <div className="flex items-center justify-between">
                  <button
                    onClick={() => setShowReplyForm(false)}
                    className="px-4 py-2 text-zinc-400 hover:text-white transition-colors"
                  >
                    Cancel
                  </button>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={generateAIResponse}
                      disabled={isGenerating}
                      className="flex items-center gap-2 px-4 py-2 bg-zinc-800 text-amber-400 border border-amber-400/30 rounded-lg hover:bg-amber-400/10 transition-colors disabled:opacity-50"
                    >
                      {isGenerating ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Sparkles className="w-4 h-4" />
                      )}
                      Regenerate
                    </button>
                    <button
                      onClick={sendReply}
                      disabled={isSending || !replyBody.trim()}
                      className="flex items-center gap-2 px-4 py-2 bg-amber-400 text-black font-medium rounded-lg hover:bg-amber-300 transition-colors disabled:opacity-50"
                    >
                      {isSending ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Send className="w-4 h-4" />
                      )}
                      Send Reply
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <button
                  onClick={generateAIResponse}
                  disabled={isGenerating || messages.length === 0}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-amber-400 text-black font-medium rounded-xl hover:bg-amber-300 transition-colors disabled:opacity-50"
                >
                  {isGenerating ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <Sparkles className="w-5 h-5" />
                  )}
                  Generate AI Response
                </button>
                <button
                  onClick={() => setShowReplyForm(true)}
                  className="px-4 py-3 bg-zinc-800 text-white rounded-xl hover:bg-zinc-700 transition-colors"
                >
                  Write Manually
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default EmailThreadModal;
