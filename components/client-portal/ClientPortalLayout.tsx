import React, { useState } from 'react';
import {
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
import logoUrl from '../../logo';

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
    <div className="min-h-screen bg-portal-dark flex">
      {/* Mobile Header */}
      <div className="lg:hidden fixed top-0 left-0 right-0 z-50 bg-portal-surface border-b border-white/[0.07] px-4 py-3 flex items-center justify-between">
        <button
          onClick={() => setIsMobileSidebarOpen(true)}
          className="p-2 text-portal-soft hover:text-white transition-colors"
        >
          <Menu className="w-6 h-6" />
        </button>
        <div className="flex items-center gap-2">
          <img src={logoUrl} alt="BrightForge" className="h-7" />
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
        className={`fixed lg:static inset-y-0 left-0 z-50 w-72 bg-portal-surface border-r border-white/[0.07] flex flex-col transform transition-transform duration-300 lg:translate-x-0 ${
          isMobileSidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Sidebar Header */}
        <div className="p-6 border-b border-white/[0.07]">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <img src={logoUrl} alt="BrightForge" className="h-8" />
            </div>
            <button
              onClick={() => setIsMobileSidebarOpen(false)}
              className="lg:hidden p-2 text-portal-soft hover:text-white transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Partner Info */}
        <div className="p-4 mx-4 mt-4 bg-portal-surface2 rounded-xl border border-white/[0.07]">
          <div className="flex items-center gap-3">
            {partnerAccount.avatar_url ? (
              <img
                src={partnerAccount.avatar_url}
                alt={partnerAccount.company_name}
                className="w-10 h-10 rounded-lg object-cover"
              />
            ) : (
              <div className="w-10 h-10 rounded-lg bg-portal-surface flex items-center justify-center text-white font-semibold text-sm">
                {getInitials(partnerAccount.company_name)}
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="font-medium text-white truncate">{partnerAccount.company_name}</p>
              <p className="text-sm text-portal-soft truncate">{partnerAccount.full_name}</p>
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
                    ? 'bg-portal-accent/10 text-portal-accent border border-portal-accent/20'
                    : 'text-portal-soft hover:text-white hover:bg-portal-surface2'
                }`}
              >
                <Icon className="w-5 h-5" />
                <span className="font-medium">{item.label}</span>
                {item.badge !== undefined && item.badge > 0 && (
                  <span className="ml-auto px-2 py-0.5 text-xs font-semibold rounded-full bg-portal-accent text-white">
                    {item.badge}
                  </span>
                )}
                {isActive && <ChevronRight className="w-4 h-4 ml-auto" />}
              </button>
            );
          })}
        </nav>

        {/* Logout Button */}
        <div className="p-4 border-t border-white/[0.07]">
          <button
            onClick={onLogout}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-portal-soft hover:text-red-400 hover:bg-red-500/10 transition-all"
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
