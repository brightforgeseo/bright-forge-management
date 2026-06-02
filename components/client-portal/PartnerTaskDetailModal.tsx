import React, { useState } from 'react';
import {
  X,
  Clock,
  ExternalLink,
  MessageCircle,
  Send,
  Calendar,
  Tag,
  CheckCircle2,
  Paperclip,
  File as FileIcon,
  Image as ImageIcon,
} from 'lucide-react';
import { PartnerAccount, PartnerTask, PartnerTaskStatus } from '../../types-portal';
import { TaskComment, ToastType } from '../../types';
import { addCommentToTask, upsertPartnerTaskStatus } from '../../services/clientPortalService';

interface PartnerTaskDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  task: PartnerTask;
  partnerAccount: PartnerAccount;
  addToast: (type: ToastType, message: string) => void;
  onTaskUpdated: (updatedTask: PartnerTask) => void;
}

const STATUS_OPTIONS: { id: PartnerTaskStatus; label: string; color: string }[] = [
  { id: 'assigned', label: 'Assigned', color: 'bg-blue-500' },
  { id: 'in_progress', label: 'In Progress', color: 'bg-yellow-500' },
  { id: 'needs_content', label: 'Needs Content', color: 'bg-portal-accent' },
  { id: 'send_email', label: 'Send Email', color: 'bg-purple-500' },
  { id: 'completed', label: 'Completed', color: 'bg-green-500' },
];

const PartnerTaskDetailModal: React.FC<PartnerTaskDetailModalProps> = ({
  isOpen,
  onClose,
  task,
  partnerAccount,
  addToast,
  onTaskUpdated,
}) => {
  const [newComment, setNewComment] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showStatusDropdown, setShowStatusDropdown] = useState(false);

  if (!isOpen) return null;

  const handleAddComment = async () => {
    if (!newComment.trim()) return;

    setIsSubmitting(true);

    const comment: TaskComment = {
      id: `comment-${Date.now()}`,
      author: partnerAccount.full_name,
      authorId: partnerAccount.id,
      text: newComment.trim(),
      timestamp: new Date().toISOString(),
      avatar: partnerAccount.avatar_url,
    };

    const success = await addCommentToTask(
      task.client_board_id,
      task.group_id,
      task.task_id,
      comment
    );

    if (success) {
      // Update local task state with new comment
      const updatedComments = [...(task.task?.comments || []), comment];
      const updatedTask = {
        ...task,
        task: task.task ? { ...task.task, comments: updatedComments } : undefined,
      };
      onTaskUpdated(updatedTask);
      setNewComment('');
      addToast('success', 'Comment added');
    } else {
      addToast('error', 'Failed to add comment');
    }

    setIsSubmitting(false);
  };

  const handleStatusChange = async (newStatus: PartnerTaskStatus) => {
    setShowStatusDropdown(false);

    if (newStatus === task.partner_status) return;

    const { success } = await upsertPartnerTaskStatus(
      partnerAccount.id,
      task.client_board_id,
      task.task_id,
      task.group_id,
      newStatus
    );

    if (success) {
      const updatedTask = { ...task, partner_status: newStatus };
      onTaskUpdated(updatedTask);
      addToast('success', `Status updated to ${STATUS_OPTIONS.find(s => s.id === newStatus)?.label}`);
    } else {
      addToast('error', 'Failed to update status');
    }
  };

  const currentStatus = STATUS_OPTIONS.find(s => s.id === task.partner_status) || STATUS_OPTIONS[0];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="bg-portal-surface rounded-2xl border border-white/[0.07] w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="p-6 border-b border-white/[0.07] flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <h2 className="text-xl font-bold text-white line-clamp-2">
              {task.task?.title || 'Task Details'}
            </h2>
            {task.client_name && (
              <p className="text-sm text-portal-soft mt-1">{task.client_name}</p>
            )}
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
          {/* Status and Info Row */}
          <div className="flex flex-wrap gap-4">
            {/* Status Dropdown */}
            <div className="relative">
              <button
                onClick={() => setShowStatusDropdown(!showStatusDropdown)}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-white ${currentStatus.color} hover:opacity-90 transition-opacity`}
              >
                <CheckCircle2 className="w-4 h-4" />
                {currentStatus.label}
              </button>

              {showStatusDropdown && (
                <div className="absolute top-full left-0 mt-2 w-48 bg-portal-surface2 border border-white/[0.07] rounded-xl shadow-xl z-10 overflow-hidden">
                  {STATUS_OPTIONS.map((status) => (
                    <button
                      key={status.id}
                      onClick={() => handleStatusChange(status.id)}
                      className={`w-full px-4 py-3 text-left text-sm hover:bg-portal-surface2 transition-colors flex items-center gap-3 ${
                        task.partner_status === status.id ? 'bg-portal-surface2' : ''
                      }`}
                    >
                      <div className={`w-3 h-3 rounded-full ${status.color}`} />
                      <span className="text-white">{status.label}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Due Date */}
            {task.task?.dueDate && (
              <div className="flex items-center gap-2 px-3 py-2 bg-portal-surface2 rounded-lg text-sm text-portal-text">
                <Calendar className="w-4 h-4 text-portal-soft" />
                <span>Due: {new Date(task.task.dueDate).toLocaleDateString()}</span>
              </div>
            )}

            {/* Priority */}
            {task.task?.priority && (
              <div className="flex items-center gap-2 px-3 py-2 bg-portal-surface2 rounded-lg text-sm text-portal-text">
                <Tag className="w-4 h-4 text-portal-soft" />
                <span>{task.task.priority}</span>
              </div>
            )}
          </div>

          {/* Notes from Team */}
          {task.visible_notes && (
            <div className="bg-portal-accent/10 border border-portal-accent/20 rounded-xl p-4">
              <h3 className="text-sm font-semibold text-portal-accent mb-2">Notes from Team</h3>
              <p className="text-sm text-portal-text whitespace-pre-wrap">{task.visible_notes}</p>
            </div>
          )}

          {/* Links */}
          {(task.task?.worksheet || task.task?.clientSheet) && (
            <div className="flex flex-wrap gap-3">
              {task.task.worksheet && (
                <a
                  href={task.task.worksheet}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 px-4 py-2 bg-portal-accent/20 text-portal-accent rounded-lg hover:bg-portal-accent/30 transition-colors text-sm font-medium"
                >
                  <ExternalLink className="w-4 h-4" />
                  Open Worksheet
                </a>
              )}
              {task.task.clientSheet && (
                <a
                  href={task.task.clientSheet}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 px-4 py-2 bg-blue-500/20 text-blue-400 rounded-lg hover:bg-blue-500/30 transition-colors text-sm font-medium"
                >
                  <ExternalLink className="w-4 h-4" />
                  Open Client Sheet
                </a>
              )}
            </div>
          )}

          {/* Task Attachments */}
          {task.task?.attachments && task.task.attachments.length > 0 && (
            <div className="bg-portal-surface2/50 border border-white/[0.07] rounded-xl p-4">
              <div className="flex items-center gap-2 mb-3">
                <Paperclip className="w-4 h-4 text-portal-soft" />
                <h3 className="text-sm font-semibold text-white">Attachments</h3>
                <span className="text-xs text-portal-soft">({task.task.attachments.length})</span>
              </div>
              <div className="space-y-2">
                {task.task.attachments.map(att => (
                  <a
                    key={att.id}
                    href={att.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 p-3 bg-portal-surface rounded-lg border border-white/[0.07] hover:border-portal-accent/50 transition-colors text-sm text-portal-text"
                  >
                    {att.type === 'image' ? <ImageIcon className="w-4 h-4 text-portal-accent" /> : <FileIcon className="w-4 h-4 text-portal-accent" />}
                    <span className="flex-1 truncate">{att.name}</span>
                    <ExternalLink className="w-3 h-3 text-portal-soft" />
                  </a>
                ))}
              </div>
            </div>
          )}

          {/* Comments Section */}
          <div className="border-t border-white/[0.07] pt-6">
            <div className="flex items-center gap-2 mb-4">
              <MessageCircle className="w-5 h-5 text-portal-soft" />
              <h3 className="font-semibold text-white">Comments</h3>
              <span className="text-xs text-portal-soft">
                ({task.task?.comments?.length || 0})
              </span>
            </div>

            {/* Comments List */}
            <div className="space-y-4 mb-4 max-h-64 overflow-y-auto">
              {task.task?.comments && task.task.comments.length > 0 ? (
                task.task.comments.map((comment) => (
                  <div key={comment.id} className="flex gap-3 p-3 bg-portal-surface2/50 rounded-lg">
                    {comment.avatar ? (
                      <img
                        src={comment.avatar}
                        alt=""
                        className="w-8 h-8 rounded-full object-cover flex-shrink-0"
                      />
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-portal-accent/20 flex items-center justify-center flex-shrink-0">
                        <span className="text-xs font-semibold text-portal-accent">
                          {comment.author.charAt(0).toUpperCase()}
                        </span>
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm font-semibold text-white">{comment.author}</span>
                        <span className="text-xs text-portal-soft">
                          {new Date(comment.timestamp).toLocaleString('en-US', {
                            month: 'short',
                            day: 'numeric',
                            hour: 'numeric',
                            minute: '2-digit',
                          })}
                        </span>
                      </div>
                      <p className="text-sm text-portal-text whitespace-pre-wrap">{comment.text}</p>
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center py-8 text-portal-soft text-sm">
                  No comments yet. Be the first to comment!
                </div>
              )}
            </div>

            {/* Add Comment Input */}
            <div className="flex gap-3">
              <div className="w-8 h-8 rounded-full bg-portal-accent/20 flex items-center justify-center flex-shrink-0">
                <span className="text-xs font-semibold text-portal-accent">
                  {partnerAccount.full_name.charAt(0).toUpperCase()}
                </span>
              </div>
              <div className="flex-1 relative">
                <textarea
                  value={newComment}
                  onChange={(e) => setNewComment(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey && newComment.trim()) {
                      e.preventDefault();
                      handleAddComment();
                    }
                  }}
                  placeholder="Add a comment..."
                  rows={2}
                  className="w-full px-4 py-3 bg-portal-surface2 border border-white/[0.07] rounded-xl text-white placeholder-portal-soft focus:outline-none focus:border-portal-accent resize-none text-sm"
                />
                <button
                  onClick={handleAddComment}
                  disabled={!newComment.trim() || isSubmitting}
                  className="absolute right-2 bottom-2 p-2 bg-portal-accent text-white rounded-lg hover:bg-portal-accent transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Send className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PartnerTaskDetailModal;
