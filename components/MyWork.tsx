import React, { useState, useEffect, useRef } from 'react';
import { Calendar, Table as TableIcon, CheckCircle2, AlertCircle, Clock, ChevronLeft, ChevronRight, Users, Filter, MessageCircle, X, Send } from 'lucide-react';
import { User, ToastType, Task, TaskGroup, ClientBoard, Profile, TaskComment } from '../types';
import { fetchClientBoards, fetchProfiles, saveClientBoard, createNotification } from '../services/databaseService';
import { supabase } from '../lib/supabaseClient';

// Detect @mentions in text
const detectMentions = (text: string, profiles: Profile[]): string[] => {
  const mentionedIds: string[] = [];

  // Check for @everyone
  if (text.toLowerCase().includes('@everyone')) {
    return profiles.map(p => p.id);
  }

  // Check for @name mentions
  profiles.forEach(profile => {
    const name = profile.full_name || '';
    const firstName = name.split(' ')[0].toLowerCase();
    const fullName = name.toLowerCase();

    if (text.toLowerCase().includes(`@${firstName}`) || text.toLowerCase().includes(`@${fullName}`)) {
      mentionedIds.push(profile.id);
    }
  });

  return mentionedIds;
};

interface MyWorkProps {
  currentUser: User;
  addToast: (type: ToastType, message: string) => void;
  onNavigateToTasks?: () => void;
}

interface TaskWithContext extends Task {
  groupTitle: string;
  groupColor: string;
  clientName: string;
  clientId: string;
  groupId: string;
  boardData: ClientBoard;
}

const MyWork: React.FC<MyWorkProps> = ({ currentUser, addToast, onNavigateToTasks }) => {

  const [viewMode, setViewMode] = useState<'table' | 'calendar'>('table');
  const [allTasks, setAllTasks] = useState<TaskWithContext[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [teamProfiles, setTeamProfiles] = useState<Profile[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string>('all');
  const [selectedStatusId, setSelectedStatusId] = useState<string>('all');
  const [hideDone, setHideDone] = useState(false);
  const [hideSentToClient, setHideSentToClient] = useState(false);

  // Task Modal State
  const [selectedTask, setSelectedTask] = useState<TaskWithContext | null>(null);
  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);

  // Editing state
  const [newComment, setNewComment] = useState('');
  const [showStatusPicker, setShowStatusPicker] = useState(false);
  const [showPriorityPicker, setShowPriorityPicker] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [allBoards, setAllBoards] = useState<ClientBoard[]>([]);

  // Mention dropdown state
  const [mentionDropdown, setMentionDropdown] = useState<{ show: boolean; search: string; position: number } | null>(null);
  const commentInputRef = useRef<HTMLInputElement>(null);

  // Track in-flight saves to prevent realtime from overwriting them
  const pendingSaveRef = useRef<{ taskId: string; boardId: string } | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  // Handle deep link from notification click
  useEffect(() => {
    const checkForDeepLink = () => {
      const openTaskData = localStorage.getItem('openMyWorkTask');
      if (!openTaskData) return;

      // Wait for tasks to load
      if (allTasks.length === 0) return;

      try {
        const linkData = JSON.parse(openTaskData);
        const { taskId, boardId } = linkData;

        // Find the task in allTasks
        const task = allTasks.find(t => t.id === taskId && t.clientId === boardId);

        if (task) {
          setSelectedTask(task);
          setIsTaskModalOpen(true);
          localStorage.removeItem('openMyWorkTask');
        } else {
          // Task not found in My Work (maybe user not assigned)
          // Clear the localStorage and let them know
          localStorage.removeItem('openMyWorkTask');
          console.warn('[MyWork] Task not found in My Work tasks:', linkData);
        }
      } catch (e) {
        console.error('[MyWork] Error processing deep link:', e);
        localStorage.removeItem('openMyWorkTask');
      }
    };

    // Check on mount and when tasks load
    checkForDeepLink();

    // Listen for custom event (same-tab detection)
    const handleOpenMyWorkTask = (event: CustomEvent) => {
      // Small delay to ensure state is ready
      setTimeout(checkForDeepLink, 100);
    };

    window.addEventListener('openMyWorkTask', handleOpenMyWorkTask as EventListener);

    return () => {
      window.removeEventListener('openMyWorkTask', handleOpenMyWorkTask as EventListener);
    };
  }, [allTasks]);

  const loadData = async () => {
    setLoading(true);
    const [boards, profiles] = await Promise.all([fetchClientBoards(), fetchProfiles()]);

    // Store all boards for updating
    setAllBoards(boards);

    // Extract all tasks with context
    const tasks: TaskWithContext[] = [];
    const taskIds = new Set<string>(); // Track unique task IDs to avoid duplicates

    boards.forEach(board => {
      board.groups.forEach(group => {
        group.tasks.forEach(task => {
          // Get all assigned user IDs
          const assignedIds = Array.isArray(task.assignedTo)
            ? task.assignedTo
            : task.assignedTo ? [task.assignedTo] : [];

          // Create unique key for this task
          const taskKey = `${board.id}-${group.id}-${task.id}`;

          // Include task if ANY user is assigned and not already added
          if (assignedIds.length > 0 && !taskIds.has(taskKey)) {
            taskIds.add(taskKey);
            tasks.push({
              ...task,
              groupTitle: group.title,
              groupColor: group.color,
              clientName: board.name,
              clientId: board.id,
              groupId: group.id,
              boardData: board
            });
          }
        });
      });
    });

    setAllTasks(tasks);
    setTeamProfiles(profiles);
    setLoading(false);
  };

  // Realtime subscription for client_boards changes
  useEffect(() => {
    const boardsSub = supabase.channel('public:client_boards_mywork')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'client_boards' }, async (payload) => {
        console.log('[MyWork] Realtime update received:', payload.eventType);

        // Skip realtime update if we have a pending save to prevent race condition
        if (pendingSaveRef.current) {
          console.log('[MyWork] Skipping realtime update - save in progress for task:', pendingSaveRef.current.taskId);
          return;
        }

        // Refetch all boards and rebuild the task list
        const [boards, profiles] = await Promise.all([fetchClientBoards(), fetchProfiles()]);

        // Store all boards for updating
        setAllBoards(boards);

        // Extract all tasks with context
        const tasks: TaskWithContext[] = [];
        const taskIds = new Set<string>();

        boards.forEach(board => {
          board.groups.forEach(group => {
            group.tasks.forEach(task => {
              const assignedIds = Array.isArray(task.assignedTo)
                ? task.assignedTo
                : task.assignedTo ? [task.assignedTo] : [];

              const taskKey = `${board.id}-${group.id}-${task.id}`;

              if (assignedIds.length > 0 && !taskIds.has(taskKey)) {
                taskIds.add(taskKey);
                tasks.push({
                  ...task,
                  groupTitle: group.title,
                  groupColor: group.color,
                  clientName: board.name,
                  clientId: board.id,
                  groupId: group.id,
                  boardData: board
                });
              }
            });
          });
        });

        setAllTasks(tasks);
        setTeamProfiles(profiles);

        // Update selected task if modal is open - use functional update to get current state
        setSelectedTask(currentSelectedTask => {
          if (currentSelectedTask && isTaskModalOpen) {
            const updatedTask = tasks.find(t => t.id === currentSelectedTask.id && t.clientId === currentSelectedTask.clientId);
            if (updatedTask) {
              return updatedTask;
            }
          }
          return currentSelectedTask;
        });
      })
      .subscribe();

    return () => {
      supabase.removeChannel(boardsSub);
    };
  }, [isTaskModalOpen]);

  // Update task in the source board and save
  const updateTaskInBoard = async (
    task: TaskWithContext,
    field: keyof Task,
    value: any
  ) => {
    console.log('[MyWork] updateTaskInBoard called:', { taskId: task.id, field, value, boardId: task.clientId });
    setIsSaving(true);

    // Mark this task as having a pending save to prevent realtime from overwriting
    pendingSaveRef.current = { taskId: task.id, boardId: task.clientId };

    try {
      // Find the board
      const boardIndex = allBoards.findIndex(b => b.id === task.clientId);
      if (boardIndex === -1) throw new Error('Board not found');

      const board = allBoards[boardIndex];

      // Find the task's ACTUAL current group (it may have moved)
      let actualGroupId = task.groupId;
      let currentTask: Task | undefined;
      for (const group of board.groups) {
        const found = group.tasks.find(t => t.id === task.id);
        if (found) {
          actualGroupId = group.id;
          currentTask = found;
          break;
        }
      }

      if (!currentTask) {
        throw new Error('Task not found in board');
      }

      // Handle Done status group movement (same logic as TaskBoard)
      const doneStatusId = board.statusDefs.find(s => s.label === 'Done')?.id;
      const currentGroup = board.groups.find(g => g.id === actualGroupId);
      const isCurrentlyDone = currentTask.status === doneStatusId;
      const isChangingToDone = field === 'status' && value === doneStatusId;
      const isChangingFromDone = field === 'status' && isCurrentlyDone && value !== doneStatusId;

      let updatedGroups = board.groups;

      // CASE 1: Moving TO Done group
      if (isChangingToDone && currentGroup?.title !== 'Done') {
        const taskToMove = {
          ...currentTask,
          [field]: value,
          originalGroupId: actualGroupId
        };

        let doneGroupExists = false;
        updatedGroups = board.groups.map(g => {
          if (g.title === 'Done') {
            doneGroupExists = true;
            return { ...g, tasks: [...g.tasks, taskToMove] };
          } else if (g.id === actualGroupId) {
            return { ...g, tasks: g.tasks.filter(t => t.id !== task.id) };
          }
          return g;
        });

        if (!doneGroupExists) {
          updatedGroups.push({
            id: Date.now().toString(),
            title: 'Done',
            color: '#00D084',
            tasks: [taskToMove]
          });
        }
      }
      // CASE 2: Moving FROM Done group back to original
      else if (isChangingFromDone && currentGroup?.title === 'Done') {
        const taskToMove = { ...currentTask, [field]: value };
        const originalGroupId = (currentTask as any).originalGroupId;

        let targetGroupId = originalGroupId;
        if (!targetGroupId || !board.groups.find(g => g.id === targetGroupId)) {
          const firstNonDoneGroup = board.groups.find(g => g.title !== 'Done');
          targetGroupId = firstNonDoneGroup?.id;
        }

        if (targetGroupId) {
          delete (taskToMove as any).originalGroupId;
          updatedGroups = board.groups.map(g => {
            if (g.id === targetGroupId) {
              return { ...g, tasks: [...g.tasks, taskToMove] };
            } else if (g.id === actualGroupId) {
              return { ...g, tasks: g.tasks.filter(t => t.id !== task.id) };
            }
            return g;
          });
        } else {
          // Just update in place
          updatedGroups = board.groups.map(g =>
            g.id === actualGroupId
              ? { ...g, tasks: g.tasks.map(t => t.id === task.id ? { ...t, [field]: value } : t) }
              : g
          );
        }
      }
      // CASE 3: Normal field update
      else {
        updatedGroups = board.groups.map(group => {
          if (group.id === actualGroupId) {
            return {
              ...group,
              tasks: group.tasks.map(t =>
                t.id === task.id ? { ...t, [field]: value } : t
              )
            };
          }
          return group;
        });
      }

      const updatedBoard = { ...board, groups: updatedGroups };

      // Update local state
      const newBoards = [...allBoards];
      newBoards[boardIndex] = updatedBoard;
      setAllBoards(newBoards);

      // Update the task in allTasks (find by task ID only, group may have changed)
      setAllTasks(prev =>
        prev.map(t =>
          t.id === task.id && t.clientId === task.clientId
            ? { ...t, [field]: value, boardData: updatedBoard }
            : t
        )
      );

      // Update selected task if open
      if (selectedTask && selectedTask.id === task.id) {
        setSelectedTask({
          ...selectedTask,
          [field]: value,
          boardData: updatedBoard
        });
      }

      // Save to database
      console.log('[MyWork] Saving board to database:', updatedBoard.id);
      await saveClientBoard(updatedBoard);
      console.log('[MyWork] Board saved successfully');
      addToast('success', 'Task updated');
    } catch (error) {
      console.error('Failed to update task:', error);
      addToast('error', 'Failed to update task');
    } finally {
      // Clear the pending save ref after a small delay to ensure realtime doesn't race
      setTimeout(() => {
        pendingSaveRef.current = null;
      }, 500);
      setIsSaving(false);
    }
  };

  // Add comment to task
  const handleAddComment = async () => {
    if (!newComment.trim() || !selectedTask) return;

    setMentionDropdown(null);
    const mentions = detectMentions(newComment.trim(), teamProfiles);

    const comment: TaskComment = {
      id: Date.now().toString(),
      author: currentUser.name,
      authorId: currentUser.id,
      text: newComment.trim(),
      timestamp: new Date().toISOString(),
      avatar: currentUser.avatarUrl,
      mentions
    };

    const updatedComments = [...(selectedTask.comments || []), comment];
    await updateTaskInBoard(selectedTask, 'comments', updatedComments);
    const commentText = newComment;
    setNewComment('');

    // Collect all users to notify (assigned + mentioned, no duplicates)
    const assignedIds = Array.isArray(selectedTask.assignedTo)
      ? selectedTask.assignedTo
      : selectedTask.assignedTo ? [selectedTask.assignedTo] : [];

    const usersToNotify = new Set<string>([...assignedIds, ...mentions]);

    for (const userId of usersToNotify) {
      if (userId !== currentUser.id) {
        const isMentioned = mentions.includes(userId);
        await createNotification(
          userId,
          isMentioned
            ? `${currentUser.name} mentioned you on "${selectedTask.title}"`
            : `New comment on "${selectedTask.title}"`,
          `${currentUser.name}: ${commentText.substring(0, 100)}`,
          isMentioned ? 'message' : 'info',
          'MY_WORK',
          {
            taskId: selectedTask.id,
            boardId: selectedTask.clientId,
            groupId: selectedTask.groupId
          }
        );
      }
    }
  };

  // Handle selecting a mention from dropdown
  const handleSelectMention = (name: string) => {
    if (!mentionDropdown) return;
    const lastAtIndex = newComment.lastIndexOf('@');
    const newText = newComment.substring(0, lastAtIndex) + '@' + name + ' ' + newComment.substring(mentionDropdown.position);
    setNewComment(newText);
    setMentionDropdown(null);
    commentInputRef.current?.focus();
  };

  // Get all unique statuses across all boards
  const statusMap = new Map<string, { id: string; label: string; color: string }>();
  allTasks.forEach(task => {
    task.boardData.statusDefs.forEach((def: { id: string; label: string; color: string }) => {
      if (!statusMap.has(def.id)) {
        statusMap.set(def.id, { id: def.id, label: def.label, color: def.color });
      }
    });
  });
  const allStatuses = Array.from(statusMap.values());

  // Filter tasks by selected user and status
  const filteredTasks = allTasks.filter(task => {
    // User filter
    if (selectedUserId !== 'all') {
      const assignedIds = Array.isArray(task.assignedTo)
        ? task.assignedTo
        : task.assignedTo ? [task.assignedTo] : [];

      // Get selected user's name for matching
      const selectedProfile = teamProfiles.find(p => p.id === selectedUserId);
      const selectedUserName = selectedProfile?.full_name || selectedProfile?.email || '';
      const isCurrentUser = selectedUserId === currentUser.id;
      const currentUserName = currentUser.name;

      // Check if user is assigned by ID OR by name
      const isAssigned = assignedIds.some(assignedId => {
        // Try exact ID match first
        if (assignedId === selectedUserId) return true;
        if (isCurrentUser && assignedId === currentUser.id) return true;

        // Try case-insensitive name match (for legacy data)
        const assignedLower = String(assignedId).toLowerCase().trim();
        const selectedNameLower = selectedUserName.toLowerCase().trim();
        const currentNameLower = currentUserName.toLowerCase().trim();

        if (selectedNameLower && assignedLower === selectedNameLower) return true;
        if (isCurrentUser && assignedLower === currentNameLower) return true;

        // Try partial name match (first name or last name)
        if (selectedNameLower && (
          assignedLower.includes(selectedNameLower) ||
          selectedNameLower.includes(assignedLower)
        )) return true;

        return false;
      });

      if (!isAssigned) {
        return false;
      }
    }

    // Status filter
    if (selectedStatusId !== 'all' && task.status !== selectedStatusId) {
      return false;
    }

    // Hide done filter
    if (hideDone) {
      const statusDef = task.boardData.statusDefs.find(s => s.id === task.status);
      const statusLabel = statusDef?.label?.toLowerCase() || '';

      if (statusLabel === 'done') {
        return false;
      }
    }

    // Hide sent to client filter
    if (hideSentToClient) {
      const statusDef = task.boardData.statusDefs.find(s => s.id === task.status);
      const statusLabel = statusDef?.label?.toLowerCase() || '';

      if (statusLabel === 'sent to client') {
        return false;
      }
    }

    return true;
  });


  const getTaskStatus = (dueDate: string) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const due = new Date(dueDate);
    due.setHours(0, 0, 0, 0);

    if (due < today) return 'overdue';
    if (due.getTime() === today.getTime()) return 'today';
    if (due <= new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000)) return 'upcoming';
    return 'future';
  };

  const overdueTasks = filteredTasks.filter(t => getTaskStatus(t.dueDate) === 'overdue');
  const todayTasks = filteredTasks.filter(t => getTaskStatus(t.dueDate) === 'today');
  const upcomingTasks = filteredTasks.filter(t => getTaskStatus(t.dueDate) === 'upcoming');

  const handleTaskClick = (task: TaskWithContext) => {
    setSelectedTask(task);
    setIsTaskModalOpen(true);
  };

  // Calendar helpers
  const daysInMonth = (date: Date) => new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  const firstDayOfMonth = (date: Date) => new Date(date.getFullYear(), date.getMonth(), 1).getDay();

  const prevMonth = () => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1));
  const nextMonth = () => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1));

  const getTasksForDate = (day: number) => {
    const dateStr = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    return filteredTasks.filter(t => t.dueDate === dateStr);
  };

  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

  // Get selected user name
  const getSelectedUserName = () => {
    if (selectedUserId === 'all') return 'All Users';
    if (selectedUserId === currentUser.id) return 'Me';
    const profile = teamProfiles.find(p => p.id === selectedUserId);
    return profile?.full_name || 'Unknown User';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-portal-soft">Loading tasks...</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-portal-dark">
      {/* Header */}
      <div className="bg-portal-surface border-b border-white/[0.07] px-3 lg:px-8 py-3 lg:py-6">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 lg:gap-4">
          <div>
            <h1 className="text-xl lg:text-3xl font-bold text-white">My Work</h1>
            <p className="text-xs lg:text-sm text-portal-soft mt-0.5 lg:mt-1">
              {filteredTasks.length} task{filteredTasks.length !== 1 ? 's' : ''} assigned to {getSelectedUserName()}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-1.5 lg:gap-2">
            {/* User Filter Dropdown */}
            <div className="relative flex-1 sm:flex-none">
              <select
                value={selectedUserId}
                onChange={(e) => setSelectedUserId(e.target.value)}
                className="appearance-none w-full sm:w-auto bg-portal-surface border border-white/[0.07] rounded-xl lg:rounded-lg pl-9 lg:pl-10 pr-7 lg:pr-8 py-2.5 text-xs lg:text-sm font-medium text-portal-text hover:border-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent cursor-pointer"
              >
                <option value={currentUser.id}>My Tasks</option>
                <option value="all">All Team Tasks</option>
                <option disabled className="text-portal-soft">───────────</option>
                {teamProfiles.map(profile => (
                  <option key={profile.id} value={profile.id}>
                    {profile.full_name || profile.email || 'Unknown'}
                  </option>
                ))}
              </select>
              <Users className="absolute left-2.5 lg:left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-portal-soft pointer-events-none" />
              <ChevronRight className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-portal-soft pointer-events-none rotate-90" />
            </div>

            {/* Status Filter Dropdown */}
            <div className="relative flex-1 sm:flex-none">
              <select
                value={selectedStatusId}
                onChange={(e) => setSelectedStatusId(e.target.value)}
                className="appearance-none w-full sm:w-auto bg-portal-surface border border-white/[0.07] rounded-xl lg:rounded-lg pl-9 lg:pl-10 pr-7 lg:pr-8 py-2.5 text-xs lg:text-sm font-medium text-portal-text hover:border-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent cursor-pointer"
              >
                <option value="all">All Statuses</option>
                {allStatuses.map(status => (
                  <option key={status.id} value={status.id}>
                    {status.label}
                  </option>
                ))}
              </select>
              <Filter className="absolute left-2.5 lg:left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-portal-soft pointer-events-none" />
              <ChevronRight className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-portal-soft pointer-events-none rotate-90" />
            </div>

            {/* Hide Done Toggle */}
            <button
              onClick={() => setHideDone(!hideDone)}
              className={`px-2.5 lg:px-3 py-2.5 rounded-xl lg:rounded-lg text-xs lg:text-sm font-medium transition-all flex items-center gap-1.5 lg:gap-2 border active:scale-95 ${
                hideDone
                  ? 'bg-brand-50 text-brand-700 border-brand-300'
                  : 'bg-portal-surface text-portal-soft border-white/[0.07] hover:border-slate-400'
              }`}
            >
              <CheckCircle2 className="w-4 h-4" />
              <span className="hidden sm:inline">Hide Done</span>
            </button>

            {/* Hide Sent to Client Toggle */}
            <button
              onClick={() => setHideSentToClient(!hideSentToClient)}
              className={`px-2.5 lg:px-3 py-2.5 rounded-xl lg:rounded-lg text-xs lg:text-sm font-medium transition-all flex items-center gap-1.5 lg:gap-2 border active:scale-95 ${
                hideSentToClient
                  ? 'bg-brand-50 text-brand-700 border-brand-300'
                  : 'bg-portal-surface text-portal-soft border-white/[0.07] hover:border-slate-400'
              }`}
            >
              <Send className="w-4 h-4" />
              <span className="hidden sm:inline">Hide Sent</span>
            </button>

            {/* View Toggle */}
            <div className="flex gap-1 bg-portal-surface2 p-1 rounded-xl lg:rounded-lg">
              <button
                onClick={() => setViewMode('table')}
                className={`px-2.5 lg:px-4 py-2 rounded-lg lg:rounded-md font-medium text-xs lg:text-sm transition-all flex items-center gap-1.5 lg:gap-2 active:scale-95 ${
                  viewMode === 'table' ? 'bg-portal-surface text-white shadow-lg shadow-black/20' : 'text-portal-soft hover:text-white'
                }`}
              >
                <TableIcon className="w-4 h-4" />
                <span className="hidden sm:inline">Table</span>
              </button>
              <button
                onClick={() => setViewMode('calendar')}
                className={`px-2.5 lg:px-4 py-2 rounded-lg lg:rounded-md font-medium text-xs lg:text-sm transition-all flex items-center gap-1.5 lg:gap-2 active:scale-95 ${
                  viewMode === 'calendar' ? 'bg-portal-surface text-white shadow-lg shadow-black/20' : 'text-portal-soft hover:text-white'
                }`}
              >
                <Calendar className="w-4 h-4" />
                <span className="hidden sm:inline">Calendar</span>
              </button>
            </div>
          </div>
        </div>

        {/* Stats Row */}
        <div className="grid grid-cols-3 gap-2 lg:gap-4 mt-4 lg:mt-6">
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 lg:p-4">
            <div className="flex items-center gap-2 text-red-700 mb-1">
              <AlertCircle className="w-3 h-3 lg:w-4 lg:h-4" />
              <span className="text-[10px] lg:text-xs font-semibold uppercase">Overdue</span>
            </div>
            <div className="text-xl lg:text-2xl font-bold text-red-900">{overdueTasks.length}</div>
          </div>
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 lg:p-4">
            <div className="flex items-center gap-2 text-blue-700 mb-1">
              <Clock className="w-3 h-3 lg:w-4 lg:h-4" />
              <span className="text-[10px] lg:text-xs font-semibold uppercase">Today</span>
            </div>
            <div className="text-xl lg:text-2xl font-bold text-blue-900">{todayTasks.length}</div>
          </div>
          <div className="bg-green-50 border border-green-200 rounded-lg p-3 lg:p-4">
            <div className="flex items-center gap-2 text-green-700 mb-1">
              <CheckCircle2 className="w-3 h-3 lg:w-4 lg:h-4" />
              <span className="text-[10px] lg:text-xs font-semibold uppercase">This Week</span>
            </div>
            <div className="text-xl lg:text-2xl font-bold text-green-900">{upcomingTasks.length}</div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden p-4 lg:p-8 flex flex-col">
        {viewMode === 'table' ? (
          <div className="bg-portal-surface rounded-xl shadow-lg shadow-black/20 border border-white/[0.07] flex-1 flex flex-col overflow-hidden">
            <div className="overflow-y-auto flex-1">
              <table className="w-full table-fixed">
                <thead className="bg-portal-dark border-b border-white/[0.07] sticky top-0 z-10">
                  <tr>
                    <th className="text-left py-3 px-2 lg:px-4 text-xs font-semibold text-portal-soft uppercase w-[25%]">Task</th>
                    <th className="text-left py-3 px-2 lg:px-4 text-xs font-semibold text-portal-soft uppercase w-[15%]">Group</th>
                    <th className="text-left py-3 px-2 lg:px-4 text-xs font-semibold text-portal-soft uppercase w-[20%]">Board</th>
                    <th className="text-center py-3 px-2 lg:px-4 text-xs font-semibold text-portal-soft uppercase w-[12%]">Date</th>
                    <th className="text-center py-3 px-2 lg:px-4 text-xs font-semibold text-portal-soft uppercase w-[14%]">Status</th>
                    <th className="text-center py-3 px-2 lg:px-4 text-xs font-semibold text-portal-soft uppercase w-[14%]">Priority</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredTasks.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-12 text-center text-portal-soft">
                        <CheckCircle2 className="w-12 h-12 mx-auto mb-3 opacity-20" />
                        <p>No tasks found</p>
                      </td>
                    </tr>
                  ) : (
                    filteredTasks
                      .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime())
                      .map((task, index) => {
                        const status = getTaskStatus(task.dueDate);
                        return (
                          <tr
                            key={`${task.clientId}-${task.groupId}-${task.id}-${index}`}
                            className="hover:bg-portal-dark transition-colors cursor-pointer"
                            onClick={() => handleTaskClick(task)}
                          >
                            <td className="py-3 px-2 lg:px-4">
                              <div className="flex items-center gap-2">
                                <div className="w-1 h-8 rounded-full flex-shrink-0" style={{ backgroundColor: task.groupColor }}></div>
                                <span className="text-sm font-medium text-portal-text truncate">{task.title}</span>
                              </div>
                            </td>
                            <td className="py-3 px-2 lg:px-4">
                              <span className="text-sm text-portal-soft truncate block">{task.groupTitle}</span>
                            </td>
                            <td className="py-3 px-2 lg:px-4">
                              <span className="text-sm text-portal-soft truncate block">{task.clientName}</span>
                            </td>
                            <td className="py-3 px-2 lg:px-4 text-center">
                              <span className={`text-sm font-medium whitespace-nowrap ${
                                status === 'overdue' ? 'text-red-600' :
                                status === 'today' ? 'text-blue-600' :
                                status === 'upcoming' ? 'text-green-600' :
                                'text-portal-soft'
                              }`}>
                                {new Date(task.dueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                              </span>
                            </td>
                            <td className="py-3 px-2 lg:px-4 text-center">
                              {(() => {
                                const statusDef = task.boardData.statusDefs.find(s => s.id === task.status);
                                const statusLabel = statusDef?.label || task.status;
                                const statusColor = statusDef?.color || '#94a3b8';
                                return (
                                  <span
                                    className="inline-block px-2 py-1 text-xs font-semibold rounded truncate max-w-full"
                                    style={{
                                      backgroundColor: statusColor + '20',
                                      color: statusColor
                                    }}
                                  >
                                    {statusLabel}
                                  </span>
                                );
                              })()}
                            </td>
                            <td className="py-3 px-2 lg:px-4 text-center">
                              {(() => {
                                const priorityDef = task.boardData.priorityDefs.find(p => p.id === task.priority);
                                const priorityLabel = priorityDef?.label || task.priority;
                                const priorityColor = priorityDef?.color || '#94a3b8';
                                return (
                                  <span
                                    className="inline-block px-2 py-1 text-xs font-semibold rounded truncate max-w-full"
                                    style={{
                                      backgroundColor: priorityColor + '20',
                                      color: priorityColor
                                    }}
                                  >
                                    {priorityLabel}
                                  </span>
                                );
                              })()}
                            </td>
                          </tr>
                        );
                      })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          // Calendar View
          <div className="bg-portal-surface rounded-xl shadow-lg shadow-black/20 border border-white/[0.07] overflow-hidden">
            {/* Calendar Header */}
            <div className="flex items-center justify-between p-4 lg:p-6 border-b border-white/[0.07]">
              <h2 className="text-lg lg:text-xl font-bold text-white">
                {monthNames[currentDate.getMonth()]} {currentDate.getFullYear()}
              </h2>
              <div className="flex gap-2">
                <button
                  onClick={prevMonth}
                  className="p-2 hover:bg-portal-surface2 rounded-lg transition-colors"
                >
                  <ChevronLeft className="w-5 h-5 text-portal-soft" />
                </button>
                <button
                  onClick={nextMonth}
                  className="p-2 hover:bg-portal-surface2 rounded-lg transition-colors"
                >
                  <ChevronRight className="w-5 h-5 text-portal-soft" />
                </button>
              </div>
            </div>

            {/* Calendar Grid */}
            <div className="p-2 lg:p-4">
              <div className="grid grid-cols-7 gap-1 lg:gap-2">
                {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
                  <div key={day} className="text-center py-2 text-xs font-semibold text-portal-soft uppercase">
                    {day}
                  </div>
                ))}

                {/* Empty cells before month starts */}
                {Array.from({ length: firstDayOfMonth(currentDate) }).map((_, i) => (
                  <div key={`empty-${i}`} className="aspect-square"></div>
                ))}

                {/* Days of month */}
                {Array.from({ length: daysInMonth(currentDate) }).map((_, i) => {
                  const day = i + 1;
                  const tasksForDay = getTasksForDate(day);
                  const hasOverdue = tasksForDay.some(t => getTaskStatus(t.dueDate) === 'overdue');
                  const isToday = new Date().getDate() === day &&
                                  new Date().getMonth() === currentDate.getMonth() &&
                                  new Date().getFullYear() === currentDate.getFullYear();

                  return (
                    <div
                      key={day}
                      className={`aspect-square border rounded-lg p-1 lg:p-2 ${
                        isToday ? 'border-brand-500 bg-brand-50' : 'border-white/[0.07] hover:border-white/[0.07]'
                      } transition-colors`}
                    >
                      <div className={`text-xs lg:text-sm font-semibold mb-1 ${
                        isToday ? 'text-brand-700' : 'text-portal-text'
                      }`}>
                        {day}
                      </div>
                      <div className="space-y-1">
                        {tasksForDay.slice(0, 3).map(task => (
                          <div
                            key={task.id}
                            className={`text-[9px] lg:text-[10px] px-1 py-0.5 rounded truncate cursor-pointer ${
                              hasOverdue ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'
                            }`}
                            title={task.title}
                            onClick={() => handleTaskClick(task)}
                          >
                            {task.title}
                          </div>
                        ))}
                        {tasksForDay.length > 3 && (
                          <div className="text-[9px] lg:text-[10px] text-portal-soft px-1">
                            +{tasksForDay.length - 3} more
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Task Modal - Full editing modal */}
      {isTaskModalOpen && selectedTask && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm" onClick={() => { setIsTaskModalOpen(false); setShowStatusPicker(false); setShowPriorityPicker(false); }}>
          <div className="bg-portal-surface rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            {/* Modal Header */}
            <div className="p-6 border-b border-white/[0.07] bg-gradient-to-r from-slate-50 to-white rounded-t-2xl">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="w-1 h-8 rounded-full" style={{ backgroundColor: selectedTask.groupColor }}></div>
                    <h2 className="text-xl font-bold text-white">{selectedTask.title}</h2>
                  </div>
                  <p className="text-sm text-portal-soft">{selectedTask.clientName} → {selectedTask.groupTitle}</p>
                </div>
                <button
                  onClick={() => { setIsTaskModalOpen(false); setShowStatusPicker(false); setShowPriorityPicker(false); }}
                  className="p-2 hover:bg-portal-surface2 rounded-lg transition-colors"
                >
                  <X className="w-5 h-5 text-portal-soft" />
                </button>
              </div>
            </div>

            {/* Modal Body - Scrollable */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {/* Task Details Grid */}
              <div className="grid grid-cols-2 gap-4">
                {/* Status - Clickable */}
                <div className="relative">
                  <label className="text-xs font-semibold text-portal-soft uppercase block mb-2">Status</label>
                  <button
                    onClick={() => { setShowStatusPicker(!showStatusPicker); setShowPriorityPicker(false); }}
                    disabled={isSaving}
                    className="w-full py-2.5 px-3 text-sm font-bold text-white rounded-lg shadow-lg shadow-black/20 hover:opacity-90 transition-opacity flex items-center gap-2 disabled:opacity-50"
                    style={{ backgroundColor: selectedTask.boardData.statusDefs.find(s => s.id === selectedTask.status)?.color || '#94a3b8' }}
                  >
                    <div className="w-3 h-3 rounded-full bg-portal-surface/30"></div>
                    {selectedTask.boardData.statusDefs.find(s => s.id === selectedTask.status)?.label || selectedTask.status}
                  </button>
                  {showStatusPicker && (
                    <div className="absolute top-full left-0 mt-2 w-full bg-portal-surface rounded-lg shadow-xl border border-white/[0.07] z-10 overflow-hidden">
                      {selectedTask.boardData.statusDefs.map(def => (
                        <button
                          key={def.id}
                          onClick={() => {
                            updateTaskInBoard(selectedTask, 'status', def.id);
                            setShowStatusPicker(false);
                          }}
                          className="w-full text-left px-3 py-2 text-sm font-medium hover:bg-portal-dark flex items-center gap-2"
                        >
                          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: def.color }}></div>
                          {def.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Priority - Clickable */}
                <div className="relative">
                  <label className="text-xs font-semibold text-portal-soft uppercase block mb-2">Priority</label>
                  <button
                    onClick={() => { setShowPriorityPicker(!showPriorityPicker); setShowStatusPicker(false); }}
                    disabled={isSaving}
                    className="w-full py-2.5 px-3 text-sm font-bold text-white rounded-lg shadow-lg shadow-black/20 hover:opacity-90 transition-opacity flex items-center gap-2 disabled:opacity-50"
                    style={{ backgroundColor: selectedTask.boardData.priorityDefs.find(p => p.id === selectedTask.priority)?.color || '#94a3b8' }}
                  >
                    <div className="w-3 h-3 rounded-full bg-portal-surface/30"></div>
                    {selectedTask.boardData.priorityDefs.find(p => p.id === selectedTask.priority)?.label || selectedTask.priority}
                  </button>
                  {showPriorityPicker && (
                    <div className="absolute top-full left-0 mt-2 w-full bg-portal-surface rounded-lg shadow-xl border border-white/[0.07] z-10 overflow-hidden">
                      {selectedTask.boardData.priorityDefs.map(def => (
                        <button
                          key={def.id}
                          onClick={() => {
                            updateTaskInBoard(selectedTask, 'priority', def.id);
                            setShowPriorityPicker(false);
                          }}
                          className="w-full text-left px-3 py-2 text-sm font-medium hover:bg-portal-dark flex items-center gap-2"
                        >
                          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: def.color }}></div>
                          {def.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Due Date - Editable */}
                <div>
                  <label className="text-xs font-semibold text-portal-soft uppercase block mb-2">Due Date</label>
                  <input
                    type="date"
                    value={selectedTask.dueDate || ''}
                    onChange={(e) => {
                      console.log('[MyWork] Updating due date:', e.target.value);
                      updateTaskInBoard(selectedTask, 'dueDate', e.target.value);
                    }}
                    disabled={isSaving}
                    className="w-full p-2.5 text-sm text-portal-text font-medium bg-portal-dark border border-white/[0.07] rounded-lg outline-none hover:border-brand-500 focus:border-brand-500 focus:ring-1 focus:ring-brand-500 cursor-pointer disabled:opacity-50"
                  />
                </div>

                {/* Assigned To - Display only */}
                <div>
                  <label className="text-xs font-semibold text-portal-soft uppercase block mb-2">Assigned To</label>
                  <div className="flex flex-wrap items-center gap-2 min-h-[2.75rem] p-2 bg-portal-dark border border-white/[0.07] rounded-lg">
                    {(() => {
                      const assignedIds = Array.isArray(selectedTask.assignedTo)
                        ? selectedTask.assignedTo
                        : selectedTask.assignedTo ? [selectedTask.assignedTo] : [];

                      if (assignedIds.length === 0) {
                        return <span className="text-sm text-portal-soft">Unassigned</span>;
                      }

                      return assignedIds.map(userId => {
                        const profile = teamProfiles.find(p => p.id === userId);
                        const userName = profile?.full_name || profile?.email || 'Unknown User';
                        return (
                          <div key={userId} className="flex items-center gap-1.5 bg-portal-surface px-2 py-1 rounded-md border border-white/[0.07]">
                            {profile?.avatar_url ? (
                              <img src={profile.avatar_url} alt="" className="w-5 h-5 rounded-full object-cover" />
                            ) : (
                              <div className="w-5 h-5 rounded-full bg-brand-100 flex items-center justify-center text-[10px] font-bold text-brand-700">
                                {userName.charAt(0).toUpperCase()}
                              </div>
                            )}
                            <span className="text-xs font-medium text-portal-text">{userName}</span>
                          </div>
                        );
                      });
                    })()}
                  </div>
                </div>
              </div>

              {/* Comments Section */}
              <div className="border-t border-white/[0.07] pt-6">
                <div className="flex items-center gap-2 mb-4">
                  <MessageCircle className="w-5 h-5 text-portal-soft" />
                  <h4 className="font-bold text-white">Comments</h4>
                  <span className="text-xs text-portal-soft">({selectedTask.comments?.length || 0})</span>
                </div>

                {/* Comments List */}
                <div className="space-y-3 mb-4 max-h-48 overflow-y-auto">
                  {selectedTask.comments && selectedTask.comments.length > 0 ? (
                    selectedTask.comments.map(comment => (
                      <div key={comment.id} className="flex gap-3 p-3 bg-portal-dark rounded-lg">
                        {comment.avatar ? (
                          <img src={comment.avatar} alt="" className="w-8 h-8 rounded-full object-cover flex-shrink-0" />
                        ) : (
                          <div className="w-8 h-8 rounded-full bg-brand-100 flex items-center justify-center text-xs font-bold text-brand-700 flex-shrink-0">
                            {comment.author.charAt(0).toUpperCase()}
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-sm font-bold text-white">{comment.author}</span>
                            <span className="text-xs text-portal-soft">
                              {new Date(comment.timestamp).toLocaleString('en-US', {
                                month: 'short',
                                day: 'numeric',
                                hour: 'numeric',
                                minute: '2-digit'
                              })}
                            </span>
                          </div>
                          <p className="text-sm text-portal-text whitespace-pre-wrap break-words">{comment.text}</p>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="text-center py-6 text-portal-soft text-sm">
                      No comments yet. Be the first to comment!
                    </div>
                  )}
                </div>

                {/* Add Comment */}
                <div className="flex gap-2">
                  <div className="flex-shrink-0">
                    {currentUser.avatarUrl ? (
                      <img src={currentUser.avatarUrl} alt="" className="w-8 h-8 rounded-full object-cover" />
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-brand-600 flex items-center justify-center text-xs font-bold text-white">
                        {currentUser.initials}
                      </div>
                    )}
                  </div>
                  <div className="flex-1 flex gap-2 relative">
                    <input
                      ref={commentInputRef}
                      type="text"
                      value={newComment}
                      onChange={(e) => {
                        const value = e.target.value;
                        setNewComment(value);

                        // Check for @ mentions
                        const cursorPos = e.target.selectionStart || value.length;
                        const textBeforeCursor = value.substring(0, cursorPos);
                        const lastAtIndex = textBeforeCursor.lastIndexOf('@');

                        if (lastAtIndex !== -1 && cursorPos > lastAtIndex) {
                          const searchText = textBeforeCursor.substring(lastAtIndex + 1);
                          const charBeforeAt = lastAtIndex > 0 ? textBeforeCursor[lastAtIndex - 1] : ' ';
                          // Only show if @ is at start or after space
                          if (charBeforeAt === ' ' || lastAtIndex === 0) {
                            setMentionDropdown({ show: true, search: searchText.toLowerCase(), position: cursorPos });
                          } else {
                            setMentionDropdown(null);
                          }
                        } else {
                          setMentionDropdown(null);
                        }
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Escape') {
                          setMentionDropdown(null);
                        }
                      }}
                      onKeyPress={(e) => e.key === 'Enter' && handleAddComment()}
                      placeholder="Add a comment... (Use @name to mention)"
                      disabled={isSaving}
                      className="flex-1 p-2.5 border border-white/[0.07] rounded-lg outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 text-sm disabled:opacity-50"
                    />

                    {/* Mention Dropdown */}
                    {mentionDropdown?.show && (
                      <div className="absolute bottom-full left-0 mb-2 w-64 bg-portal-surface rounded-lg shadow-xl border border-white/[0.07] overflow-hidden z-[100]">
                        <div className="p-2 bg-portal-dark border-b border-white/[0.07]">
                          <p className="text-xs font-bold text-portal-soft uppercase">Mention Someone</p>
                        </div>
                        <div className="max-h-48 overflow-y-auto">
                          {/* @everyone option */}
                          {(!mentionDropdown.search || 'everyone'.includes(mentionDropdown.search)) && (
                            <button
                              onClick={() => handleSelectMention('everyone')}
                              className="w-full text-left px-3 py-2 hover:bg-brand-50 transition-colors flex items-center gap-2 text-sm"
                            >
                              <div className="w-8 h-8 rounded-full bg-brand-600 flex items-center justify-center text-white font-bold text-xs">
                                ALL
                              </div>
                              <div>
                                <p className="font-medium text-white">@everyone</p>
                                <p className="text-xs text-portal-soft">Notify all team members</p>
                              </div>
                            </button>
                          )}

                          {/* Team members */}
                          {teamProfiles
                            .filter(profile => {
                              if (!mentionDropdown.search) return true;
                              const name = (profile.full_name || '').toLowerCase();
                              return name.includes(mentionDropdown.search);
                            })
                            .map(profile => (
                              <button
                                key={profile.id}
                                onClick={() => handleSelectMention(profile.full_name?.split(' ')[0] || 'User')}
                                className="w-full text-left px-3 py-2 hover:bg-brand-50 transition-colors flex items-center gap-2 text-sm"
                              >
                                {profile.avatar_url ? (
                                  <img src={profile.avatar_url} alt="" className="w-8 h-8 rounded-full object-cover" />
                                ) : (
                                  <div className="w-8 h-8 rounded-full bg-brand-100 flex items-center justify-center text-brand-700 font-bold text-xs">
                                    {profile.full_name?.charAt(0) || '?'}
                                  </div>
                                )}
                                <div>
                                  <p className="font-medium text-white">{profile.full_name || 'Unknown'}</p>
                                  <p className="text-xs text-portal-soft">@{profile.full_name?.split(' ')[0] || 'user'}</p>
                                </div>
                              </button>
                            ))}
                        </div>
                      </div>
                    )}

                    <button
                      onClick={handleAddComment}
                      disabled={!newComment.trim() || isSaving}
                      className="px-4 py-2.5 bg-brand-600 hover:bg-brand-700 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <Send className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>

              {/* Open in Project Tasks button */}
              <div className="pt-4 border-t border-white/[0.07]">
                <button
                  onClick={() => {
                    localStorage.setItem('openTaskModal', JSON.stringify({
                      taskId: selectedTask.id,
                      boardId: selectedTask.clientId,
                      groupId: selectedTask.groupId
                    }));
                    setIsTaskModalOpen(false);
                    if (onNavigateToTasks) {
                      onNavigateToTasks();
                    }
                  }}
                  className="w-full py-2.5 px-4 bg-portal-surface2 hover:bg-portal-surface2 text-portal-text rounded-lg font-medium transition-colors text-sm"
                >
                  Open in Project Tasks for More Options
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MyWork;
