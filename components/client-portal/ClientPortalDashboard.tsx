import React, { useState, useEffect } from 'react';
import {
  Users,
  CheckSquare,
  Mail,
  MessageCircle,
  ArrowRight,
  Building2,
  Clock,
  TrendingUp,
} from 'lucide-react';
import { PartnerAccount, PortalStats, PartnerTask } from '../../types-portal';
import { ClientBoard, ToastType } from '../../types';
import {
  fetchAllClientTasksForPartner,
  fetchPortalStats,
} from '../../services/clientPortalService';

interface ClientPortalDashboardProps {
  partnerAccount: PartnerAccount;
  addToast: (type: ToastType, message: string) => void;
  onNavigateToTasks: (clientId?: string) => void;
}

const ClientPortalDashboard: React.FC<ClientPortalDashboardProps> = ({
  partnerAccount,
  addToast,
  onNavigateToTasks,
}) => {
  const [clients, setClients] = useState<ClientBoard[]>([]);
  const [stats, setStats] = useState<PortalStats | null>(null);
  const [activeTasks, setActiveTasks] = useState<PartnerTask[]>([]);
  const [recentTasks, setRecentTasks] = useState<PartnerTask[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, [partnerAccount.id]);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [{ tasks, clients: clientsData }, statsData] = await Promise.all([
        fetchAllClientTasksForPartner(partnerAccount.id),
        fetchPortalStats(partnerAccount.id),
      ]);

      setClients(clientsData);
      setStats(statsData);

      // Use active/open tasks for the dashboard. Completed tasks remain available on the task board,
      // but old done work should not inflate projected-task counts.
      const openTasks = tasks.filter(t => t.partner_status !== 'completed');
      setActiveTasks(openTasks);

      const sortedTasks = [...openTasks].sort((a, b) =>
        new Date(b.assigned_at).getTime() - new Date(a.assigned_at).getTime()
      );
      setRecentTasks(sortedTasks.slice(0, 5));
    } catch (err) {
      console.error('Error loading dashboard data:', err);
      addToast('error', 'Failed to load dashboard data');
    } finally {
      setIsLoading(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'assigned':
        return 'bg-blue-500/20 text-blue-400';
      case 'in_progress':
        return 'bg-yellow-500/20 text-yellow-400';
      case 'send_email':
        return 'bg-purple-500/20 text-purple-400';
      case 'email_sent':
        return 'bg-emerald-500/20 text-emerald-400';
      case 'completed':
        return 'bg-green-500/20 text-green-400';
      default:
        return 'bg-portal-soft/20 text-portal-soft';
    }
  };

  const formatStatus = (status: string) => {
    return status.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase());
  };

  if (isLoading) {
    return (
      <div className="p-8">
        <div className="animate-pulse space-y-8">
          <div className="h-8 bg-portal-surface2 rounded w-48"></div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-32 bg-portal-surface2 rounded-xl"></div>
            ))}
          </div>
          <div className="h-64 bg-portal-surface2 rounded-xl"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8 space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white mb-2">
          Welcome back, {partnerAccount.full_name.split(' ')[0]}!
        </h1>
        <p className="text-portal-soft">
          Here's an overview of your clients and tasks.
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-portal-surface rounded-xl border border-white/[0.07] p-6">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-blue-500/20 flex items-center justify-center">
              <Users className="w-6 h-6 text-blue-400" />
            </div>
            <div>
              <p className="text-sm text-portal-soft">Active Clients</p>
              <p className="text-2xl font-bold text-white">{stats?.totalClients || 0}</p>
            </div>
          </div>
        </div>

        <div className="bg-portal-surface rounded-xl border border-white/[0.07] p-6">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-portal-accent/20 flex items-center justify-center">
              <CheckSquare className="w-6 h-6 text-portal-accent" />
            </div>
            <div>
              <p className="text-sm text-portal-soft">Open Tasks</p>
              <p className="text-2xl font-bold text-white">{stats?.pendingTasks || 0}</p>
            </div>
          </div>
        </div>

        <div className="bg-portal-surface rounded-xl border border-white/[0.07] p-6">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-emerald-500/20 flex items-center justify-center">
              <Mail className="w-6 h-6 text-emerald-400" />
            </div>
            <div>
              <p className="text-sm text-portal-soft">Emails Sent</p>
              <p className="text-2xl font-bold text-white">{stats?.emailsSent || 0}</p>
            </div>
          </div>
        </div>

        <div className="bg-portal-surface rounded-xl border border-white/[0.07] p-6">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-green-500/20 flex items-center justify-center">
              <TrendingUp className="w-6 h-6 text-green-400" />
            </div>
            <div>
              <p className="text-sm text-portal-soft">Completed</p>
              <p className="text-2xl font-bold text-white">{stats?.completedTasks || 0}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Two Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Clients List */}
        <div className="bg-portal-surface rounded-xl border border-white/[0.07] overflow-hidden">
          <div className="p-6 border-b border-white/[0.07] flex items-center justify-between">
            <h2 className="text-lg font-semibold text-white">Your Clients</h2>
            <button
              onClick={() => onNavigateToTasks()}
              className="text-sm text-portal-accent hover:text-orange-300 flex items-center gap-1 transition-colors"
            >
              View All Tasks
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
          <div className="divide-y divide-white/[0.07]">
            {clients.length === 0 ? (
              <div className="p-8 text-center">
                <Building2 className="w-12 h-12 text-portal-soft mx-auto mb-3" />
                <p className="text-portal-soft">No clients assigned yet</p>
                <p className="text-sm text-portal-soft mt-1">
                  Contact your account manager to get started
                </p>
              </div>
            ) : (
              clients.map((client) => {
                const openTaskCount = activeTasks.filter(task => task.client_board_id === client.id).length;

                return (
                <button
                  key={client.id}
                  onClick={() => onNavigateToTasks(client.id)}
                  className="w-full p-4 flex items-center gap-4 hover:bg-portal-surface2/50 transition-colors text-left"
                >
                  {client.logoUrl ? (
                    <img
                      src={client.logoUrl}
                      alt={client.name}
                      className="w-10 h-10 rounded-lg object-cover"
                    />
                  ) : (
                    <div
                      className="w-10 h-10 rounded-lg flex items-center justify-center text-white font-semibold text-sm"
                      style={{ backgroundColor: client.color || '#3b82f6' }}
                    >
                      {client.initials}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-white truncate">{client.name}</p>
                    <p className="text-sm text-portal-soft">
                      {openTaskCount} open tasks
                    </p>
                  </div>
                  <ArrowRight className="w-4 h-4 text-portal-soft" />
                </button>
                );
              })
            )}
          </div>
        </div>

        {/* Recent Tasks */}
        <div className="bg-portal-surface rounded-xl border border-white/[0.07] overflow-hidden">
          <div className="p-6 border-b border-white/[0.07]">
            <h2 className="text-lg font-semibold text-white">Recent Tasks</h2>
          </div>
          <div className="divide-y divide-white/[0.07]">
            {recentTasks.length === 0 ? (
              <div className="p-8 text-center">
                <CheckSquare className="w-12 h-12 text-portal-soft mx-auto mb-3" />
                <p className="text-portal-soft">No tasks assigned yet</p>
                <p className="text-sm text-portal-soft mt-1">
                  Tasks will appear here when assigned to you
                </p>
              </div>
            ) : (
              recentTasks.map((task) => (
                <div
                  key={task.id}
                  className="p-4 hover:bg-portal-surface2/50 transition-colors"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-white truncate">
                        {task.task?.title || `Task ${task.task_id}`}
                      </p>
                      <p className="text-sm text-portal-soft truncate mt-1">
                        {task.client_name || 'Client'}
                      </p>
                    </div>
                    <span
                      className={`px-2 py-1 text-xs font-medium rounded-full ${getStatusColor(
                        task.partner_status
                      )}`}
                    >
                      {formatStatus(task.partner_status)}
                    </span>
                  </div>
                  {task.visible_notes && (
                    <p className="text-sm text-portal-soft mt-2 line-clamp-2">
                      {task.visible_notes}
                    </p>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      {stats && stats.unreadMessages > 0 && (
        <div className="bg-gradient-to-r from-portal-accent/10 to-portal-accent/10 rounded-xl border border-portal-accent/20 p-6">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-portal-accent/20 flex items-center justify-center">
              <MessageCircle className="w-6 h-6 text-portal-accent" />
            </div>
            <div className="flex-1">
              <p className="font-medium text-white">
                You have {stats.unreadMessages} unread message{stats.unreadMessages !== 1 ? 's' : ''}
              </p>
              <p className="text-sm text-portal-soft">Check your messages from Ben</p>
            </div>
            <button
              onClick={() => onNavigateToTasks()}
              className="px-4 py-2 bg-portal-accent text-white font-semibold rounded-lg hover:bg-portal-accent transition-colors"
            >
              View Messages
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default ClientPortalDashboard;
