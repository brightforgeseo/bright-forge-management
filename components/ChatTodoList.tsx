import React, { useState, useEffect, useRef } from 'react';
import { X, Plus, Check, Trash2, ChevronDown, Loader2, ListTodo, ArrowRight, FileText, ChevronUp, FolderOpen, UserCircle } from 'lucide-react';
import { supabase } from '../lib/supabaseClient';
import { ClientBoard, TaskGroup, User, ToastType, Profile } from '../types';
import { fetchClientBoards, fetchProfiles } from '../services/databaseService';

export interface ChatTodo {
  id: string;
  text: string;
  client_board_id: string | null;
  client_board_name: string | null;
  group_id: string | null;
  group_name: string | null;
  created_by: string;
  created_by_name: string;
  assigned_to: string | null;
  assigned_to_name: string | null;
  notes: string | null;
  board_task_id: string | null; // ID of the task created in the client board
  is_completed: boolean;
  completed_at: string | null;
  completed_by: string | null;
  created_at: string;
}

interface ChatTodoListProps {
  currentUser: User;
  addToast: (type: ToastType, message: string) => void;
  onClose: () => void;
}

const ChatTodoList: React.FC<ChatTodoListProps> = ({ currentUser, addToast, onClose }) => {
  const [todos, setTodos] = useState<ChatTodo[]>([]);
  const [newTodoText, setNewTodoText] = useState('');
  const [newTodoNotes, setNewTodoNotes] = useState('');
  const [showNotesInput, setShowNotesInput] = useState(false);
  const [selectedBoardId, setSelectedBoardId] = useState<string>('');
  const [selectedGroupId, setSelectedGroupId] = useState<string>('');
  const [selectedAssignee, setSelectedAssignee] = useState<string>('');
  const [clientBoards, setClientBoards] = useState<ClientBoard[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [filter, setFilter] = useState<'active' | 'completed'>('active');
  const [completingIds, setCompletingIds] = useState<Set<string>>(new Set());
  const [expandedNotes, setExpandedNotes] = useState<Set<string>>(new Set());
  const inputRef = useRef<HTMLInputElement>(null);

  // Get the groups for the currently selected board
  const selectedBoard = clientBoards.find(b => b.id === selectedBoardId);
  const availableGroups: TaskGroup[] = selectedBoard?.groups || [];

  useEffect(() => {
    loadTodos();
    loadClientBoards();
    loadProfiles();

    // Subscribe to realtime changes
    const channel = supabase
      .channel('public:chat_todos')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'chat_todos' },
        () => {
          loadTodos();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  useEffect(() => {
    if (!loading) {
      inputRef.current?.focus();
    }
  }, [loading]);

  // When selected board changes, auto-select the first group
  useEffect(() => {
    if (selectedBoard && selectedBoard.groups.length > 0) {
      setSelectedGroupId(selectedBoard.groups[0].id);
    } else {
      setSelectedGroupId('');
    }
  }, [selectedBoardId]);

  const loadTodos = async () => {
    const { data, error } = await supabase
      .from('chat_todos')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[ChatTodoList] Error loading todos:', error.message);
      return;
    }
    setTodos(data || []);
    setLoading(false);
  };

  const loadClientBoards = async () => {
    const boards = await fetchClientBoards();
    setClientBoards(boards);
    if (boards.length > 0 && !selectedBoardId) {
      setSelectedBoardId(boards[0].id);
      if (boards[0].groups.length > 0) {
        setSelectedGroupId(boards[0].groups[0].id);
      }
    }
  };

  const loadProfiles = async () => {
    const p = await fetchProfiles();
    setProfiles(p);
  };

  const addTodo = async () => {
    const text = newTodoText.trim();
    if (!text) return;

    const board = clientBoards.find(b => b.id === selectedBoardId);
    const group = board?.groups.find(g => g.id === selectedGroupId);
    const assignee = profiles.find(p => p.id === selectedAssignee);

    setAdding(true);

    // 1. If a client board is selected, create the task in the board immediately
    let boardTaskId: string | null = null;
    if (selectedBoardId) {
      boardTaskId = await createTaskInClientBoard({
        text,
        notes: newTodoNotes.trim() || null,
        client_board_id: selectedBoardId,
        group_id: selectedGroupId || null,
        assigned_to: selectedAssignee || null,
        created_by_name: currentUser.name,
      });
    }

    // 2. Save the reminder in chat_todos
    const { error } = await supabase
      .from('chat_todos')
      .insert({
        text,
        notes: newTodoNotes.trim() || null,
        client_board_id: selectedBoardId || null,
        client_board_name: board?.name || null,
        group_id: selectedGroupId || null,
        group_name: group?.title || null,
        created_by: currentUser.id,
        created_by_name: currentUser.name,
        assigned_to: selectedAssignee || null,
        assigned_to_name: assignee?.full_name || null,
        board_task_id: boardTaskId,
        is_completed: false,
      });

    if (error) {
      console.error('[ChatTodoList] Error adding todo:', error.message);
      addToast('error', 'Failed to add reminder');
    } else {
      setNewTodoText('');
      setNewTodoNotes('');
      setShowNotesInput(false);
      addToast('success', boardTaskId ? 'Reminder added & task created in client board' : 'Reminder added');
    }
    setAdding(false);
  };

  const completeTodo = async (todo: ChatTodo) => {
    setCompletingIds(prev => new Set(prev).add(todo.id));

    // 1. Mark as completed in chat_todos
    const { error } = await supabase
      .from('chat_todos')
      .update({
        is_completed: true,
        completed_at: new Date().toISOString(),
        completed_by: currentUser.id,
      })
      .eq('id', todo.id);

    if (error) {
      console.error('[ChatTodoList] Error completing todo:', error.message);
      addToast('error', 'Failed to complete reminder');
      setCompletingIds(prev => { const s = new Set(prev); s.delete(todo.id); return s; });
      return;
    }

    // 2. Update the task status to "Done"/"Completed" in the client board
    if (todo.client_board_id && todo.board_task_id) {
      await markTaskAsDone(todo);
    }

    setCompletingIds(prev => { const s = new Set(prev); s.delete(todo.id); return s; });
    addToast('success', `Reminder completed${todo.board_task_id ? ' & task marked as done' : ''}`);
  };

  const createTaskInClientBoard = async (todoData: {
    text: string;
    notes: string | null;
    client_board_id: string;
    group_id: string | null;
    assigned_to: string | null;
    created_by_name: string;
  }): Promise<string | null> => {
    try {
      // Fetch the raw DB row directly
      const { data: rows, error: fetchError } = await supabase
        .from('client_boards')
        .select('*')
        .order('created_at', { ascending: true });

      if (fetchError || !rows) {
        console.error('[ChatTodoList] Error fetching boards:', fetchError?.message);
        addToast('error', 'Failed to fetch client boards');
        return null;
      }

      // Find the matching row by board_data.id
      const row = rows.find((r: any) => r.board_data?.id === todoData.client_board_id);
      if (!row) {
        console.error('[ChatTodoList] Board row not found for:', todoData.client_board_id);
        addToast('error', 'Client board not found');
        return null;
      }

      // Deep clone to avoid reference issues
      const boardData = JSON.parse(JSON.stringify(row.board_data)) as ClientBoard;

      // Find the target group by group_id
      let targetGroupIndex = -1;
      if (todoData.group_id) {
        targetGroupIndex = boardData.groups.findIndex(g => g.id === todoData.group_id);
      }
      if (targetGroupIndex === -1 && boardData.groups.length > 0) {
        targetGroupIndex = 0;
      }
      if (targetGroupIndex === -1) {
        boardData.groups = boardData.groups || [];
        boardData.groups.push({
          id: `grp-${Date.now()}`,
          title: 'From Reminders',
          color: '#8B5CF6',
          tasks: [],
        });
        targetGroupIndex = boardData.groups.length - 1;
      }

      const newTaskId = `task-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;

      // Hardcode status to "Working on it"
      const defaultStatus = 'Working on it';
      const defaultPriority = 'Medium';

      // DEBUG: Remove this alert after confirming the right code is running
      alert('Creating task with status: ' + defaultStatus + ' | priority: ' + defaultPriority);

      const description = todoData.notes
        ? `${todoData.notes}\n\n— Created from chat reminder by ${todoData.created_by_name}`
        : `Created from chat reminder by ${todoData.created_by_name}`;

      const newTask = {
        id: newTaskId,
        title: todoData.text,
        description,
        status: defaultStatus,
        priority: defaultPriority,
        dueDate: '',
        assignedTo: todoData.assigned_to ? [todoData.assigned_to] : [],
        comments: [],
      };

      boardData.groups[targetGroupIndex].tasks.push(newTask);

      // Save directly using the row's primary key
      const { error: updateError } = await supabase
        .from('client_boards')
        .update({ board_data: boardData, updated_at: new Date().toISOString() })
        .eq('id', row.id)
        .select();

      if (updateError) {
        console.error('[ChatTodoList] Error saving board:', updateError.message);
        addToast('error', 'Failed to add task to client board');
        return null;
      }

      console.log('[ChatTodoList] Task created in', boardData.groups[targetGroupIndex].title);
      return newTaskId;

    } catch (err) {
      console.error('[ChatTodoList] Error creating task in board:', err);
      addToast('error', 'Unexpected error adding task to board');
      return null;
    }
  };

  // When a reminder is ticked off, find the task in the board and set status to done
  const markTaskAsDone = async (todo: ChatTodo) => {
    try {
      const { data: rows, error: fetchError } = await supabase
        .from('client_boards')
        .select('*')
        .order('created_at', { ascending: true });

      if (fetchError || !rows) return;

      const row = rows.find((r: any) => r.board_data?.id === todo.client_board_id);
      if (!row) return;

      const boardData = JSON.parse(JSON.stringify(row.board_data)) as ClientBoard;

      // Find the last status def (usually "Done" or "Completed")
      const doneStatus = boardData.statusDefs?.find(s =>
        s.label.toLowerCase().includes('done') ||
        s.label.toLowerCase().includes('complete')
      ) || boardData.statusDefs?.[boardData.statusDefs.length - 1];

      // Find the task by board_task_id and update its status
      let found = false;
      for (const group of boardData.groups) {
        const task = group.tasks.find(t => t.id === todo.board_task_id);
        if (task) {
          task.status = doneStatus?.label || 'Done';
          found = true;
          break;
        }
      }

      if (!found) return;

      await supabase
        .from('client_boards')
        .update({ board_data: boardData, updated_at: new Date().toISOString() })
        .eq('id', row.id);

    } catch (err) {
      console.error('[ChatTodoList] Error marking task as done:', err);
    }
  };

  const deleteTodo = async (id: string) => {
    const { error } = await supabase
      .from('chat_todos')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('[ChatTodoList] Error deleting todo:', error.message);
      addToast('error', 'Failed to delete reminder');
    }
  };

  const uncompleteTodo = async (id: string) => {
    const { error } = await supabase
      .from('chat_todos')
      .update({
        is_completed: false,
        completed_at: null,
        completed_by: null,
      })
      .eq('id', id);

    if (error) {
      addToast('error', 'Failed to undo');
    }
  };

  const filteredTodos = todos.filter(t => filter === 'active' ? !t.is_completed : t.is_completed);
  const activeCount = todos.filter(t => !t.is_completed).length;
  const completedCount = todos.filter(t => t.is_completed).length;

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 7) return `${diffDays}d ago`;
    return d.toLocaleDateString();
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[80vh] flex flex-col overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 bg-gradient-to-r from-violet-500 to-purple-600">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-white/20 rounded-xl flex items-center justify-center">
              <ListTodo className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">Team Reminders</h2>
              <p className="text-xs text-white/70">{activeCount} active, {completedCount} done</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-white/20 rounded-lg transition-colors">
            <X className="w-5 h-5 text-white" />
          </button>
        </div>

        {/* Add new todo */}
        <div className="px-5 py-3 border-b border-slate-100 bg-slate-50">
          <div className="flex gap-2 mb-2">
            <input
              ref={inputRef}
              type="text"
              value={newTodoText}
              onChange={e => setNewTodoText(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !adding) addTodo(); }}
              placeholder="Add a reminder..."
              className="flex-1 px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-300 focus:border-violet-400"
            />
            <button
              onClick={addTodo}
              disabled={!newTodoText.trim() || adding}
              className="px-3 py-2 bg-violet-600 text-white rounded-lg hover:bg-violet-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-1 text-sm font-medium"
            >
              {adding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              Add
            </button>
          </div>
          {/* Notes toggle + textarea */}
          <div className="flex items-center gap-2 mb-2">
            <button
              onClick={() => setShowNotesInput(!showNotesInput)}
              className={`flex items-center gap-1 px-2 py-1 text-xs rounded-lg transition-colors ${
                showNotesInput ? 'bg-violet-100 text-violet-700' : 'text-slate-500 hover:bg-slate-200'
              }`}
            >
              <FileText className="w-3 h-3" />
              {showNotesInput ? 'Hide notes' : 'Add notes'}
            </button>
          </div>
          {showNotesInput && (
            <textarea
              value={newTodoNotes}
              onChange={e => setNewTodoNotes(e.target.value)}
              placeholder="Add notes (will become the task description)..."
              rows={3}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-300 focus:border-violet-400 resize-none mb-2"
            />
          )}
          {/* Client board selector */}
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xs text-slate-500 whitespace-nowrap">Client:</span>
            <select
              value={selectedBoardId}
              onChange={e => setSelectedBoardId(e.target.value)}
              className="flex-1 px-2 py-1 text-xs border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-violet-300"
            >
              <option value="">No client (general reminder)</option>
              {clientBoards.map(board => (
                <option key={board.id} value={board.id}>{board.name}</option>
              ))}
            </select>
          </div>
          {/* Assign to member */}
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xs text-slate-500 whitespace-nowrap">Assign to:</span>
            <select
              value={selectedAssignee}
              onChange={e => setSelectedAssignee(e.target.value)}
              className="flex-1 px-2 py-1 text-xs border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-violet-300"
            >
              <option value="">No one (general)</option>
              {profiles.map(p => (
                <option key={p.id} value={p.id}>{p.full_name || p.email || 'Unknown'}</option>
              ))}
            </select>
          </div>
          {/* Category/Group selector - only show when a client is selected */}
          {selectedBoardId && availableGroups.length > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500 whitespace-nowrap">Category:</span>
              <select
                value={selectedGroupId}
                onChange={e => setSelectedGroupId(e.target.value)}
                className="flex-1 px-2 py-1 text-xs border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-violet-300"
              >
                {availableGroups.map(group => (
                  <option key={group.id} value={group.id}>
                    {group.title}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* Filter tabs */}
        <div className="flex border-b border-slate-200">
          <button
            onClick={() => setFilter('active')}
            className={`flex-1 px-4 py-2.5 text-sm font-medium transition-colors ${
              filter === 'active'
                ? 'text-violet-600 border-b-2 border-violet-600 bg-violet-50/50'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            Active ({activeCount})
          </button>
          <button
            onClick={() => setFilter('completed')}
            className={`flex-1 px-4 py-2.5 text-sm font-medium transition-colors ${
              filter === 'completed'
                ? 'text-green-600 border-b-2 border-green-600 bg-green-50/50'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            Completed ({completedCount})
          </button>
        </div>

        {/* Todo list */}
        <div className="flex-1 overflow-y-auto px-5 py-3 space-y-2">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 text-violet-500 animate-spin" />
            </div>
          ) : filteredTodos.length === 0 ? (
            <div className="text-center py-12">
              <ListTodo className="w-10 h-10 text-slate-300 mx-auto mb-3" />
              <p className="text-sm text-slate-400">
                {filter === 'active' ? 'No active reminders' : 'No completed reminders yet'}
              </p>
            </div>
          ) : (
            filteredTodos.map(todo => (
              <div
                key={todo.id}
                className={`group flex items-start gap-3 p-3 rounded-xl border transition-all ${
                  todo.is_completed
                    ? 'bg-green-50/50 border-green-200'
                    : 'bg-white border-slate-200 hover:border-violet-300 hover:shadow-sm'
                }`}
              >
                {/* Checkbox */}
                <button
                  onClick={() => todo.is_completed ? uncompleteTodo(todo.id) : completeTodo(todo)}
                  disabled={completingIds.has(todo.id)}
                  className={`flex-shrink-0 w-5 h-5 mt-0.5 rounded-full border-2 flex items-center justify-center transition-all ${
                    completingIds.has(todo.id)
                      ? 'border-violet-300 bg-violet-100'
                      : todo.is_completed
                      ? 'border-green-500 bg-green-500 hover:bg-green-600'
                      : 'border-slate-300 hover:border-violet-500'
                  }`}
                >
                  {completingIds.has(todo.id) ? (
                    <Loader2 className="w-3 h-3 text-violet-500 animate-spin" />
                  ) : todo.is_completed ? (
                    <Check className="w-3 h-3 text-white" />
                  ) : null}
                </button>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <p className={`text-sm ${todo.is_completed ? 'text-slate-400 line-through' : 'text-slate-800'}`}>
                    {todo.text}
                  </p>
                  {todo.notes && (
                    <div className="mt-1">
                      <button
                        onClick={() => setExpandedNotes(prev => {
                          const next = new Set(prev);
                          next.has(todo.id) ? next.delete(todo.id) : next.add(todo.id);
                          return next;
                        })}
                        className="flex items-center gap-1 text-[11px] text-violet-500 hover:text-violet-700 transition-colors"
                      >
                        <FileText className="w-3 h-3" />
                        {expandedNotes.has(todo.id) ? 'Hide notes' : 'View notes'}
                        {expandedNotes.has(todo.id) ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                      </button>
                      {expandedNotes.has(todo.id) && (
                        <p className="mt-1 text-xs text-slate-500 bg-slate-50 rounded-lg p-2 whitespace-pre-wrap">
                          {todo.notes}
                        </p>
                      )}
                    </div>
                  )}
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    <span className="text-[11px] text-slate-400">
                      {todo.created_by_name} · {formatDate(todo.created_at)}
                    </span>
                    {todo.client_board_name && (
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-violet-100 text-violet-700 rounded text-[11px] font-medium">
                        <ArrowRight className="w-3 h-3" />
                        {todo.client_board_name}
                      </span>
                    )}
                    {todo.group_name && (
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded text-[11px] font-medium">
                        <FolderOpen className="w-3 h-3" />
                        {todo.group_name}
                      </span>
                    )}
                    {todo.assigned_to_name && (
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded text-[11px] font-medium">
                        <UserCircle className="w-3 h-3" />
                        {todo.assigned_to_name}
                      </span>
                    )}
                    {todo.is_completed && todo.completed_at && (
                      <span className="text-[11px] text-green-500">
                        Done {formatDate(todo.completed_at)}
                      </span>
                    )}
                  </div>
                </div>

                {/* Delete */}
                <button
                  onClick={() => deleteTodo(todo.id)}
                  className="flex-shrink-0 p-1 text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all"
                  title="Delete"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

export default ChatTodoList;
