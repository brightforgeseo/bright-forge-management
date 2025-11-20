import React from 'react';
import { BrandingConfig, ToastType, User } from '../types';
import { Save, Monitor, User as UserIcon, Upload, Loader2 } from 'lucide-react';
import { supabase } from '../lib/supabaseClient';
import { uploadFile } from '../services/databaseService';

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
        <h2 className="text-3xl font-bold text-slate-900">Settings</h2>
        <p className="text-slate-500">Manage your profile and platform settings.</p>
      </div>

      {/* Profile Settings */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="p-6 border-b border-slate-100 bg-slate-50 flex items-center gap-3">
          <UserIcon className="w-5 h-5 text-slate-500" />
          <h3 className="font-semibold text-slate-900">Profile Settings</h3>
        </div>

        <div className="p-8 space-y-6">
          {/* Avatar Upload */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-3">Profile Picture</label>
            <div className="flex items-center gap-6">
              <div className="relative group">
                {avatarUrl ? (
                  <img
                    src={avatarUrl}
                    alt="Profile"
                    className="w-24 h-24 rounded-full object-cover border-4 border-slate-100"
                  />
                ) : (
                  <div className="w-24 h-24 rounded-full bg-slate-200 flex items-center justify-center border-4 border-slate-100">
                    <UserIcon className="w-12 h-12 text-slate-400" />
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
                  className="flex items-center gap-2 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-medium transition-colors disabled:opacity-50"
                >
                  <Upload className="w-4 h-4" />
                  {isUploadingAvatar ? 'Uploading...' : 'Upload Photo'}
                </button>
                <p className="text-xs text-slate-500 mt-2">JPG, PNG or GIF. Max 5MB.</p>
              </div>
            </div>
          </div>

          {/* Full Name */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Full Name</label>
            <input
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="w-full p-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-brand-500 outline-none"
              placeholder="Enter your full name"
            />
          </div>

          {/* Email (read-only) */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Email</label>
            <input
              type="email"
              value={currentUser.email || ''}
              disabled
              className="w-full p-3 rounded-xl border border-slate-200 bg-slate-50 text-slate-500 cursor-not-allowed"
            />
            <p className="text-xs text-slate-400 mt-2">Email cannot be changed.</p>
          </div>

          {/* Role (read-only) */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Role</label>
            <input
              type="text"
              value={currentUser.role}
              disabled
              className="w-full p-3 rounded-xl border border-slate-200 bg-slate-50 text-slate-500 cursor-not-allowed"
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

      {/* Platform Branding */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="p-6 border-b border-slate-100 bg-slate-50 flex items-center gap-3">
          <Monitor className="w-5 h-5 text-slate-500" />
          <h3 className="font-semibold text-slate-900">Branding Configuration</h3>
        </div>
        
        <div className="p-8 space-y-6">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Platform Name</label>
            <input
              type="text"
              value={localConfig.companyName}
              onChange={(e) => setLocalConfig({ ...localConfig, companyName: e.target.value })}
              className="w-full p-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-brand-500 outline-none"
            />
            <p className="text-xs text-slate-400 mt-2">This name will appear in the sidebar and browser tab.</p>
          </div>

          <div className="flex items-center gap-4 p-4 bg-brand-50 rounded-xl border border-brand-100 text-brand-800">
             <div className="w-10 h-10 bg-white rounded-lg flex items-center justify-center shadow-sm">
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
    </div>
  );
};

export default Settings;
