import React, { useState, useRef } from 'react';
import {
  User,
  Mail,
  Building2,
  Camera,
  Check,
  Loader2,
  Link2,
  Unlink,
  Shield,
  AlertCircle,
} from 'lucide-react';
import { PartnerAccount } from '../../types-portal';
import { ToastType } from '../../types';
import { updatePartnerAccount, disconnectEmail } from '../../services/clientPortalService';
import { uploadFile } from '../../services/databaseService';
import EmailConnectionModal from './EmailConnectionModal';

interface ClientPortalSettingsProps {
  partnerAccount: PartnerAccount;
  addToast: (type: ToastType, message: string) => void;
  onAccountUpdated: (account: PartnerAccount) => void;
}

const ClientPortalSettings: React.FC<ClientPortalSettingsProps> = ({
  partnerAccount,
  addToast,
  onAccountUpdated,
}) => {
  const [fullName, setFullName] = useState(partnerAccount.full_name);
  const [companyName, setCompanyName] = useState(partnerAccount.company_name);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [isDisconnecting, setIsDisconnecting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSave = async () => {
    if (!fullName.trim() || !companyName.trim()) {
      addToast('error', 'Please fill in all fields');
      return;
    }

    setIsSaving(true);
    try {
      const success = await updatePartnerAccount(partnerAccount.id, {
        full_name: fullName.trim(),
        company_name: companyName.trim(),
      });

      if (success) {
        onAccountUpdated({
          ...partnerAccount,
          full_name: fullName.trim(),
          company_name: companyName.trim(),
        });
        addToast('success', 'Settings saved successfully');
      } else {
        addToast('error', 'Failed to save settings');
      }
    } catch (err) {
      console.error('Error saving settings:', err);
      addToast('error', 'Failed to save settings');
    } finally {
      setIsSaving(false);
    }
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      addToast('error', 'Please select an image file');
      return;
    }

    setIsUploadingAvatar(true);
    try {
      const url = await uploadFile(file, 'avatars');
      if (url) {
        const success = await updatePartnerAccount(partnerAccount.id, {
          avatar_url: url,
        });

        if (success) {
          onAccountUpdated({
            ...partnerAccount,
            avatar_url: url,
          });
          addToast('success', 'Avatar updated');
        }
      }
    } catch (err) {
      console.error('Error uploading avatar:', err);
      addToast('error', 'Failed to upload avatar');
    } finally {
      setIsUploadingAvatar(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleDisconnectEmail = async () => {
    if (!confirm('Are you sure you want to disconnect your email account?')) {
      return;
    }

    setIsDisconnecting(true);
    try {
      const success = await disconnectEmail(partnerAccount.id);
      if (success) {
        onAccountUpdated({
          ...partnerAccount,
          email_provider: undefined,
          email_address: undefined,
        });
        addToast('success', 'Email disconnected');
      } else {
        addToast('error', 'Failed to disconnect email');
      }
    } catch (err) {
      console.error('Error disconnecting email:', err);
      addToast('error', 'Failed to disconnect email');
    } finally {
      setIsDisconnecting(false);
    }
  };

  const handleEmailConnected = (provider: 'gmail' | 'outlook', email: string) => {
    onAccountUpdated({
      ...partnerAccount,
      email_provider: provider,
      email_address: email,
    });
    setShowEmailModal(false);
  };

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map((word) => word[0])
      .join('')
      .substring(0, 2)
      .toUpperCase();
  };

  return (
    <div className="p-6 lg:p-8 max-w-3xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-white">Settings</h1>
        <p className="text-zinc-400 mt-1">Manage your account and email settings</p>
      </div>

      {/* Profile Section */}
      <div className="bg-zinc-900 rounded-xl border border-zinc-800 overflow-hidden">
        <div className="p-6 border-b border-zinc-800">
          <h2 className="text-lg font-semibold text-white flex items-center gap-2">
            <User className="w-5 h-5 text-orange-400" />
            Profile
          </h2>
        </div>

        <div className="p-6 space-y-6">
          {/* Avatar */}
          <div className="flex items-center gap-6">
            <div className="relative">
              {partnerAccount.avatar_url ? (
                <img
                  src={partnerAccount.avatar_url}
                  alt={partnerAccount.company_name}
                  className="w-20 h-20 rounded-xl object-cover"
                />
              ) : (
                <div className="w-20 h-20 rounded-xl bg-zinc-700 flex items-center justify-center text-white font-bold text-2xl">
                  {getInitials(partnerAccount.company_name)}
                </div>
              )}
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleAvatarUpload}
                accept="image/*"
                className="hidden"
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploadingAvatar}
                className="absolute -bottom-2 -right-2 w-8 h-8 bg-orange-400 rounded-lg flex items-center justify-center text-zinc-900 hover:bg-orange-500 transition-colors disabled:opacity-50"
              >
                {isUploadingAvatar ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Camera className="w-4 h-4" />
                )}
              </button>
            </div>
            <div>
              <p className="text-white font-medium">{partnerAccount.company_name}</p>
              <p className="text-sm text-zinc-400">{partnerAccount.email}</p>
            </div>
          </div>

          {/* Form Fields */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-2">
                Full Name
              </label>
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="w-full px-4 py-3 bg-zinc-800 border border-zinc-700 rounded-xl text-white placeholder-zinc-500 focus:outline-none focus:border-orange-400 transition-colors"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-2">
                Company Name
              </label>
              <input
                type="text"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                className="w-full px-4 py-3 bg-zinc-800 border border-zinc-700 rounded-xl text-white placeholder-zinc-500 focus:outline-none focus:border-orange-400 transition-colors"
              />
            </div>
          </div>

          <button
            onClick={handleSave}
            disabled={isSaving}
            className="flex items-center gap-2 px-6 py-2.5 bg-orange-400 hover:bg-orange-500 text-zinc-900 font-semibold rounded-xl transition-colors disabled:opacity-50"
          >
            {isSaving ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Check className="w-4 h-4" />
            )}
            Save Changes
          </button>
        </div>
      </div>

      {/* Email Integration Section */}
      <div className="bg-zinc-900 rounded-xl border border-zinc-800 overflow-hidden">
        <div className="p-6 border-b border-zinc-800">
          <h2 className="text-lg font-semibold text-white flex items-center gap-2">
            <Mail className="w-5 h-5 text-orange-400" />
            Email Integration
          </h2>
        </div>

        <div className="p-6">
          {partnerAccount.email_provider && partnerAccount.email_address ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between p-4 bg-zinc-800/50 rounded-xl border border-zinc-700">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-lg bg-emerald-500/20 flex items-center justify-center">
                    <Check className="w-5 h-5 text-emerald-400" />
                  </div>
                  <div>
                    <p className="font-medium text-white">
                      {partnerAccount.email_provider === 'gmail' ? 'Gmail' : 'Outlook'} Connected
                    </p>
                    <p className="text-sm text-zinc-400">{partnerAccount.email_address}</p>
                  </div>
                </div>
                <button
                  onClick={handleDisconnectEmail}
                  disabled={isDisconnecting}
                  className="flex items-center gap-2 px-4 py-2 text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-lg transition-colors disabled:opacity-50"
                >
                  {isDisconnecting ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Unlink className="w-4 h-4" />
                  )}
                  Disconnect
                </button>
              </div>

              <div className="p-4 bg-zinc-800/30 rounded-xl border border-zinc-700/50">
                <div className="flex items-start gap-3">
                  <Shield className="w-5 h-5 text-zinc-500 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm text-zinc-400">
                      Your email is connected securely. We only use it to send emails on your behalf
                      when you click "Send Email" on a task. We never read your inbox.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="p-4 bg-orange-500/10 border border-orange-500/20 rounded-xl flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-orange-400 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-orange-400 font-medium">No email connected</p>
                  <p className="text-sm text-orange-400/70 mt-1">
                    Connect your Gmail or Outlook account to send emails directly to clients.
                  </p>
                </div>
              </div>

              <button
                onClick={() => setShowEmailModal(true)}
                className="flex items-center gap-2 px-6 py-3 bg-zinc-800 hover:bg-zinc-700 text-white font-medium rounded-xl border border-zinc-700 transition-colors"
              >
                <Link2 className="w-5 h-5" />
                Connect Email Account
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Account Info */}
      <div className="bg-zinc-900 rounded-xl border border-zinc-800 overflow-hidden">
        <div className="p-6 border-b border-zinc-800">
          <h2 className="text-lg font-semibold text-white flex items-center gap-2">
            <Building2 className="w-5 h-5 text-orange-400" />
            Account Information
          </h2>
        </div>

        <div className="p-6 space-y-4">
          <div className="flex justify-between py-3 border-b border-zinc-800">
            <span className="text-zinc-400">Account Email</span>
            <span className="text-white">{partnerAccount.email}</span>
          </div>
          <div className="flex justify-between py-3 border-b border-zinc-800">
            <span className="text-zinc-400">Account Status</span>
            <span className={partnerAccount.is_active ? 'text-emerald-400' : 'text-red-400'}>
              {partnerAccount.is_active ? 'Active' : 'Inactive'}
            </span>
          </div>
          <div className="flex justify-between py-3 border-b border-zinc-800">
            <span className="text-zinc-400">Member Since</span>
            <span className="text-white">
              {new Date(partnerAccount.created_at).toLocaleDateString()}
            </span>
          </div>
          {partnerAccount.last_login_at && (
            <div className="flex justify-between py-3">
              <span className="text-zinc-400">Last Login</span>
              <span className="text-white">
                {new Date(partnerAccount.last_login_at).toLocaleString()}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Email Connection Modal */}
      <EmailConnectionModal
        isOpen={showEmailModal}
        onClose={() => setShowEmailModal(false)}
        partnerAccount={partnerAccount}
        onConnected={handleEmailConnected}
        addToast={addToast}
      />
    </div>
  );
};

export default ClientPortalSettings;
