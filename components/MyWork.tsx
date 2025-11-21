import React, { useState, useEffect } from 'react';
import { Calendar, Table as TableIcon, CheckCircle2, AlertCircle, Clock, ChevronLeft, ChevronRight, Users, Filter } from 'lucide-react';
import { User, ToastType, Task, TaskGroup, ClientBoard, Profile } from '../types';
import { fetchClientBoards, fetchProfiles } from '../services/databaseService';

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
  const [selectedUserId, setSelectedUserId] = useState<string>(currentUser.id);

  // Task Modal State
  const [selectedTask, setSelectedTask] = useState<TaskWithContext | null>(null);
  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    const [boards, profiles] = await Promise.all([fetchClientBoards(), fetchProfiles()]);

    // Extract all tasks with context
    const tasks: TaskWithContext[] = [];
    boards.forEach(board => {
      board.groups.forEach(group => {
        group.tasks.forEach(task => {
          // Get all assigned user IDs
          const assignedIds = Array.isArray(task.assignedTo)
            ? task.assignedTo
            : task.assignedTo ? [task.assignedTo] : [];

          // Include task if ANY user is assigned (for filtering later)
          if (assignedIds.length > 0) {
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

  // Filter tasks by selected user
  const filteredTasks = allTasks.filter(task => {
    if (selectedUserId === 'all') return true;

    const assignedIds = Array.isArray(task.assignedTo)
      ? task.assignedTo
      : task.assignedTo ? [task.assignedTo] : [];

    return assignedIds.includes(selectedUserId);
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
        <div className="text-slate-400">Loading tasks...</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-4 lg:px-8 py-4 lg:py-6">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <h1 className="text-2xl lg:text-3xl font-bold text-slate-900">My Work</h1>
            <p className="text-sm text-slate-500 mt-1">
              {filteredTasks.length} task{filteredTasks.length !== 1 ? 's' : ''} assigned to {getSelectedUserName()}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* User Filter Dropdown */}
            <div className="relative">
              <select
                value={selectedUserId}
                onChange={(e) => setSelectedUserId(e.target.value)}
                className="appearance-none bg-white border border-slate-300 rounded-lg pl-10 pr-8 py-2.5 text-sm font-medium text-slate-700 hover:border-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent cursor-pointer"
              >
                <option value={currentUser.id}>My Tasks</option>
                <option value="all">All Team Tasks</option>
                <option disabled className="text-slate-400">───────────</option>
                {teamProfiles.map(profile => (
                  <option key={profile.id} value={profile.id}>
                    {profile.full_name || profile.email || 'Unknown'}
                  </option>
                ))}
              </select>
              <Users className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
              <ChevronRight className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none rotate-90" />
            </div>

            {/* View Toggle */}
            <div className="flex gap-2 bg-slate-100 p-1 rounded-lg">
              <button
                onClick={() => setViewMode('table')}
                className={`px-3 lg:px-4 py-2 rounded-md font-medium text-sm transition-all flex items-center gap-2 ${
                  viewMode === 'table' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <TableIcon className="w-4 h-4" />
                <span className="hidden sm:inline">Table</span>
              </button>
              <button
                onClick={() => setViewMode('calendar')}
                className={`px-3 lg:px-4 py-2 rounded-md font-medium text-sm transition-all flex items-center gap-2 ${
                  viewMode === 'calendar' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
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
      <div className="flex-1 overflow-auto p-4 lg:p-8">
        {viewMode === 'table' ? (
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="text-left py-3 px-4 lg:px-6 text-xs font-semibold text-slate-500 uppercase">Task</th>
                    <th className="text-left py-3 px-4 text-xs font-semibold text-slate-500 uppercase w-32 lg:w-48">Group</th>
                    <th className="text-left py-3 px-4 text-xs font-semibold text-slate-500 uppercase w-32 lg:w-48">Board</th>
                    <th className="text-center py-3 px-4 text-xs font-semibold text-slate-500 uppercase w-24 lg:w-32">Date</th>
                    <th className="text-center py-3 px-4 text-xs font-semibold text-slate-500 uppercase w-24 lg:w-32">Status</th>
                    <th className="text-center py-3 px-4 text-xs font-semibold text-slate-500 uppercase w-24 lg:w-32">Priority</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredTasks.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-12 text-center text-slate-400">
                        <CheckCircle2 className="w-12 h-12 mx-auto mb-3 opacity-20" />
                        <p>No tasks found</p>
                      </td>
                    </tr>
                  ) : (
                    filteredTasks
                      .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime())
                      .map(task => {
                        const status = getTaskStatus(task.dueDate);
                        return (
                          <tr
                            key={`${task.clientId}-${task.groupId}-${task.id}`}
                            className="hover:bg-slate-50 transition-colors cursor-pointer"
                            onClick={() => handleTaskClick(task)}
                          >
                            <td className="py-3 px-4 lg:px-6">
                              <div className="flex items-center gap-3">
                                <div className="w-1 h-8 rounded-full flex-shrink-0" style={{ backgroundColor: task.groupColor }}></div>
                                <span className="text-sm font-medium text-slate-700 truncate">{task.title}</span>
                              </div>
                            </td>
                            <td className="py-3 px-4">
                              <span className="text-sm text-slate-600 truncate block">{task.groupTitle}</span>
                            </td>
                            <td className="py-3 px-4">
                              <span className="text-sm text-slate-600 truncate block">{task.clientName}</span>
                            </td>
                            <td className="py-3 px-4 text-center">
                              <span className={`text-sm font-medium whitespace-nowrap ${
                                status === 'overdue' ? 'text-red-600' :
                                status === 'today' ? 'text-blue-600' :
                                status === 'upcoming' ? 'text-green-600' :
                                'text-slate-500'
                              }`}>
                                {new Date(task.dueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                              </span>
                            </td>
                            <td className="py-3 px-4 text-center">
                              <span className={`inline-block px-2 py-1 text-xs font-semibold rounded whitespace-nowrap ${
                                status === 'overdue' ? 'bg-red-100 text-red-700' :
                                status === 'today' ? 'bg-blue-100 text-blue-700' :
                                status === 'upcoming' ? 'bg-green-100 text-green-700' :
                                'bg-slate-100 text-slate-600'
                              }`}>
                                {status === 'overdue' ? 'Overdue' :
                                 status === 'today' ? 'Today' :
                                 status === 'upcoming' ? 'This Week' :
                                 'Future'}
                              </span>
                            </td>
                            <td className="py-3 px-4 text-center">
                              <span className="text-xs text-slate-500">{task.priority}</span>
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
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            {/* Calendar Header */}
            <div className="flex items-center justify-between p-4 lg:p-6 border-b border-slate-200">
              <h2 className="text-lg lg:text-xl font-bold text-slate-900">
                {monthNames[currentDate.getMonth()]} {currentDate.getFullYear()}
              </h2>
              <div className="flex gap-2">
                <button
                  onClick={prevMonth}
                  className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
                >
                  <ChevronLeft className="w-5 h-5 text-slate-600" />
                </button>
                <button
                  onClick={nextMonth}
                  className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
                >
                  <ChevronRight className="w-5 h-5 text-slate-600" />
                </button>
              </div>
            </div>

            {/* Calendar Grid */}
            <div className="p-2 lg:p-4">
              <div className="grid grid-cols-7 gap-1 lg:gap-2">
                {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
                  <div key={day} className="text-center py-2 text-xs font-semibold text-slate-500 uppercase">
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
                        isToday ? 'border-brand-500 bg-brand-50' : 'border-slate-200 hover:border-slate-300'
                      } transition-colors`}
                    >
                      <div className={`text-xs lg:text-sm font-semibold mb-1 ${
                        isToday ? 'text-brand-700' : 'text-slate-700'
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
                          <div className="text-[9px] lg:text-[10px] text-slate-500 px-1">
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

      {/* Task Modal - Simple view-only modal */}
      {isTaskModalOpen && selectedTask && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setIsTaskModalOpen(false)}>
          <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="p-6 border-b border-slate-200">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="w-1 h-8 rounded-full" style={{ backgroundColor: selectedTask.groupColor }}></div>
                    <h2 className="text-2xl font-bold text-slate-900">{selectedTask.title}</h2>
                  </div>
                  <p className="text-sm text-slate-500">{selectedTask.clientName} → {selectedTask.groupTitle}</p>
                </div>
                <button
                  onClick={() => setIsTaskModalOpen(false)}
                  className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
                >
                  <svg className="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-semibold text-slate-500 uppercase block mb-1">Due Date</label>
                  <p className="text-sm text-slate-700">{new Date(selectedTask.dueDate).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</p>
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-500 uppercase block mb-1">Status</label>
                  <p className="text-sm text-slate-700">{selectedTask.status}</p>
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-500 uppercase block mb-1">Priority</label>
                  <p className="text-sm text-slate-700">{selectedTask.priority}</p>
                </div>
              </div>

              <div className="pt-4 border-t border-slate-200">
                <button
                  onClick={() => {
                    // Navigate to Project Tasks and open the full modal
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
                  className="w-full py-2 px-4 bg-brand-600 hover:bg-brand-700 text-white rounded-lg font-medium transition-colors"
                >
                  Open Full Details in Project Tasks
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
