import React, { useState, useEffect } from 'react';
import { X, Users, Loader2, Search, Check, AlertCircle } from 'lucide-react';
import { Task } from '../../types';
import { ToastType } from '../../types';
import { PartnerAccount } from '../../types-portal';
import { fetchAllPartners, assignTaskToPartner } from '../../services/clientPortalService';

interface AssignToPartnerModalProps {
  isOpen: boolean;
  onClose: () => void;
  task: Task;
  groupId: string;
  boardId: string;
  boardName: string;
  onAssigned: () => void;
  addToast: (type: ToastType, message: string) => void;
}

const AssignToPartnerModal: React.FC<AssignToPartnerModalProps> = ({
  isOpen,
  onClose,
  task,
  groupId,
  boardId,
  boardName,
  onAssigned,
  addToast,
}) => {
  const [partners, setPartners] = useState<PartnerAccount[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isAssigning, setIsAssigning] = useState(false);
  const [selectedPartnerId, setSelectedPartnerId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [visibleNotes, setVisibleNotes] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (isOpen) {
      loadPartners();
    }
  }, [isOpen]);

  const loadPartners = async () => {
    setIsLoading(true);
    setError('');
    try {
      const data = await fetchAllPartners();
      setPartners(data.filter(p => p.is_active));
    } catch (err) {
      console.error('Error loading partners:', err);
      setError('Failed to load partners');
    } finally {
      setIsLoading(false);
    }
  };

  const handleAssign = async () => {
    if (!selectedPartnerId) {
      setError('Please select a partner');
      return;
    }

    setIsAssigning(true);
    setError('');

    try {
      await assignTaskToPartner(
        selectedPartnerId,
        boardId,
        task.id,
        groupId,
        visibleNotes || undefined
      );

      addToast('success', 'Task assigned to partner');
      onAssigned();
      onClose();
    } catch (err: any) {
      console.error('Error assigning task:', err);
      setError(err.message || 'Failed to assign task');
      addToast('error', 'Failed to assign task to partner');
    } finally {
      setIsAssigning(false);
    }
  };

  const filteredPartners = partners.filter(partner =>
    partner.company_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    partner.full_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    partner.email.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="relative w-full max-w-lg bg-portal-surface rounded-2xl border border-white/[0.07] shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="p-5 border-b border-white/[0.07] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-purple-500/20 flex items-center justify-center">
              <Users className="w-5 h-5 text-purple-400" />
            </div>
            <div>
              <h2 className="font-bold text-lg text-white">Assign to Partner</h2>
              <p className="text-sm text-portal-soft">{task.title}</p>
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
        <div className="p-5 space-y-5">
          {error && (
            <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-red-400">{error}</p>
            </div>
          )}

          {/* Client Info */}
          <div className="p-3 bg-portal-surface2/50 rounded-xl">
            <p className="text-xs font-semibold text-portal-soft uppercase tracking-wide mb-1">Client Board</p>
            <p className="font-medium text-white">{boardName}</p>
          </div>

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-portal-soft" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search partners..."
              className="w-full pl-10 pr-4 py-3 bg-portal-surface2 border border-white/[0.07] rounded-xl text-white placeholder-zinc-500 focus:outline-none focus:border-purple-400 transition-colors"
            />
          </div>

          {/* Partner List */}
          <div className="max-h-48 overflow-y-auto space-y-2">
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 text-purple-400 animate-spin" />
              </div>
            ) : filteredPartners.length === 0 ? (
              <div className="text-center py-8 text-portal-soft">
                {partners.length === 0 ? 'No partners available' : 'No partners match your search'}
              </div>
            ) : (
              filteredPartners.map((partner) => (
                <button
                  key={partner.id}
                  onClick={() => setSelectedPartnerId(partner.id)}
                  className={`w-full p-3 rounded-xl flex items-center gap-3 transition-all ${
                    selectedPartnerId === partner.id
                      ? 'bg-purple-500/20 border-2 border-purple-400'
                      : 'bg-portal-surface2/50 border-2 border-transparent hover:border-white/[0.07]'
                  }`}
                >
                  {partner.avatar_url ? (
                    <img
                      src={partner.avatar_url}
                      alt={partner.full_name}
                      className="w-10 h-10 rounded-full object-cover"
                    />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-purple-500/20 flex items-center justify-center">
                      <span className="text-sm font-bold text-purple-400">
                        {partner.full_name.charAt(0).toUpperCase()}
                      </span>
                    </div>
                  )}
                  <div className="flex-1 text-left">
                    <p className="font-semibold text-white">{partner.company_name}</p>
                    <p className="text-sm text-portal-soft">{partner.full_name}</p>
                  </div>
                  {selectedPartnerId === partner.id && (
                    <div className="w-6 h-6 rounded-full bg-purple-500 flex items-center justify-center">
                      <Check className="w-4 h-4 text-white" />
                    </div>
                  )}
                </button>
              ))
            )}
          </div>

          {/* Visible Notes */}
          <div>
            <label className="block text-sm font-semibold text-portal-text mb-2">
              Notes for Partner (optional)
            </label>
            <textarea
              value={visibleNotes}
              onChange={(e) => setVisibleNotes(e.target.value)}
              placeholder="Add any instructions or context for the partner..."
              rows={3}
              className="w-full px-4 py-3 bg-portal-surface2 border border-white/[0.07] rounded-xl text-white placeholder-zinc-500 focus:outline-none focus:border-purple-400 resize-none transition-colors"
            />
            <p className="text-xs text-portal-soft mt-1">These notes will be visible to the partner</p>
          </div>
        </div>

        {/* Footer */}
        <div className="p-5 bg-portal-surface2/50 border-t border-white/[0.07] flex items-center justify-end gap-3">
          <button
            onClick={onClose}
            className="px-5 py-2 text-portal-soft hover:text-white font-medium transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleAssign}
            disabled={isAssigning || !selectedPartnerId}
            className="flex items-center gap-2 px-5 py-2 bg-purple-600 text-white font-semibold rounded-xl hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isAssigning ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Users className="w-4 h-4" />
            )}
            {isAssigning ? 'Assigning...' : 'Assign Task'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default AssignToPartnerModal;
