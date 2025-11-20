
import React, { useState, useEffect } from 'react';
import { Calendar, Table as TableIcon, CheckCircle2, AlertCircle, Clock, ChevronLeft, ChevronRight } from 'lucide-react';
import { User, ToastType, Task, TaskGroup, ClientBoard } from '../types';
import { fetchClientBoards } from '../services/databaseService';

interface MyWorkProps {
  currentUser: User;
  addToast: (type: ToastType, message: string) => void;
}

interface TaskWithContext extends Task {
  groupTitle: string;
  groupColor: string;
  clientName: string;
  clientId: string;
  groupId: string;
}

const MyWork: React.FC<MyWorkProps> = ({ currentUser, addToast }) => {

  const [viewMode, setViewMode] = useState<'table' | 'calendar'>('table');
  const [myTasks, setMyTasks] = useState<TaskWithContext[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentDate, setCurrentDate] = useState(new Date());

  useEffect(() => {
    loadMyTasks();
  }, [currentUser.id]);

  const loadMyTasks = async () => {
    setLoading(true);
    const boards = await fetchClientBoards();

    // Extract all tasks assigned to current user
    const tasks: TaskWithContext[] = [];
    boards.forEach(board => {
      board.groups.forEach(group => {
        group.tasks.forEach(task => {
          if (task.assignedTo === currentUser.id) {
            tasks.push({
              ...task,
              groupTitle: group.title,
              groupColor: group.color,
              clientName: board.name,
              clientId: board.id,
              groupId: group.id
            });
          }
        });
      });
    });

    setMyTasks(tasks);
    setLoading(false);
  };

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

  const overdueTasks = myTasks.filter(t => getTaskStatus(t.dueDate) === 'overdue');
  const todayTasks = myTasks.filter(t => getTaskStatus(t.dueDate) === 'today');
  const upcomingTasks = myTasks.filter(t => getTaskStatus(t.dueDate) === 'upcoming');

  // Calendar helpers
  const daysInMonth = (date: Date) => new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  const firstDayOfMonth = (date: Date) => new Date(date.getFullYear(), date.getMonth(), 1).getDay();

  const prevMonth = () => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1));
  const nextMonth = () => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1));

  const getTasksForDate = (day: number) => {
    const dateStr = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    return myTasks.filter(t => t.dueDate === dateStr);
  };

  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-slate-400">Loading your tasks...</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-8 py-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-slate-900">My Work</h1>
            <p className="text-sm text-slate-500 mt-1">{myTasks.length} tasks assigned to you</p>
          </div>

          {/* View Toggle */}
          <div className="flex gap-2 bg-slate-100 p-1 rounded-lg">
            <button
              onClick={() => setViewMode('table')}
              className={`px-4 py-2 rounded-md font-medium text-sm transition-all flex items-center gap-2 ${
                viewMode === 'table' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <TableIcon className="w-4 h-4" />
              Table
            </button>
            <button
              onClick={() => setViewMode('calendar')}
              className={`px-4 py-2 rounded-md font-medium text-sm transition-all flex items-center gap-2 ${
                viewMode === 'calendar' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Calendar className="w-4 h-4" />
              Calendar
            </button>
          </div>
        </div>

        {/* Stats Row */}
        <div className="grid grid-cols-3 gap-4 mt-6">
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <div className="flex items-center gap-2 text-red-700 mb-1">
              <AlertCircle className="w-4 h-4" />
              <span className="text-xs font-semibold uppercase">Overdue</span>
            </div>
            <div className="text-2xl font-bold text-red-900">{overdueTasks.length}</div>
          </div>
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div className="flex items-center gap-2 text-blue-700 mb-1">
              <Clock className="w-4 h-4" />
              <span className="text-xs font-semibold uppercase">Due Today</span>
            </div>
            <div className="text-2xl font-bold text-blue-900">{todayTasks.length}</div>
          </div>
          <div className="bg-green-50 border border-green-200 rounded-lg p-4">
            <div className="flex items-center gap-2 text-green-700 mb-1">
              <CheckCircle2 className="w-4 h-4" />
              <span className="text-xs font-semibold uppercase">This Week</span>
            </div>
            <div className="text-2xl font-bold text-green-900">{upcomingTasks.length}</div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-8">
        {viewMode === 'table' ? (
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            <table className="w-full">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="text-left py-3 px-6 text-xs font-semibold text-slate-500 uppercase">Task</th>
                  <th className="text-left py-3 px-4 text-xs font-semibold text-slate-500 uppercase w-48">Group</th>
                  <th className="text-left py-3 px-4 text-xs font-semibold text-slate-500 uppercase w-48">Board</th>
                  <th className="text-center py-3 px-4 text-xs font-semibold text-slate-500 uppercase w-32">Date</th>
                  <th className="text-center py-3 px-4 text-xs font-semibold text-slate-500 uppercase w-32">Status</th>
                  <th className="text-center py-3 px-4 text-xs font-semibold text-slate-500 uppercase w-32">Priority</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {myTasks.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-slate-400">
                      <CheckCircle2 className="w-12 h-12 mx-auto mb-3 opacity-20" />
                      <p>No tasks assigned to you yet</p>
                    </td>
                  </tr>
                ) : (
                  myTasks
                    .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime())
                    .map(task => {
                      const status = getTaskStatus(task.dueDate);
                      return (
                        <tr key={`${task.clientId}-${task.groupId}-${task.id}`} className="hover:bg-slate-50 transition-colors">
                          <td className="py-3 px-6">
                            <div className="flex items-center gap-3">
                              <div className="w-1 h-8 rounded-full" style={{ backgroundColor: task.groupColor }}></div>
                              <span className="text-sm font-medium text-slate-700">{task.title}</span>
                            </div>
                          </td>
                          <td className="py-3 px-4">
                            <span className="text-sm text-slate-600">{task.groupTitle}</span>
                          </td>
                          <td className="py-3 px-4">
                            <span className="text-sm text-slate-600">{task.clientName}</span>
                          </td>
                          <td className="py-3 px-4 text-center">
                            <span className={`text-sm font-medium ${
                              status === 'overdue' ? 'text-red-600' :
                              status === 'today' ? 'text-blue-600' :
                              status === 'upcoming' ? 'text-green-600' :
                              'text-slate-500'
                            }`}>
                              {new Date(task.dueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-center">
                            <span className={`inline-block px-2 py-1 text-xs font-semibold rounded ${
                              status === 'overdue' ? 'bg-red-100 text-red-700' :
                              status === 'today' ? 'bg-blue-100 text-blue-700' :
                              status === 'upcoming' ? 'bg-green-100 text-green-700' :
                              'bg-slate-100 text-slate-600'
                            }`}>
                              {status === 'overdue' ? 'Overdue' :
                               status === 'today' ? 'Due Today' :
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
        ) : (
          // Calendar View
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            {/* Calendar Header */}
            <div className="flex items-center justify-between p-6 border-b border-slate-200">
              <h2 className="text-xl font-bold text-slate-900">
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
            <div className="p-4">
              <div className="grid grid-cols-7 gap-2">
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
                      className={`aspect-square border rounded-lg p-2 ${
                        isToday ? 'border-brand-500 bg-brand-50' : 'border-slate-200 hover:border-slate-300'
                      } transition-colors`}
                    >
                      <div className={`text-sm font-semibold mb-1 ${
                        isToday ? 'text-brand-700' : 'text-slate-700'
                      }`}>
                        {day}
                      </div>
                      <div className="space-y-1">
                        {tasksForDay.slice(0, 3).map(task => (
                          <div
                            key={task.id}
                            className={`text-[10px] px-1 py-0.5 rounded truncate ${
                              hasOverdue ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'
                            }`}
                            title={task.title}
                          >
                            {task.title}
                          </div>
                        ))}
                        {tasksForDay.length > 3 && (
                          <div className="text-[10px] text-slate-500 px-1">
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
    </div>
  );
};

export default MyWork;
