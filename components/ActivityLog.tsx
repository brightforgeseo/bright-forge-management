import React, { useState, useEffect } from 'react';
import { Activity, Filter, RefreshCw, ChevronDown, ChevronUp, Search, Calendar, User as UserIcon, ArrowRight } from 'lucide-react';
import { fetchActivityLog, ActivityLogEntry } from '../services/databaseService';

interface ActivityLogProps {
  onError?: (message: string) => void;
}

const ACTION_LABELS: Record<string, string> = {
  status_change: 'Status Changed',
  task_create: 'Task Created',
  task_delete: 'Task Deleted',
  task_archive: 'Task Archived',
  task_restore: 'Task Restored',
  assignment_change: 'Assignment Changed',
  due_date_change: 'Due Date Changed',
  task_move: 'Task Moved',
  board_create: 'Board Created',
  board_delete: 'Board Deleted',
  group_create: 'Group Created',
  group_delete: 'Group Deleted',
  comment_add: 'Comment Added',
  comment_delete: 'Comment Deleted',
};

const ACTION_COLORS: Record<string, string> = {
  status_change: 'bg-blue-100 text-blue-700',
  task_create: 'bg-green-100 text-green-700',
  task_delete: 'bg-red-100 text-red-700',
  task_archive: 'bg-gray-100 text-gray-700',
  task_restore: 'bg-emerald-100 text-emerald-700',
  assignment_change: 'bg-purple-100 text-purple-700',
  due_date_change: 'bg-amber-100 text-amber-700',
  task_move: 'bg-indigo-100 text-indigo-700',
  board_create: 'bg-teal-100 text-teal-700',
  board_delete: 'bg-rose-100 text-rose-700',
  group_create: 'bg-cyan-100 text-cyan-700',
  group_delete: 'bg-orange-100 text-orange-700',
  comment_add: 'bg-sky-100 text-sky-700',
  comment_delete: 'bg-portal-surface2 text-portal-text',
};

const ActivityLog: React.FC<ActivityLogProps> = ({ onError }) => {
  const [activities, setActivities] = useState<ActivityLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Filters
  const [actionFilter, setActionFilter] = useState<string>('');
  const [entityFilter, setEntityFilter] = useState<string>('');
  const [dateRange, setDateRange] = useState<{ start: string; end: string }>({ start: '', end: '' });

  const loadActivities = async () => {
    setLoading(true);
    try {
      const data = await fetchActivityLog({
        limit: 100,
        action: actionFilter || undefined,
        entityType: entityFilter || undefined,
        startDate: dateRange.start || undefined,
        endDate: dateRange.end ? `${dateRange.end}T23:59:59` : undefined,
      });
      setActivities(data);
    } catch (error) {
      console.error('Failed to load activities:', error);
      onError?.('Failed to load activity log');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadActivities();
  }, [actionFilter, entityFilter, dateRange]);

  const filteredActivities = activities.filter(activity => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      activity.entityName?.toLowerCase().includes(query) ||
      activity.userName?.toLowerCase().includes(query) ||
      activity.userEmail.toLowerCase().includes(query) ||
      activity.boardName?.toLowerCase().includes(query) ||
      activity.oldValue?.toLowerCase().includes(query) ||
      activity.newValue?.toLowerCase().includes(query)
    );
  });

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;

    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    });
  };

  const renderChangeValue = (activity: ActivityLogEntry) => {
    if (!activity.oldValue && !activity.newValue) return null;

    return (
      <div className="flex items-center gap-2 text-sm mt-1">
        {activity.oldValue && (
          <span className="px-2 py-0.5 bg-red-50 text-red-600 rounded line-through">
            {activity.oldValue}
          </span>
        )}
        {activity.oldValue && activity.newValue && (
          <ArrowRight className="w-3 h-3 text-portal-soft" />
        )}
        {activity.newValue && (
          <span className="px-2 py-0.5 bg-green-50 text-green-600 rounded">
            {activity.newValue}
          </span>
        )}
      </div>
    );
  };

  return (
    <div className="bg-portal-surface rounded-2xl shadow-lg shadow-black/20 border border-white/[0.07] overflow-hidden">
      <div className="p-6 border-b border-white/[0.07] bg-portal-dark">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Activity className="w-5 h-5 text-portal-soft" />
            <h3 className="font-semibold text-white">Activity Log</h3>
            <span className="text-sm text-portal-soft">
              ({filteredActivities.length} entries)
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setFiltersOpen(!filtersOpen)}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-colors ${
                filtersOpen ? 'bg-brand-100 text-brand-700' : 'hover:bg-portal-surface2 text-portal-soft'
              }`}
            >
              <Filter className="w-4 h-4" />
              Filters
              {filtersOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
            <button
              onClick={loadActivities}
              disabled={loading}
              className="flex items-center gap-2 px-3 py-2 text-brand-600 hover:bg-brand-50 rounded-lg transition-colors"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>
        </div>

        {/* Search Bar */}
        <div className="mt-4 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-portal-soft" />
          <input
            type="text"
            placeholder="Search by task, user, board..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 rounded-lg border border-white/[0.07] focus:ring-2 focus:ring-brand-500 outline-none"
          />
        </div>

        {/* Filters Panel */}
        {filtersOpen && (
          <div className="mt-4 p-4 bg-portal-surface rounded-xl border border-white/[0.07] space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-portal-text mb-1">Action Type</label>
                <select
                  value={actionFilter}
                  onChange={(e) => setActionFilter(e.target.value)}
                  className="w-full p-2 rounded-lg border border-white/[0.07] focus:ring-2 focus:ring-brand-500 outline-none"
                >
                  <option value="">All Actions</option>
                  <option value="status_change">Status Changes</option>
                  <option value="task_create">Task Created</option>
                  <option value="task_delete">Task Deleted</option>
                  <option value="task_archive">Task Archived</option>
                  <option value="assignment_change">Assignment Changes</option>
                  <option value="due_date_change">Due Date Changes</option>
                  <option value="task_move">Task Moved</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-portal-text mb-1">Entity Type</label>
                <select
                  value={entityFilter}
                  onChange={(e) => setEntityFilter(e.target.value)}
                  className="w-full p-2 rounded-lg border border-white/[0.07] focus:ring-2 focus:ring-brand-500 outline-none"
                >
                  <option value="">All Types</option>
                  <option value="task">Tasks</option>
                  <option value="board">Boards</option>
                  <option value="group">Groups</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-portal-text mb-1">Date Range</label>
                <div className="flex gap-2">
                  <input
                    type="date"
                    value={dateRange.start}
                    onChange={(e) => setDateRange({ ...dateRange, start: e.target.value })}
                    className="flex-1 p-2 rounded-lg border border-white/[0.07] focus:ring-2 focus:ring-brand-500 outline-none text-sm"
                  />
                  <input
                    type="date"
                    value={dateRange.end}
                    onChange={(e) => setDateRange({ ...dateRange, end: e.target.value })}
                    className="flex-1 p-2 rounded-lg border border-white/[0.07] focus:ring-2 focus:ring-brand-500 outline-none text-sm"
                  />
                </div>
              </div>
            </div>

            {(actionFilter || entityFilter || dateRange.start || dateRange.end) && (
              <button
                onClick={() => {
                  setActionFilter('');
                  setEntityFilter('');
                  setDateRange({ start: '', end: '' });
                }}
                className="text-sm text-brand-600 hover:text-brand-700"
              >
                Clear all filters
              </button>
            )}
          </div>
        )}
      </div>

      {/* Activity List */}
      <div className="divide-y divide-slate-100 max-h-[600px] overflow-y-auto">
        {loading ? (
          <div className="p-8 text-center text-portal-soft">
            <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2" />
            Loading activity log...
          </div>
        ) : filteredActivities.length === 0 ? (
          <div className="p-8 text-center text-portal-soft">
            <Activity className="w-8 h-8 mx-auto mb-2 text-portal-text" />
            <p>No activities found</p>
            <p className="text-sm mt-1">Activity will appear here as changes are made</p>
          </div>
        ) : (
          filteredActivities.map((activity) => (
            <div key={activity.id} className="p-4 hover:bg-portal-dark transition-colors">
              <div className="flex items-start gap-4">
                {/* User Avatar */}
                <div className="w-10 h-10 rounded-full bg-portal-surface2 flex items-center justify-center flex-shrink-0">
                  <UserIcon className="w-5 h-5 text-portal-soft" />
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-white">
                      {activity.userName || activity.userEmail.split('@')[0]}
                    </span>
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                      ACTION_COLORS[activity.action] || 'bg-portal-surface2 text-portal-text'
                    }`}>
                      {ACTION_LABELS[activity.action] || activity.action}
                    </span>
                  </div>

                  <div className="mt-1 text-sm text-portal-soft">
                    {activity.entityName && (
                      <span className="font-medium text-portal-text">"{activity.entityName}"</span>
                    )}
                    {activity.boardName && (
                      <span className="text-portal-soft"> on {activity.boardName}</span>
                    )}
                    {activity.groupName && (
                      <span className="text-portal-soft"> ({activity.groupName})</span>
                    )}
                  </div>

                  {renderChangeValue(activity)}
                </div>

                {/* Timestamp */}
                <div className="flex items-center gap-1 text-xs text-portal-soft flex-shrink-0">
                  <Calendar className="w-3 h-3" />
                  {formatDate(activity.createdAt)}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default ActivityLog;
