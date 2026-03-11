import React, { useState, useEffect, useRef } from 'react';
import { X, Plus, Check, Trash2, ChevronDown, Loader2, ListTodo, ArrowRight } from 'lucide-react';
import { supabase } from '../lib/supabaseClient';
import { ClientBoard, User, ToastType } from '../types';
import { fetchClientBoards, saveClientBoard } from '../services/databaseService';
import { assignTaskToPartner } from '../services/clientPortalService';

export interface ChatTodo {
  id: string;
  text: string;
  client_board_id: string | null;
  client_board_name: string | null;
  created_by: string;
  created_by_name: string;
  assigned_to: string | null;
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
  const [selectedBoardId, setSelectedBoardId] = useState<string>('');
  const [clientBoards, setClientBoards] = useState<ClientBoard[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [filter, setFilter] = useState<'active' | 'completed'>('active');
  const [completingIds, setCompletingIds] = useState<Set<string>>(new Set());
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadTodos();
    loadClientBoards();

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
    }
  };

  const addTodo = async () => {
    const text = newTodoText.trim();
    if (!text) return;

    const board = clientBoards.find(b => b.id === selectedBoardId);

    setAdding(true);
    const { error } = await supabase
      .from('chat_todos')
      .insert({
        text,
        client_board_id: selectedBoardId || null,
        client_board_name: board?.name || null,
        created_by: currentUser.id,
        created_by_name: currentUser.name,
        is_completed: false,
      });

    if (error) {
      console.error('[ChatTodoList] Error adding todo:', error.message);
      addToast('error', 'Failed to add reminder');
    } else {
      setNewTodoText('');
      addToast('success', 'Reminder added');
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

    // 2. Create task in the client's board if a board was selected
    if (todo.client_board_id) {
      await createTaskInClientBoard(todo);
    }

    setCompletingIds(prev => { const s = new Set(prev); s.delete(todo.id); return s; });
    addToast('success', `Reminder completed${todo.client_board_id ? ' & added to client tasks' : ''}`);
  };

  const createTaskInClientBoard = async (todo: ChatTodo) => {
    try {
      const boards = await fetchClientBoards();
      const board = boards.find(b => b.id === todo.client_board_id);
      if (!board) {
        console.error('[ChatTodoList] Board not found:', todo.client_board_id);
        return;
      }

      // Find the first group or create a "From Reminders" group
      let targetGroup = board.groups.find(g => g.title.toLowerCase().includes('reminder') || g.title.toLowerCase().includes('todo'));
      if (!targetGroup) {
        targetGroup = board.groups[0]; // Use first group as fallback
      }
      if (!targetGroup) {
        // Create a new group if board is empty
        targetGroup = {
          id: `grp-${Date.now()}`,
          title: 'From Reminders',
          color: '#8B5CF6',
          tasks: [],
        };
        board.groups.push(targetGroup);
      }

      const newTaskId = `task-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      const defaultStatus = board.statusDefs?.[0]?.label || 'Not Started';
      const defaultPriority = board.priorityDefs?.[0]?.label || 'Medium';

      const newTask = {
        id: newTaskId,
        title: todo.text,
        description: `Created from chat reminder by ${todo.created_by_name}`,
        status: defaultStatus,
        priority: defaultPriority,
        dueDate: '',
        assignedTo: todo.assigned_to ? [todo.assigned_to] : [],
        comments: [],
      };

      targetGroup.tasks.push(newTask);
      await saveClientBoard(board);

    } catch (err) {
      console.error('[ChatTodoList] Error creating task in board:', err);
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
          {/* Client board selector */}
          <div className="flex items-center gap-2">
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
