import React, { useState } from 'react';
import {
  Hexagon,
  LayoutDashboard,
  CheckSquare,
  MessageCircle,
  Settings,
  LogOut,
  Menu,
  X,
  ChevronRight,
} from 'lucide-react';
import { PortalView, PartnerAccount } from '../../types-portal';
import { ToastType } from '../../types';

interface ClientPortalLayoutProps {
  partnerAccount: PartnerAccount;
  addToast: (type: ToastType, message: string) => void;
  currentView: PortalView;
  onChangeView: (view: PortalView) => void;
  unreadMessages: number;
  onLogout: () => void;
  children: React.ReactNode;
}

const ClientPortalLayout: React.FC<ClientPortalLayoutProps> = ({
  partnerAccount,
  currentView,
  onChangeView,
  unreadMessages,
  onLogout,
  children,
}) => {
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);

  const navItems = [
    { view: PortalView.DASHBOARD, label: 'Dashboard', icon: LayoutDashboard },
    { view: PortalView.TASKS, label: 'Tasks', icon: CheckSquare },
    { view: PortalView.CHAT, label: 'Chat with Ben', icon: MessageCircle, badge: unreadMessages },
    { view: PortalView.SETTINGS, label: 'Settings', icon: Settings },
  ];

  const handleNavClick = (view: PortalView) => {
    onChangeView(view);
    setIsMobileSidebarOpen(false);
  };

  // Get initials from company name
  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map((word) => word[0])
      .join('')
      .substring(0, 2)
      .toUpperCase();
  };

  return (
    <div className="min-h-screen bg-zinc-950 flex">
      {/* Mobile Header */}
      <div className="lg:hidden fixed top-0 left-0 right-0 z-50 bg-zinc-900 border-b border-zinc-800 px-4 py-3 flex items-center justify-between">
        <button
          onClick={() => setIsMobileSidebarOpen(true)}
          className="p-2 text-zinc-400 hover:text-white transition-colors"
        >
          <Menu className="w-6 h-6" />
        </button>
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center">
            <Hexagon className="w-4 h-4 text-zinc-900" strokeWidth={2.5} />
          </div>
          <span className="font-semibold text-white">Client Portal</span>
        </div>
        <div className="w-10" /> {/* Spacer for centering */}
      </div>

      {/* Mobile Sidebar Overlay */}
      {isMobileSidebarOpen && (
        <div
          className="lg:hidden fixed inset-0 z-50 bg-black/60"
          onClick={() => setIsMobileSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed lg:static inset-y-0 left-0 z-50 w-72 bg-zinc-900 border-r border-zinc-800 flex flex-col transform transition-transform duration-300 lg:translate-x-0 ${
          isMobileSidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Sidebar Header */}
        <div className="p-6 border-b border-zinc-800">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center shadow-lg shadow-amber-500/20">
                <Hexagon className="w-5 h-5 text-zinc-900" strokeWidth={2.5} />
              </div>
              <div>
                <h1 className="font-bold text-white">Client Portal</h1>
                <span className="text-xs text-amber-400 font-medium">Bright Forge</span>
              </div>
            </div>
            <button
              onClick={() => setIsMobileSidebarOpen(false)}
              className="lg:hidden p-2 text-zinc-400 hover:text-white transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Partner Info */}
        <div className="p-4 mx-4 mt-4 bg-zinc-800/50 rounded-xl border border-zinc-700/50">
          <div className="flex items-center gap-3">
            {partnerAccount.avatar_url ? (
              <img
                src={partnerAccount.avatar_url}
                alt={partnerAccount.company_name}
                className="w-10 h-10 rounded-lg object-cover"
              />
            ) : (
              <div className="w-10 h-10 rounded-lg bg-zinc-700 flex items-center justify-center text-white font-semibold text-sm">
                {getInitials(partnerAccount.company_name)}
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="font-medium text-white truncate">{partnerAccount.company_name}</p>
              <p className="text-sm text-zinc-400 truncate">{partnerAccount.full_name}</p>
            </div>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-4 space-y-1">
          {navItems.map((item) => {
            const isActive = currentView === item.view;
            const Icon = item.icon;

            return (
              <button
                key={item.view}
                onClick={() => handleNavClick(item.view)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${
                  isActive
                    ? 'bg-amber-400/10 text-amber-400 border border-amber-400/20'
                    : 'text-zinc-400 hover:text-white hover:bg-zinc-800'
                }`}
              >
                <Icon className="w-5 h-5" />
                <span className="font-medium">{item.label}</span>
                {item.badge !== undefined && item.badge > 0 && (
                  <span className="ml-auto px-2 py-0.5 text-xs font-semibold rounded-full bg-amber-400 text-zinc-900">
                    {item.badge}
                  </span>
                )}
                {isActive && <ChevronRight className="w-4 h-4 ml-auto" />}
              </button>
            );
          })}
        </nav>

        {/* Logout Button */}
        <div className="p-4 border-t border-zinc-800">
          <button
            onClick={onLogout}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-zinc-400 hover:text-red-400 hover:bg-red-500/10 transition-all"
          >
            <LogOut className="w-5 h-5" />
            <span className="font-medium">Sign Out</span>
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 lg:ml-0 pt-14 lg:pt-0">
        <div className="h-full overflow-auto">{children}</div>
      </main>
    </div>
  );
};

export default ClientPortalLayout;
