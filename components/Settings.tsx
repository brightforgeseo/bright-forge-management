import React from 'react';
import { BrandingConfig, ToastType } from '../types';
import { Save, Monitor } from 'lucide-react';

interface SettingsProps {
  branding: BrandingConfig;
  setBranding: (config: BrandingConfig) => void;
  addToast: (type: ToastType, message: string) => void;
}

const Settings: React.FC<SettingsProps> = ({ branding, setBranding, addToast }) => {
  const [localConfig, setLocalConfig] = React.useState(branding);
  const [saved, setSaved] = React.useState(false);

  const handleSave = () => {
    setBranding(localConfig);
    setSaved(true);
    addToast('success', 'Settings saved successfully!');
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="p-8 max-w-3xl mx-auto space-y-8">
      <div className="space-y-2">
        <h2 className="text-3xl font-bold text-slate-900">Platform Settings</h2>
        <p className="text-slate-500">Customize the look and feel of your white-label SEO suite.</p>
      </div>

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
