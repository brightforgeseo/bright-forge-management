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
  { id: 'needs_content', label: 'Needs Content', color: 'bg-orange-500' },
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
      <div className="bg-zinc-900 rounded-2xl border border-zinc-800 w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="p-6 border-b border-zinc-800 flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <h2 className="text-xl font-bold text-white line-clamp-2">
              {task.task?.title || 'Task Details'}
            </h2>
            {task.client_name && (
              <p className="text-sm text-zinc-400 mt-1">{task.client_name}</p>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-2 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg transition-colors"
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
                <div className="absolute top-full left-0 mt-2 w-48 bg-zinc-800 border border-zinc-700 rounded-xl shadow-xl z-10 overflow-hidden">
                  {STATUS_OPTIONS.map((status) => (
                    <button
                      key={status.id}
                      onClick={() => handleStatusChange(status.id)}
                      className={`w-full px-4 py-3 text-left text-sm hover:bg-zinc-700 transition-colors flex items-center gap-3 ${
                        task.partner_status === status.id ? 'bg-zinc-700' : ''
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
              <div className="flex items-center gap-2 px-3 py-2 bg-zinc-800 rounded-lg text-sm text-zinc-300">
                <Calendar className="w-4 h-4 text-zinc-500" />
                <span>Due: {new Date(task.task.dueDate).toLocaleDateString()}</span>
              </div>
            )}

            {/* Priority */}
            {task.task?.priority && (
              <div className="flex items-center gap-2 px-3 py-2 bg-zinc-800 rounded-lg text-sm text-zinc-300">
                <Tag className="w-4 h-4 text-zinc-500" />
                <span>{task.task.priority}</span>
              </div>
            )}
          </div>

          {/* Notes from Team */}
          {task.visible_notes && (
            <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4">
              <h3 className="text-sm font-semibold text-amber-400 mb-2">Notes from Team</h3>
              <p className="text-sm text-zinc-300 whitespace-pre-wrap">{task.visible_notes}</p>
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
                  className="flex items-center gap-2 px-4 py-2 bg-amber-500/20 text-amber-400 rounded-lg hover:bg-amber-500/30 transition-colors text-sm font-medium"
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

          {/* Comments Section */}
          <div className="border-t border-zinc-800 pt-6">
            <div className="flex items-center gap-2 mb-4">
              <MessageCircle className="w-5 h-5 text-zinc-400" />
              <h3 className="font-semibold text-white">Comments</h3>
              <span className="text-xs text-zinc-500">
                ({task.task?.comments?.length || 0})
              </span>
            </div>

            {/* Comments List */}
            <div className="space-y-4 mb-4 max-h-64 overflow-y-auto">
              {task.task?.comments && task.task.comments.length > 0 ? (
                task.task.comments.map((comment) => (
                  <div key={comment.id} className="flex gap-3 p-3 bg-zinc-800/50 rounded-lg">
                    {comment.avatar ? (
                      <img
                        src={comment.avatar}
                        alt=""
                        className="w-8 h-8 rounded-full object-cover flex-shrink-0"
                      />
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-amber-400/20 flex items-center justify-center flex-shrink-0">
                        <span className="text-xs font-semibold text-amber-400">
                          {comment.author.charAt(0).toUpperCase()}
                        </span>
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm font-semibold text-white">{comment.author}</span>
                        <span className="text-xs text-zinc-500">
                          {new Date(comment.timestamp).toLocaleString('en-US', {
                            month: 'short',
                            day: 'numeric',
                            hour: 'numeric',
                            minute: '2-digit',
                          })}
                        </span>
                      </div>
                      <p className="text-sm text-zinc-300 whitespace-pre-wrap">{comment.text}</p>
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center py-8 text-zinc-500 text-sm">
                  No comments yet. Be the first to comment!
                </div>
              )}
            </div>

            {/* Add Comment Input */}
            <div className="flex gap-3">
              <div className="w-8 h-8 rounded-full bg-amber-400/20 flex items-center justify-center flex-shrink-0">
                <span className="text-xs font-semibold text-amber-400">
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
                  className="w-full px-4 py-3 bg-zinc-800 border border-zinc-700 rounded-xl text-white placeholder-zinc-500 focus:outline-none focus:border-amber-400 resize-none text-sm"
                />
                <button
                  onClick={handleAddComment}
                  disabled={!newComment.trim() || isSubmitting}
                  className="absolute right-2 bottom-2 p-2 bg-amber-400 text-zinc-900 rounded-lg hover:bg-amber-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
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
