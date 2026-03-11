import React, { useState, useEffect } from 'react';
import {
  X,
  Sparkles,
  Send,
  RefreshCw,
  Edit3,
  Mail,
  AlertCircle,
  Loader2,
  Check,
  Settings,
} from 'lucide-react';
import { PartnerAccount, PartnerTask, EmailGenerationContext, GeneratedEmail } from '../../types-portal';
import { ToastType } from '../../types';
import {
  generateEmailWithAI,
  createEmailDraft,
  sendEmailViaProvider,
  markEmailSent,
  markEmailFailed,
} from '../../services/clientPortalService';

interface EmailGeneratorModalProps {
  isOpen: boolean;
  onClose: () => void;
  task: PartnerTask;
  partnerAccount: PartnerAccount;
  clientName: string;
  onEmailSent: () => void;
  addToast: (type: ToastType, message: string) => void;
}

const EmailGeneratorModal: React.FC<EmailGeneratorModalProps> = ({
  isOpen,
  onClose,
  task,
  partnerAccount,
  clientName,
  onEmailSent,
  addToast,
}) => {
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [recipientEmail, setRecipientEmail] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [error, setError] = useState('');

  const hasEmailConnected = !!partnerAccount.email_provider && !!partnerAccount.email_address;

  useEffect(() => {
    if (isOpen) {
      generateEmail();
    }
  }, [isOpen]);

  const generateEmail = async () => {
    setIsGenerating(true);
    setError('');

    try {
      // Build rich context for AI email generation
      const context: EmailGenerationContext = {
        // Current task info
        taskTitle: task.task?.title || 'Task Update',
        taskDescription: task.task?.description || '',
        taskStatus: task.partner_status || task.task?.status || 'In Progress',
        taskDueDate: task.task?.dueDate,

        // Client info
        clientName: clientName,

        // Notes visible to partner
        notes: task.visible_notes || '',

        // Partner info
        partnerName: partnerAccount.company_name,
        partnerCompany: partnerAccount.company_name,
        partnerFullName: partnerAccount.full_name,
      };

      // Pass the full task object (with comments) and client board ID for rich context
      const result = await generateEmailWithAI(
        context,
        task.task, // Full task object with comments
        task.client_board_id // Client board ID for fetching previous tasks
      );

      if (result) {
        setSubject(result.subject);
        setBody(result.body);
      } else {
        // Fallback if AI fails
        setSubject(`Update: ${task.task?.title || 'Task'}`);
        setBody(`Hi,\n\nI wanted to provide you with an update on your SEO project.\n\n${task.visible_notes || 'We have been working on your project and wanted to share some updates.'}\n\nPlease let me know if you have any questions.\n\nBest regards,\n${partnerAccount.full_name}\n${partnerAccount.company_name}`);
      }
    } catch (err) {
      console.error('Error generating email:', err);
      // Use fallback
      setSubject(`Update: ${task.task?.title || 'Task'}`);
      setBody(`Hi,\n\nI wanted to provide you with an update on your SEO project.\n\n${task.visible_notes || 'We have been working on your project and wanted to share some updates.'}\n\nPlease let me know if you have any questions.\n\nBest regards,\n${partnerAccount.full_name}\n${partnerAccount.company_name}`);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSend = async () => {
    if (!recipientEmail.trim()) {
      setError('Please enter a recipient email address');
      return;
    }

    if (!subject.trim() || !body.trim()) {
      setError('Please fill in the subject and body');
      return;
    }

    setIsSending(true);
    setError('');

    try {
      // Create email draft
      const draft = await createEmailDraft(
        partnerAccount.id,
        task.id,
        recipientEmail,
        clientName,
        subject,
        body,
        true
      );

      if (!draft) {
        throw new Error('Failed to save email draft');
      }

      // Send email via provider
      const result = await sendEmailViaProvider(
        partnerAccount.id,
        recipientEmail,
        subject,
        body,
        task.task_id,
        task.client_board_id
      );

      if (result.success) {
        await markEmailSent(draft.id);
        addToast('success', 'Email sent successfully!');
        onEmailSent();
      } else {
        await markEmailFailed(draft.id, result.error || 'Unknown error');
        throw new Error(result.error || 'Failed to send email');
      }
    } catch (err: any) {
      console.error('Error sending email:', err);
      setError(err.message || 'Failed to send email');
      addToast('error', 'Failed to send email');
    } finally {
      setIsSending(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />

      {/* Modal */}
      <div className="relative w-full max-w-2xl bg-portal-surface rounded-2xl border border-white/[0.07] shadow-2xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="p-6 border-b border-white/[0.07] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-purple-500/20 flex items-center justify-center">
              <Mail className="w-5 h-5 text-purple-400" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white">Generate Client Email</h2>
              <p className="text-sm text-portal-soft">{task.task?.title || 'Task Update'}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-portal-soft hover:text-white hover:bg-portal-surface2 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {isGenerating ? (
            <div className="py-12 text-center">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-purple-500 to-portal-accent-light flex items-center justify-center mx-auto mb-4 animate-pulse">
                <Sparkles className="w-8 h-8 text-white" />
              </div>
              <p className="text-white font-medium">AI is crafting your email...</p>
              <p className="text-sm text-portal-soft mt-1">This may take a few seconds</p>
            </div>
          ) : (
            <>
              {error && (
                <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
                  <p className="text-red-400 text-sm">{error}</p>
                </div>
              )}

              {!hasEmailConnected && (
                <div className="p-4 bg-portal-accent/10 border border-portal-accent/20 rounded-xl flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-portal-accent flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="text-portal-accent text-sm font-medium">No email connected</p>
                    <p className="text-portal-accent/70 text-sm mt-1">
                      Connect your Gmail or Outlook account in Settings to send emails.
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      onClose();
                      // Navigate to settings - this would need to be passed through props
                    }}
                    className="px-3 py-1.5 bg-portal-accent/20 text-portal-accent text-sm font-medium rounded-lg hover:bg-portal-accent/30 transition-colors flex items-center gap-1"
                  >
                    <Settings className="w-4 h-4" />
                    Settings
                  </button>
                </div>
              )}

              {/* From */}
              <div>
                <label className="block text-sm font-medium text-portal-text mb-2">From</label>
                <div className="px-4 py-3 bg-portal-surface2/50 border border-white/[0.07] rounded-xl text-portal-soft">
                  {partnerAccount.email_address || partnerAccount.email}
                </div>
              </div>

              {/* To */}
              <div>
                <label className="block text-sm font-medium text-portal-text mb-2">To</label>
                <input
                  type="email"
                  value={recipientEmail}
                  onChange={(e) => setRecipientEmail(e.target.value)}
                  placeholder="client@example.com"
                  className="w-full px-4 py-3 bg-portal-surface2 border border-white/[0.07] rounded-xl text-white placeholder-portal-soft focus:outline-none focus:border-portal-accent transition-colors"
                />
              </div>

              {/* Subject */}
              <div>
                <label className="block text-sm font-medium text-portal-text mb-2">Subject</label>
                <input
                  type="text"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  disabled={!isEditing}
                  className={`w-full px-4 py-3 border border-white/[0.07] rounded-xl text-white focus:outline-none focus:border-portal-accent transition-colors ${
                    isEditing ? 'bg-portal-surface2' : 'bg-portal-surface2/50'
                  }`}
                />
              </div>

              {/* Body */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-medium text-portal-text">Email Body</label>
                  <button
                    onClick={() => setIsEditing(!isEditing)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg transition-colors ${
                      isEditing
                        ? 'bg-portal-accent/20 text-portal-accent'
                        : 'bg-portal-surface2 text-portal-soft hover:text-white'
                    }`}
                  >
                    <Edit3 className="w-4 h-4" />
                    {isEditing ? 'Editing' : 'Edit Draft'}
                  </button>
                </div>
                <textarea
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  disabled={!isEditing}
                  rows={10}
                  className={`w-full px-4 py-3 border border-white/[0.07] rounded-xl text-white focus:outline-none focus:border-portal-accent transition-colors resize-none ${
                    isEditing ? 'bg-portal-surface2' : 'bg-portal-surface2/50'
                  }`}
                />
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        {!isGenerating && (
          <div className="p-6 border-t border-white/[0.07] flex items-center justify-between">
            <button
              onClick={generateEmail}
              disabled={isGenerating}
              className="flex items-center gap-2 px-4 py-2 text-portal-soft hover:text-white transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
              Regenerate
            </button>

            <div className="flex items-center gap-3">
              <button
                onClick={onClose}
                className="px-4 py-2 text-portal-soft hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSend}
                disabled={isSending || !hasEmailConnected}
                className="flex items-center gap-2 px-6 py-2 bg-gradient-to-r from-portal-accent to-portal-accent-light hover:from-portal-accent hover:to-portal-accent text-white font-semibold rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-portal-accent/20"
              >
                {isSending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Send className="w-4 h-4" />
                )}
                {isSending ? 'Sending...' : 'Send Email'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default EmailGeneratorModal;
