import React, { useState, useEffect, useRef } from 'react';
import {
  CheckSquare,
  Clock,
  Mail,
  CheckCircle2,
  AlertCircle,
  Filter,
  Search,
  X,
  GripVertical,
  FileText,
  ChevronDown,
  ExternalLink,
  MessageCircle,
} from 'lucide-react';
import { PartnerAccount, PartnerTask, PartnerTaskStatus, PartnerTaskColumn } from '../../types-portal';
import { ClientBoard, ToastType } from '../../types';
import {
  fetchAllClientTasksForPartner,
  upsertPartnerTaskStatus,
} from '../../services/clientPortalService';
import EmailGeneratorModal from './EmailGeneratorModal';
import PartnerTaskDetailModal from './PartnerTaskDetailModal';

interface ClientPortalTaskBoardProps {
  partnerAccount: PartnerAccount;
  addToast: (type: ToastType, message: string) => void;
  selectedClientId?: string;
}

const COLUMNS: { id: PartnerTaskStatus; title: string; color: string; icon: React.ElementType }[] = [
  { id: 'assigned', title: 'Assigned', color: 'bg-blue-500', icon: CheckSquare },
  { id: 'in_progress', title: 'In Progress', color: 'bg-yellow-500', icon: Clock },
  { id: 'needs_content', title: 'Needs Content', color: 'bg-orange-500', icon: FileText },
  { id: 'send_email', title: 'Send Email', color: 'bg-purple-500', icon: Mail },
  { id: 'completed', title: 'Completed', color: 'bg-green-500', icon: CheckCircle2 },
];

const ClientPortalTaskBoard: React.FC<ClientPortalTaskBoardProps> = ({
  partnerAccount,
  addToast,
  selectedClientId,
}) => {
  const [clients, setClients] = useState<ClientBoard[]>([]);
  const [allTasks, setAllTasks] = useState<PartnerTask[]>([]);
  const [filteredTasks, setFilteredTasks] = useState<PartnerTask[]>([]);
  const [selectedClient, setSelectedClient] = useState<string | null>(selectedClientId || null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [draggedTask, setDraggedTask] = useState<PartnerTask | null>(null);
  const [dragOverColumn, setDragOverColumn] = useState<PartnerTaskStatus | null>(null);

  // Email modal
  const [emailModalTask, setEmailModalTask] = useState<PartnerTask | null>(null);
  const [showEmailModal, setShowEmailModal] = useState(false);

  // Task detail modal
  const [selectedTask, setSelectedTask] = useState<PartnerTask | null>(null);
  const [showTaskDetail, setShowTaskDetail] = useState(false);

  // Client dropdown
  const [showClientDropdown, setShowClientDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadData();
  }, [partnerAccount.id]);

  useEffect(() => {
    filterTasks();
  }, [allTasks, selectedClient, searchQuery]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowClientDropdown(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const loadData = async () => {
    setIsLoading(true);
    try {
      // Fetch all tasks from client boards the partner has access to
      // Tasks are automatically visible without explicit assignment
      const { tasks, clients: clientsData } = await fetchAllClientTasksForPartner(partnerAccount.id);

      setClients(clientsData);
      setAllTasks(tasks);
    } catch (err) {
      console.error('Error loading task board data:', err);
      addToast('error', 'Failed to load tasks');
    } finally {
      setIsLoading(false);
    }
  };

  const filterTasks = () => {
    let filtered = [...allTasks];

    if (selectedClient) {
      filtered = filtered.filter((t) => t.client_board_id === selectedClient);
    }

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (t) =>
          t.task?.title?.toLowerCase().includes(query) ||
          t.visible_notes?.toLowerCase().includes(query) ||
          t.client_name?.toLowerCase().includes(query)
      );
    }

    setFilteredTasks(filtered);
  };

  const getColumnTasks = (status: PartnerTaskStatus): PartnerTask[] => {
    return filteredTasks.filter((t) => t.partner_status === status);
  };

  const handleDragStart = (e: React.DragEvent, task: PartnerTask) => {
    setDraggedTask(task);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent, columnId: PartnerTaskStatus) => {
    e.preventDefault();
    setDragOverColumn(columnId);
  };

  const handleDragLeave = () => {
    setDragOverColumn(null);
  };

  const handleDrop = async (e: React.DragEvent, newStatus: PartnerTaskStatus) => {
    e.preventDefault();
    setDragOverColumn(null);

    if (!draggedTask || draggedTask.partner_status === newStatus) {
      setDraggedTask(null);
      return;
    }

    // If dropping on "Send Email" column, open the email modal
    if (newStatus === 'send_email') {
      setEmailModalTask(draggedTask);
      setShowEmailModal(true);
      // Still update the status
    }

    // Optimistically update UI
    setAllTasks((prev) =>
      prev.map((t) =>
        t.task_id === draggedTask.task_id ? { ...t, partner_status: newStatus } : t
      )
    );

    // Upsert in database - creates entry if doesn't exist, updates if it does
    const { success, taskEntry } = await upsertPartnerTaskStatus(
      partnerAccount.id,
      draggedTask.client_board_id,
      draggedTask.task_id,
      draggedTask.group_id,
      newStatus
    );

    if (!success) {
      // Revert on failure
      setAllTasks((prev) =>
        prev.map((t) =>
          t.task_id === draggedTask.task_id ? { ...t, partner_status: draggedTask.partner_status } : t
        )
      );
      addToast('error', 'Failed to update task status');
    } else {
      // Update with actual DB id if it was a new entry
      if (taskEntry && draggedTask.id.startsWith('temp-')) {
        setAllTasks((prev) =>
          prev.map((t) =>
            t.task_id === draggedTask.task_id ? { ...t, id: taskEntry.id } : t
          )
        );
      }
      addToast('success', `Task moved to ${COLUMNS.find((c) => c.id === newStatus)?.title}`);
    }

    setDraggedTask(null);
  };

  const handleEmailSent = async () => {
    // Move task to email_sent status
    if (emailModalTask) {
      setAllTasks((prev) =>
        prev.map((t) =>
          t.task_id === emailModalTask.task_id ? { ...t, partner_status: 'email_sent' as PartnerTaskStatus } : t
        )
      );
      // Upsert the status in database
      await upsertPartnerTaskStatus(
        partnerAccount.id,
        emailModalTask.client_board_id,
        emailModalTask.task_id,
        emailModalTask.group_id,
        'email_sent'
      );
    }
    setShowEmailModal(false);
    setEmailModalTask(null);
  };

  const getSelectedClientName = () => {
    if (!selectedClient) return 'All Clients';
    const client = clients.find((c) => c.id === selectedClient);
    return client?.name || 'All Clients';
  };

  const handleTaskClick = (task: PartnerTask) => {
    setSelectedTask(task);
    setShowTaskDetail(true);
  };

  const handleTaskUpdated = (updatedTask: PartnerTask) => {
    setAllTasks((prev) =>
      prev.map((t) =>
        t.task_id === updatedTask.task_id ? updatedTask : t
      )
    );
    setSelectedTask(updatedTask);
  };

  if (isLoading) {
    return (
      <div className="p-8">
        <div className="animate-pulse space-y-8">
          <div className="h-8 bg-zinc-800 rounded w-48"></div>
          <div className="flex gap-4 overflow-x-auto">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="w-72 flex-shrink-0 h-96 bg-zinc-800 rounded-xl"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="p-6 border-b border-zinc-800 bg-zinc-900/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="flex flex-col lg:flex-row lg:items-center gap-4">
          <div className="flex-1">
            <h1 className="text-xl font-bold text-white">Task Board</h1>
            <p className="text-sm text-zinc-400 mt-1">
              Drag tasks between columns to update their status
            </p>
          </div>

          <div className="flex items-center gap-3">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
              <input
                type="text"
                placeholder="Search tasks..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 pr-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:border-amber-400 w-48 lg:w-64"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* Client Filter */}
            <div className="relative" ref={dropdownRef}>
              <button
                onClick={() => setShowClientDropdown(!showClientDropdown)}
                className="flex items-center gap-2 px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white hover:bg-zinc-700 transition-colors"
              >
                <Filter className="w-4 h-4" />
                <span className="max-w-32 truncate">{getSelectedClientName()}</span>
                <ChevronDown className="w-4 h-4" />
              </button>

              {showClientDropdown && (
                <div className="absolute right-0 mt-2 w-64 bg-zinc-800 border border-zinc-700 rounded-xl shadow-xl z-20 overflow-hidden">
                  <button
                    onClick={() => {
                      setSelectedClient(null);
                      setShowClientDropdown(false);
                    }}
                    className={`w-full px-4 py-3 text-left hover:bg-zinc-700 transition-colors ${
                      !selectedClient ? 'bg-zinc-700 text-amber-400' : 'text-white'
                    }`}
                  >
                    All Clients
                  </button>
                  {clients.map((client) => (
                    <button
                      key={client.id}
                      onClick={() => {
                        setSelectedClient(client.id);
                        setShowClientDropdown(false);
                      }}
                      className={`w-full px-4 py-3 text-left hover:bg-zinc-700 transition-colors flex items-center gap-3 ${
                        selectedClient === client.id ? 'bg-zinc-700 text-amber-400' : 'text-white'
                      }`}
                    >
                      <div
                        className="w-6 h-6 rounded flex items-center justify-center text-white text-xs font-semibold"
                        style={{ backgroundColor: client.color || '#3b82f6' }}
                      >
                        {client.initials}
                      </div>
                      <span className="truncate">{client.name}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Kanban Board */}
      <div className="flex-1 overflow-x-auto p-6">
        <div className="flex gap-4 min-w-max">
          {COLUMNS.map((column) => {
            const columnTasks = getColumnTasks(column.id);
            const Icon = column.icon;
            const isOver = dragOverColumn === column.id;

            return (
              <div
                key={column.id}
                className={`w-72 flex-shrink-0 bg-zinc-900/50 rounded-xl border transition-all ${
                  isOver ? 'border-amber-400 bg-amber-400/5' : 'border-zinc-800'
                }`}
                onDragOver={(e) => handleDragOver(e, column.id)}
                onDragLeave={handleDragLeave}
                onDrop={(e) => handleDrop(e, column.id)}
              >
                {/* Column Header */}
                <div className="p-4 border-b border-zinc-800 flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-lg ${column.color}/20 flex items-center justify-center`}>
                    <Icon className={`w-4 h-4 ${column.color.replace('bg-', 'text-')}`} />
                  </div>
                  <div className="flex-1">
                    <h3 className="font-medium text-white">{column.title}</h3>
                    <p className="text-xs text-zinc-500">{columnTasks.length} tasks</p>
                  </div>
                </div>

                {/* Tasks */}
                <div className="p-3 space-y-3 min-h-[200px]">
                  {columnTasks.length === 0 ? (
                    <div className="text-center py-8 text-zinc-500 text-sm">
                      No tasks
                    </div>
                  ) : (
                    columnTasks.map((task) => (
                      <div
                        key={task.id}
                        draggable
                        onDragStart={(e) => handleDragStart(e, task)}
                        onClick={() => handleTaskClick(task)}
                        className={`bg-zinc-800 rounded-xl p-4 cursor-pointer border border-zinc-700 hover:border-amber-400/50 hover:bg-zinc-750 transition-all ${
                          draggedTask?.id === task.id ? 'opacity-50 cursor-grabbing' : ''
                        }`}
                      >
                        <div className="flex items-start gap-2 mb-2">
                          <GripVertical className="w-4 h-4 text-zinc-500 flex-shrink-0 mt-1" />
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-white text-sm line-clamp-2">
                              {task.task?.title || `Task ${task.task_id.slice(0, 8)}`}
                            </p>
                            {task.client_name && (
                              <p className="text-xs text-zinc-400 mt-1">{task.client_name}</p>
                            )}
                          </div>
                        </div>

                        {task.visible_notes && (
                          <p className="text-xs text-zinc-500 mt-2 line-clamp-2 ml-6">
                            {task.visible_notes}
                          </p>
                        )}

                        {task.task?.dueDate && (
                          <div className="flex items-center gap-1 mt-3 ml-6">
                            <Clock className="w-3 h-3 text-zinc-500" />
                            <span className="text-xs text-zinc-500">
                              Due: {new Date(task.task.dueDate).toLocaleDateString()}
                            </span>
                          </div>
                        )}

                        {/* Links and Comments Row */}
                        <div className="flex items-center justify-between mt-3 ml-6">
                          <div className="flex gap-2">
                            {task.task?.worksheet && (
                              <a
                                href={task.task.worksheet}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-1 text-xs text-amber-400 hover:text-amber-300"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <ExternalLink className="w-3 h-3" />
                                Worksheet
                              </a>
                            )}
                            {task.task?.clientSheet && (
                              <a
                                href={task.task.clientSheet}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <ExternalLink className="w-3 h-3" />
                                Client Sheet
                              </a>
                            )}
                          </div>
                          {/* Comment count */}
                          {task.task?.comments && task.task.comments.length > 0 && (
                            <div className="flex items-center gap-1 text-xs text-zinc-400">
                              <MessageCircle className="w-3 h-3" />
                              <span>{task.task.comments.length}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Email Generator Modal */}
      {showEmailModal && emailModalTask && (
        <EmailGeneratorModal
          isOpen={showEmailModal}
          onClose={() => {
            setShowEmailModal(false);
            setEmailModalTask(null);
          }}
          task={emailModalTask}
          partnerAccount={partnerAccount}
          clientName={emailModalTask.client_name || 'Client'}
          onEmailSent={handleEmailSent}
          addToast={addToast}
        />
      )}

      {/* Task Detail Modal */}
      {showTaskDetail && selectedTask && (
        <PartnerTaskDetailModal
          isOpen={showTaskDetail}
          onClose={() => {
            setShowTaskDetail(false);
            setSelectedTask(null);
          }}
          task={selectedTask}
          partnerAccount={partnerAccount}
          addToast={addToast}
          onTaskUpdated={handleTaskUpdated}
        />
      )}
    </div>
  );
};

export default ClientPortalTaskBoard;
