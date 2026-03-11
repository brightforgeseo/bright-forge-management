import React, { useState, useEffect } from 'react';
import { BrandingConfig, ToastType, User, ClientBoard } from '../types';
import { PartnerWithStats } from '../types-portal';
import { Save, Monitor, User as UserIcon, Upload, Loader2, Users, Key, Trash2, Shield, X, Building2, Plus, UserPlus, Check, Copy, Mail } from 'lucide-react';
import { supabase } from '../lib/supabaseClient';
import { uploadFile, fetchAllAuthUsers, resetUserPassword, deleteAuthUser, updateUserRole, AuthUser, fetchClientBoards } from '../services/databaseService';
import { fetchAllPartners, createPartnerAccount, deletePartnerAccount, togglePartnerActive, grantClientAccess, revokeClientAccess } from '../services/clientPortalService';
import ActivityLog from './ActivityLog';

interface SettingsProps {
  branding: BrandingConfig;
  setBranding: (config: BrandingConfig) => void;
  addToast: (type: ToastType, message: string) => void;
  currentUser: User;
}

const Settings: React.FC<SettingsProps> = ({ branding, setBranding, addToast, currentUser }) => {
  const [localConfig, setLocalConfig] = React.useState(branding);
  const [saved, setSaved] = React.useState(false);
  const [fullName, setFullName] = React.useState(currentUser.name);
  const [avatarUrl, setAvatarUrl] = React.useState(currentUser.avatarUrl || '');
  const [isUploadingAvatar, setIsUploadingAvatar] = React.useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  // User management state
  const [authUsers, setAuthUsers] = useState<AuthUser[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [resetPasswordModal, setResetPasswordModal] = useState<{ open: boolean; user: AuthUser | null }>({ open: false, user: null });
  const [newPassword, setNewPassword] = useState('');
  const [deleteModal, setDeleteModal] = useState<{ open: boolean; user: AuthUser | null }>({ open: false, user: null });
  const [actionLoading, setActionLoading] = useState(false);

  // Partner management state
  const [partners, setPartners] = useState<PartnerWithStats[]>([]);
  const [loadingPartners, setLoadingPartners] = useState(false);
  const [showCreatePartnerModal, setShowCreatePartnerModal] = useState(false);
  const [showAssignClientsModal, setShowAssignClientsModal] = useState<{ open: boolean; partner: PartnerWithStats | null }>({ open: false, partner: null });
  const [showDeletePartnerModal, setShowDeletePartnerModal] = useState<{ open: boolean; partner: PartnerWithStats | null }>({ open: false, partner: null });
  const [newPartner, setNewPartner] = useState({ email: '', companyName: '', fullName: '', password: '' });
  const [createdPartnerCreds, setCreatedPartnerCreds] = useState<{ email: string; password: string } | null>(null);
  const [clients, setClients] = useState<ClientBoard[]>([]);
  const [partnerClientIds, setPartnerClientIds] = useState<string[]>([]);
  const [partnerActionLoading, setPartnerActionLoading] = useState(false);

  // Fetch users and partners on mount for Owners
  useEffect(() => {
    if (currentUser.role === 'Owner') {
      loadUsers();
      loadPartners();
    }
  }, [currentUser.role]);

  const loadUsers = async () => {
    setLoadingUsers(true);
    try {
      const users = await fetchAllAuthUsers();
      setAuthUsers(users);
    } catch (error) {
      console.error('Failed to load users:', error);
      addToast('error', 'Failed to load users');
    } finally {
      setLoadingUsers(false);
    }
  };

  const loadPartners = async () => {
    setLoadingPartners(true);
    try {
      const partnerList = await fetchAllPartners();
      setPartners(partnerList);
    } catch (error) {
      console.error('Failed to load partners:', error);
      addToast('error', 'Failed to load partners');
    } finally {
      setLoadingPartners(false);
    }
  };

  const loadClients = async () => {
    try {
      const clientList = await fetchClientBoards();
      setClients(clientList);
    } catch (error) {
      console.error('Failed to load clients:', error);
    }
  };

  const generatePartnerPassword = () => {
    const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$';
    let pass = '';
    for (let i = 0; i < 12; i++) pass += chars.charAt(Math.floor(Math.random() * chars.length));
    setNewPartner(prev => ({ ...prev, password: pass }));
  };

  const handleCreatePartner = async () => {
    if (!newPartner.email.trim() || !newPartner.companyName.trim() || !newPartner.fullName.trim() || !newPartner.password.trim()) {
      addToast('error', 'Please fill in all fields');
      return;
    }

    setPartnerActionLoading(true);
    try {
      const partner = await createPartnerAccount(
        newPartner.email,
        newPartner.password,
        newPartner.companyName,
        newPartner.fullName
      );

      if (partner) {
        setCreatedPartnerCreds({ email: newPartner.email, password: newPartner.password });
        addToast('success', 'Partner account created');
        loadPartners();
      } else {
        addToast('error', 'Failed to create partner account');
      }
    } catch (error) {
      console.error('Failed to create partner:', error);
      addToast('error', 'Failed to create partner account');
    } finally {
      setPartnerActionLoading(false);
    }
  };

  const handleDeletePartner = async () => {
    if (!showDeletePartnerModal.partner) return;

    setPartnerActionLoading(true);
    try {
      const success = await deletePartnerAccount(showDeletePartnerModal.partner.id);
      if (success) {
        addToast('success', 'Partner account deleted');
        setShowDeletePartnerModal({ open: false, partner: null });
        loadPartners();
      } else {
        addToast('error', 'Failed to delete partner');
      }
    } catch (error) {
      console.error('Failed to delete partner:', error);
      addToast('error', 'Failed to delete partner');
    } finally {
      setPartnerActionLoading(false);
    }
  };

  const handleTogglePartnerActive = async (partner: PartnerWithStats) => {
    try {
      const success = await togglePartnerActive(partner.id, !partner.is_active);
      if (success) {
        addToast('success', `Partner ${partner.is_active ? 'deactivated' : 'activated'}`);
        loadPartners();
      }
    } catch (error) {
      console.error('Failed to toggle partner status:', error);
      addToast('error', 'Failed to update partner status');
    }
  };

  const openAssignClientsModal = async (partner: PartnerWithStats) => {
    await loadClients();
    // Get current client assignments for this partner
    const { data } = await supabase
      .from('partner_client_access')
      .select('client_board_id')
      .eq('partner_id', partner.id);
    setPartnerClientIds(data?.map(d => d.client_board_id) || []);
    setShowAssignClientsModal({ open: true, partner });
  };

  const handleToggleClientAccess = async (clientId: string) => {
    if (!showAssignClientsModal.partner) return;

    const partnerId = showAssignClientsModal.partner.id;
    const hasAccess = partnerClientIds.includes(clientId);

    try {
      if (hasAccess) {
        await revokeClientAccess(partnerId, clientId);
        setPartnerClientIds(prev => prev.filter(id => id !== clientId));
      } else {
        await grantClientAccess(partnerId, clientId, currentUser.id);
        setPartnerClientIds(prev => [...prev, clientId]);
      }
    } catch (error) {
      console.error('Failed to update client access:', error);
      addToast('error', 'Failed to update client access');
    }
  };

  const resetCreatePartnerModal = () => {
    setShowCreatePartnerModal(false);
    setNewPartner({ email: '', companyName: '', fullName: '', password: '' });
    setCreatedPartnerCreds(null);
  };

  const getPartnerPortalUrl = () => `${window.location.origin}/client-portal`;

  const handleResetPassword = async () => {
    if (!resetPasswordModal.user || !newPassword) return;

    setActionLoading(true);
    try {
      await resetUserPassword(resetPasswordModal.user.id, newPassword);
      addToast('success', `Password reset for ${resetPasswordModal.user.email}`);
      setResetPasswordModal({ open: false, user: null });
      setNewPassword('');
    } catch (error) {
      console.error('Failed to reset password:', error);
      addToast('error', 'Failed to reset password');
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeleteUser = async () => {
    if (!deleteModal.user) return;

    setActionLoading(true);
    try {
      await deleteAuthUser(deleteModal.user.id);
      addToast('success', `User ${deleteModal.user.email} deleted`);
      setDeleteModal({ open: false, user: null });
      loadUsers(); // Refresh list
    } catch (error) {
      console.error('Failed to delete user:', error);
      addToast('error', 'Failed to delete user');
    } finally {
      setActionLoading(false);
    }
  };

  const handleSave = () => {
    setBranding(localConfig);
    setSaved(true);
    addToast('success', 'Settings saved successfully!');
    setTimeout(() => setSaved(false), 2000);
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || !e.target.files[0]) return;

    setIsUploadingAvatar(true);
    try {
      const file = e.target.files[0];

      // Validate file type
      if (!file.type.startsWith('image/')) {
        addToast('error', 'Please upload an image file');
        setIsUploadingAvatar(false);
        return;
      }

      // Validate file size (max 5MB)
      if (file.size > 5 * 1024 * 1024) {
        addToast('error', 'Image must be smaller than 5MB');
        setIsUploadingAvatar(false);
        return;
      }

      // Upload to Supabase storage
      // Note: Using 'uploads' bucket until 'avatars' bucket is created
      // Run SETUP_AVATARS_BUCKET.sql to create the dedicated avatars bucket
      console.log('[Settings] Starting avatar upload...');
      const url = await uploadFile(file, 'uploads');
      console.log('[Settings] Upload result:', url);

      if (url) {
        // Update profile in database
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          console.log('[Settings] Updating profile with avatar URL:', url);
          const { error: updateError } = await supabase
            .from('profiles')
            .update({ avatar_url: url })
            .eq('id', user.id);

          if (updateError) {
            console.error('[Settings] Error updating profile:', updateError);
            addToast('error', 'Failed to save avatar to profile');
          } else {
            setAvatarUrl(url);
            addToast('success', 'Profile picture updated!');
          }
        }
      } else {
        addToast('error', 'Failed to upload image. Check browser console for details.');
      }
    } catch (error) {
      console.error('Avatar upload error:', error);
      addToast('error', 'Failed to upload image');
    } finally {
      setIsUploadingAvatar(false);
    }
  };

  const handleUpdateProfile = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await supabase
          .from('profiles')
          .update({ full_name: fullName })
          .eq('id', user.id);

        await supabase.auth.updateUser({
          data: { full_name: fullName }
        });

        addToast('success', 'Profile updated successfully!');
      }
    } catch (error) {
      console.error('Profile update error:', error);
      addToast('error', 'Failed to update profile');
    }
  };

  return (
    <div className="p-8 max-w-3xl mx-auto space-y-8">
      <div className="space-y-2">
        <h2 className="text-3xl font-bold text-white">Settings</h2>
        <p className="text-portal-soft">Manage your profile and platform settings.</p>
      </div>

      {/* Profile Settings */}
      <div className="bg-portal-surface rounded-2xl shadow-lg shadow-black/20 border border-white/[0.07] overflow-hidden">
        <div className="p-6 border-b border-white/[0.07] bg-portal-dark flex items-center gap-3">
          <UserIcon className="w-5 h-5 text-portal-soft" />
          <h3 className="font-semibold text-white">Profile Settings</h3>
        </div>

        <div className="p-8 space-y-6">
          {/* Avatar Upload */}
          <div>
            <label className="block text-sm font-medium text-portal-text mb-3">Profile Picture</label>
            <div className="flex items-center gap-6">
              <div className="relative group">
                {avatarUrl ? (
                  <img
                    src={avatarUrl}
                    alt="Profile"
                    className="w-24 h-24 rounded-full object-cover border-4 border-white/[0.07]"
                  />
                ) : (
                  <div className="w-24 h-24 rounded-full bg-portal-surface2 flex items-center justify-center border-4 border-white/[0.07]">
                    <UserIcon className="w-12 h-12 text-portal-soft" />
                  </div>
                )}
                {isUploadingAvatar && (
                  <div className="absolute inset-0 bg-black/50 rounded-full flex items-center justify-center">
                    <Loader2 className="w-8 h-8 text-white animate-spin" />
                  </div>
                )}
              </div>
              <div className="flex-1">
                <input
                  type="file"
                  ref={fileInputRef}
                  className="hidden"
                  accept="image/*"
                  onChange={handleAvatarUpload}
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploadingAvatar}
                  className="flex items-center gap-2 px-4 py-2 bg-portal-surface2 hover:bg-portal-surface2 text-portal-text rounded-lg font-medium transition-colors disabled:opacity-50"
                >
                  <Upload className="w-4 h-4" />
                  {isUploadingAvatar ? 'Uploading...' : 'Upload Photo'}
                </button>
                <p className="text-xs text-portal-soft mt-2">JPG, PNG or GIF. Max 5MB.</p>
              </div>
            </div>
          </div>

          {/* Full Name */}
          <div>
            <label className="block text-sm font-medium text-portal-text mb-2">Full Name</label>
            <input
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="w-full p-3 rounded-xl border border-white/[0.07] focus:ring-2 focus:ring-brand-500 outline-none"
              placeholder="Enter your full name"
            />
          </div>

          {/* Email (read-only) */}
          <div>
            <label className="block text-sm font-medium text-portal-text mb-2">Email</label>
            <input
              type="email"
              value={currentUser.email || ''}
              disabled
              className="w-full p-3 rounded-xl border border-white/[0.07] bg-portal-dark text-portal-soft cursor-not-allowed"
            />
            <p className="text-xs text-portal-soft mt-2">Email cannot be changed.</p>
          </div>

          {/* Role (read-only) */}
          <div>
            <label className="block text-sm font-medium text-portal-text mb-2">Role</label>
            <input
              type="text"
              value={currentUser.role}
              disabled
              className="w-full p-3 rounded-xl border border-white/[0.07] bg-portal-dark text-portal-soft cursor-not-allowed"
            />
          </div>

          <div className="pt-4">
            <button
              onClick={handleUpdateProfile}
              className="flex items-center justify-center gap-2 px-8 py-3 bg-brand-600 hover:bg-brand-700 text-white rounded-xl font-semibold transition-all w-full md:w-auto"
            >
              <Save className="w-4 h-4" />
              Save Profile
            </button>
          </div>
        </div>
      </div>

      {/* Platform Branding - Only visible to Owners */}
      {currentUser.role === 'Owner' && (
        <div className="bg-portal-surface rounded-2xl shadow-lg shadow-black/20 border border-white/[0.07] overflow-hidden">
          <div className="p-6 border-b border-white/[0.07] bg-portal-dark flex items-center gap-3">
            <Monitor className="w-5 h-5 text-portal-soft" />
            <h3 className="font-semibold text-white">Branding Configuration</h3>
          </div>

          <div className="p-8 space-y-6">
            <div>
              <label className="block text-sm font-medium text-portal-text mb-2">Platform Name</label>
              <input
                type="text"
                value={localConfig.companyName}
                onChange={(e) => setLocalConfig({ ...localConfig, companyName: e.target.value })}
                className="w-full p-3 rounded-xl border border-white/[0.07] focus:ring-2 focus:ring-brand-500 outline-none"
              />
              <p className="text-xs text-portal-soft mt-2">This name will appear in the sidebar and browser tab.</p>
            </div>

            <div className="flex items-center gap-4 p-4 bg-brand-50 rounded-xl border border-brand-100 text-brand-800">
               <div className="w-10 h-10 bg-portal-surface rounded-lg flex items-center justify-center shadow-lg shadow-black/20">
                  <span className="font-bold text-lg text-brand-600">{localConfig.companyName.charAt(0)}</span>
               </div>
               <div className="flex-1">
                 <p className="font-semibold">Live Preview</p>
                 <p className="text-sm opacity-80">This is how your brand appears in the sidebar.</p>
               </div>
            </div>

            <div className="pt-4">
              <button
                onClick={handleSave}
                className="flex items-center justify-center gap-2 px-8 py-3 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-semibold transition-all w-full md:w-auto"
              >
                <Save className="w-4 h-4" />
                {saved ? 'Changes Saved' : 'Save Settings'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* User Management - Only visible to Owners */}
      {currentUser.role === 'Owner' && (
        <div className="bg-portal-surface rounded-2xl shadow-lg shadow-black/20 border border-white/[0.07] overflow-hidden">
          <div className="p-6 border-b border-white/[0.07] bg-portal-dark flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Users className="w-5 h-5 text-portal-soft" />
              <h3 className="font-semibold text-white">User Management</h3>
            </div>
            <button
              onClick={loadUsers}
              disabled={loadingUsers}
              className="text-sm text-brand-600 hover:text-brand-700 font-medium"
            >
              {loadingUsers ? 'Loading...' : 'Refresh'}
            </button>
          </div>

          <div className="p-6">
            {loadingUsers ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-portal-soft" />
              </div>
            ) : authUsers.length === 0 ? (
              <p className="text-portal-soft text-center py-8">No users found</p>
            ) : (
              <div className="space-y-3">
                {authUsers.map(user => (
                  <div
                    key={user.id}
                    className="flex items-center justify-between p-4 bg-portal-dark rounded-xl border border-white/[0.07]"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-white truncate">
                        {user.user_metadata?.full_name || user.email.split('@')[0]}
                      </p>
                      <p className="text-sm text-portal-soft truncate">{user.email}</p>
                      <p className="text-xs text-portal-soft mt-1">
                        Last login: {user.last_sign_in_at
                          ? new Date(user.last_sign_in_at).toLocaleDateString()
                          : 'Never'}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 ml-4">
                      <button
                        onClick={() => setResetPasswordModal({ open: true, user })}
                        className="p-2 text-amber-600 hover:bg-amber-50 rounded-lg transition-colors"
                        title="Reset Password"
                      >
                        <Key className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => setDeleteModal({ open: true, user })}
                        className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                        title="Delete User"
                        disabled={user.email === currentUser.email}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Partner Management - Only visible to Owners */}
      {currentUser.role === 'Owner' && (
        <div className="bg-portal-surface rounded-2xl shadow-lg shadow-black/20 border border-white/[0.07] overflow-hidden">
          <div className="p-6 border-b border-white/[0.07] bg-portal-dark flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Building2 className="w-5 h-5 text-portal-soft" />
              <h3 className="font-semibold text-white">Partner Management</h3>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={loadPartners}
                disabled={loadingPartners}
                className="text-sm text-brand-600 hover:text-brand-700 font-medium"
              >
                {loadingPartners ? 'Loading...' : 'Refresh'}
              </button>
              <button
                onClick={() => setShowCreatePartnerModal(true)}
                className="flex items-center gap-2 px-3 py-1.5 bg-brand-600 hover:bg-brand-700 text-white text-sm rounded-lg font-medium"
              >
                <Plus className="w-4 h-4" />
                Add Partner
              </button>
            </div>
          </div>

          <div className="p-6">
            {loadingPartners ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-portal-soft" />
              </div>
            ) : partners.length === 0 ? (
              <div className="text-center py-8">
                <Building2 className="w-12 h-12 text-portal-text mx-auto mb-3" />
                <p className="text-portal-soft">No partner accounts yet</p>
                <p className="text-sm text-portal-soft mt-1">Create a partner account to give agencies access to their clients</p>
              </div>
            ) : (
              <div className="space-y-3">
                {partners.map(partner => (
                  <div
                    key={partner.id}
                    className="flex items-center justify-between p-4 bg-portal-dark rounded-xl border border-white/[0.07]"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-white truncate">{partner.company_name}</p>
                        {!partner.is_active && (
                          <span className="px-2 py-0.5 text-xs bg-red-100 text-red-600 rounded-full">Inactive</span>
                        )}
                      </div>
                      <p className="text-sm text-portal-soft truncate">{partner.full_name} - {partner.email}</p>
                      <div className="flex items-center gap-4 mt-1 text-xs text-portal-soft">
                        <span>{partner.clientCount} clients</span>
                        <span>{partner.taskCount} tasks</span>
                        {partner.unreadMessages > 0 && (
                          <span className="text-amber-600">{partner.unreadMessages} unread messages</span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 ml-4">
                      <button
                        onClick={() => openAssignClientsModal(partner)}
                        className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                        title="Assign Clients"
                      >
                        <UserPlus className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleTogglePartnerActive(partner)}
                        className={`p-2 rounded-lg transition-colors ${
                          partner.is_active
                            ? 'text-amber-600 hover:bg-amber-50'
                            : 'text-green-600 hover:bg-green-50'
                        }`}
                        title={partner.is_active ? 'Deactivate' : 'Activate'}
                      >
                        <Shield className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => setShowDeletePartnerModal({ open: true, partner })}
                        className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                        title="Delete Partner"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Activity Log - Only visible to Owners */}
      {currentUser.role === 'Owner' && (
        <ActivityLog onError={(msg) => addToast('error', msg)} />
      )}

      {/* Reset Password Modal */}
      {resetPasswordModal.open && resetPasswordModal.user && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-portal-surface rounded-2xl shadow-xl max-w-md w-full">
            <div className="p-6 border-b border-white/[0.07] flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Key className="w-5 h-5 text-amber-600" />
                <h3 className="font-semibold text-white">Reset Password</h3>
              </div>
              <button
                onClick={() => { setResetPasswordModal({ open: false, user: null }); setNewPassword(''); }}
                className="p-2 hover:bg-portal-surface2 rounded-lg"
              >
                <X className="w-5 h-5 text-portal-soft" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <p className="text-portal-soft">
                Set a new password for <strong>{resetPasswordModal.user.email}</strong>
              </p>
              <div>
                <label className="block text-sm font-medium text-portal-text mb-2">New Password</label>
                <input
                  type="text"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Enter new password"
                  className="w-full p-3 rounded-xl border border-white/[0.07] focus:ring-2 focus:ring-brand-500 outline-none"
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => { setResetPasswordModal({ open: false, user: null }); setNewPassword(''); }}
                  className="flex-1 px-4 py-3 border border-white/[0.07] text-portal-text rounded-xl font-medium hover:bg-portal-dark"
                >
                  Cancel
                </button>
                <button
                  onClick={handleResetPassword}
                  disabled={!newPassword || actionLoading}
                  className="flex-1 px-4 py-3 bg-amber-600 hover:bg-amber-700 text-white rounded-xl font-medium disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {actionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Key className="w-4 h-4" />}
                  Reset Password
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete User Modal */}
      {deleteModal.open && deleteModal.user && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-portal-surface rounded-2xl shadow-xl max-w-md w-full">
            <div className="p-6 border-b border-white/[0.07] flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Trash2 className="w-5 h-5 text-red-600" />
                <h3 className="font-semibold text-white">Delete User</h3>
              </div>
              <button
                onClick={() => setDeleteModal({ open: false, user: null })}
                className="p-2 hover:bg-portal-surface2 rounded-lg"
              >
                <X className="w-5 h-5 text-portal-soft" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div className="p-4 bg-red-50 border border-red-100 rounded-xl">
                <p className="text-red-800">
                  Are you sure you want to delete <strong>{deleteModal.user.email}</strong>?
                  This action cannot be undone.
                </p>
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => setDeleteModal({ open: false, user: null })}
                  className="flex-1 px-4 py-3 border border-white/[0.07] text-portal-text rounded-xl font-medium hover:bg-portal-dark"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDeleteUser}
                  disabled={actionLoading}
                  className="flex-1 px-4 py-3 bg-red-600 hover:bg-red-700 text-white rounded-xl font-medium disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {actionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                  Delete User
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Create Partner Modal */}
      {showCreatePartnerModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-portal-surface rounded-2xl shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-white/[0.07] flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Building2 className="w-5 h-5 text-brand-600" />
                <h3 className="font-semibold text-white">
                  {createdPartnerCreds ? 'Partner Created' : 'Create Partner Account'}
                </h3>
              </div>
              <button
                onClick={resetCreatePartnerModal}
                className="p-2 hover:bg-portal-surface2 rounded-lg"
              >
                <X className="w-5 h-5 text-portal-soft" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              {createdPartnerCreds ? (
                <>
                  <div className="p-4 bg-green-50 border border-green-100 rounded-xl">
                    <div className="flex items-center gap-2 mb-2">
                      <Check className="w-5 h-5 text-green-600" />
                      <p className="font-medium text-green-800">Partner account created successfully!</p>
                    </div>
                    <p className="text-sm text-green-700">Share these login credentials with the partner:</p>
                  </div>
                  <div className="space-y-3">
                    <div className="p-3 bg-portal-dark rounded-lg">
                      <p className="text-xs text-portal-soft mb-1">Portal URL</p>
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-mono text-portal-text">{getPartnerPortalUrl()}</p>
                        <button
                          onClick={() => { navigator.clipboard.writeText(getPartnerPortalUrl()); addToast('success', 'Copied!'); }}
                          className="p-1 text-portal-soft hover:text-portal-soft"
                        >
                          <Copy className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                    <div className="p-3 bg-portal-dark rounded-lg">
                      <p className="text-xs text-portal-soft mb-1">Email</p>
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-mono text-portal-text">{createdPartnerCreds.email}</p>
                        <button
                          onClick={() => { navigator.clipboard.writeText(createdPartnerCreds.email); addToast('success', 'Copied!'); }}
                          className="p-1 text-portal-soft hover:text-portal-soft"
                        >
                          <Copy className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                    <div className="p-3 bg-portal-dark rounded-lg">
                      <p className="text-xs text-portal-soft mb-1">Password</p>
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-mono text-portal-text">{createdPartnerCreds.password}</p>
                        <button
                          onClick={() => { navigator.clipboard.writeText(createdPartnerCreds.password); addToast('success', 'Copied!'); }}
                          className="p-1 text-portal-soft hover:text-portal-soft"
                        >
                          <Copy className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={resetCreatePartnerModal}
                    className="w-full px-4 py-3 bg-brand-600 hover:bg-brand-700 text-white rounded-xl font-medium"
                  >
                    Done
                  </button>
                </>
              ) : (
                <>
                  <div>
                    <label className="block text-sm font-medium text-portal-text mb-2">Company Name</label>
                    <input
                      type="text"
                      value={newPartner.companyName}
                      onChange={(e) => setNewPartner({ ...newPartner, companyName: e.target.value })}
                      placeholder="e.g., 10XR Agency"
                      className="w-full p-3 rounded-xl border border-white/[0.07] focus:ring-2 focus:ring-brand-500 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-portal-text mb-2">Contact Name</label>
                    <input
                      type="text"
                      value={newPartner.fullName}
                      onChange={(e) => setNewPartner({ ...newPartner, fullName: e.target.value })}
                      placeholder="e.g., John Smith"
                      className="w-full p-3 rounded-xl border border-white/[0.07] focus:ring-2 focus:ring-brand-500 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-portal-text mb-2">Email</label>
                    <input
                      type="email"
                      value={newPartner.email}
                      onChange={(e) => setNewPartner({ ...newPartner, email: e.target.value })}
                      placeholder="partner@company.com"
                      className="w-full p-3 rounded-xl border border-white/[0.07] focus:ring-2 focus:ring-brand-500 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-portal-text mb-2">Password</label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={newPartner.password}
                        onChange={(e) => setNewPartner({ ...newPartner, password: e.target.value })}
                        placeholder="Enter password"
                        className="flex-1 p-3 rounded-xl border border-white/[0.07] focus:ring-2 focus:ring-brand-500 outline-none"
                      />
                      <button
                        onClick={generatePartnerPassword}
                        className="px-3 py-2 bg-portal-surface2 hover:bg-portal-surface2 text-portal-text rounded-xl font-medium text-sm"
                      >
                        Generate
                      </button>
                    </div>
                  </div>
                  <div className="flex gap-3 pt-2">
                    <button
                      onClick={resetCreatePartnerModal}
                      className="flex-1 px-4 py-3 border border-white/[0.07] text-portal-text rounded-xl font-medium hover:bg-portal-dark"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleCreatePartner}
                      disabled={partnerActionLoading}
                      className="flex-1 px-4 py-3 bg-brand-600 hover:bg-brand-700 text-white rounded-xl font-medium disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                      {partnerActionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                      Create Partner
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Assign Clients Modal */}
      {showAssignClientsModal.open && showAssignClientsModal.partner && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-portal-surface rounded-2xl shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-white/[0.07] flex items-center justify-between">
              <div className="flex items-center gap-3">
                <UserPlus className="w-5 h-5 text-blue-600" />
                <div>
                  <h3 className="font-semibold text-white">Assign Clients</h3>
                  <p className="text-sm text-portal-soft">{showAssignClientsModal.partner.company_name}</p>
                </div>
              </div>
              <button
                onClick={() => setShowAssignClientsModal({ open: false, partner: null })}
                className="p-2 hover:bg-portal-surface2 rounded-lg"
              >
                <X className="w-5 h-5 text-portal-soft" />
              </button>
            </div>
            <div className="p-6">
              {clients.length === 0 ? (
                <p className="text-portal-soft text-center py-4">No clients available</p>
              ) : (
                <div className="space-y-2">
                  {clients.map(client => (
                    <button
                      key={client.id}
                      onClick={() => handleToggleClientAccess(client.id)}
                      className={`w-full flex items-center justify-between p-3 rounded-xl border transition-colors ${
                        partnerClientIds.includes(client.id)
                          ? 'bg-blue-50 border-blue-200'
                          : 'bg-portal-dark border-white/[0.07] hover:bg-portal-surface2'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-sm font-semibold"
                          style={{ backgroundColor: client.color || '#3b82f6' }}
                        >
                          {client.initials}
                        </div>
                        <span className="font-medium text-portal-text">{client.name}</span>
                      </div>
                      {partnerClientIds.includes(client.id) && (
                        <Check className="w-5 h-5 text-blue-600" />
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Delete Partner Modal */}
      {showDeletePartnerModal.open && showDeletePartnerModal.partner && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-portal-surface rounded-2xl shadow-xl max-w-md w-full">
            <div className="p-6 border-b border-white/[0.07] flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Trash2 className="w-5 h-5 text-red-600" />
                <h3 className="font-semibold text-white">Delete Partner</h3>
              </div>
              <button
                onClick={() => setShowDeletePartnerModal({ open: false, partner: null })}
                className="p-2 hover:bg-portal-surface2 rounded-lg"
              >
                <X className="w-5 h-5 text-portal-soft" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div className="p-4 bg-red-50 border border-red-100 rounded-xl">
                <p className="text-red-800">
                  Are you sure you want to delete <strong>{showDeletePartnerModal.partner.company_name}</strong>?
                  This will remove all their access and message history. This action cannot be undone.
                </p>
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => setShowDeletePartnerModal({ open: false, partner: null })}
                  className="flex-1 px-4 py-3 border border-white/[0.07] text-portal-text rounded-xl font-medium hover:bg-portal-dark"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDeletePartner}
                  disabled={partnerActionLoading}
                  className="flex-1 px-4 py-3 bg-red-600 hover:bg-red-700 text-white rounded-xl font-medium disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {partnerActionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                  Delete Partner
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Settings;
