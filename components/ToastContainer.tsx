import React, { useEffect } from 'react';
import { CheckCircle, AlertCircle, Info, X } from 'lucide-react';
import { ToastNotification } from '../types';

interface ToastContainerProps {
  toasts: ToastNotification[];
  removeToast: (id: string) => void;
}

const ToastContainer: React.FC<ToastContainerProps> = ({ toasts, removeToast }) => {
  return (
    <div className="fixed bottom-4 left-4 right-4 sm:left-auto sm:right-6 sm:bottom-6 z-50 flex flex-col gap-2 sm:gap-3 pointer-events-none">
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onRemove={() => removeToast(toast.id)} />
      ))}
    </div>
  );
};

const ToastItem: React.FC<{ toast: ToastNotification; onRemove: () => void }> = ({ toast, onRemove }) => {
  useEffect(() => {
    const timer = setTimeout(() => {
      onRemove();
    }, 4000);
    return () => clearTimeout(timer);
  }, [toast.id, onRemove]);

  const getStyles = () => {
    switch (toast.type) {
      case 'success':
        return 'bg-white border-l-4 border-green-500 text-slate-800 shadow-lg shadow-green-900/5';
      case 'error':
        return 'bg-white border-l-4 border-red-500 text-slate-800 shadow-lg shadow-red-900/5';
      case 'info':
      default:
        return 'bg-slate-800 border-l-4 border-brand-500 text-white shadow-lg shadow-slate-900/20';
    }
  };

  const getIcon = () => {
    switch (toast.type) {
      case 'success': return <CheckCircle className="w-5 h-5 text-green-500" />;
      case 'error': return <AlertCircle className="w-5 h-5 text-red-500" />;
      default: return <Info className="w-5 h-5 text-brand-400" />;
    }
  };

  return (
    <div className={`pointer-events-auto w-full sm:min-w-[300px] sm:w-auto max-w-md p-3 sm:p-4 rounded-lg flex items-start gap-2 sm:gap-3 transform transition-all duration-300 animate-slideIn ${getStyles()}`}>
      <div className="mt-0.5 flex-shrink-0">{getIcon()}</div>
      <p className="text-sm font-medium flex-1 break-words">{toast.message}</p>
      <button onClick={onRemove} className="opacity-50 hover:opacity-100 transition-opacity flex-shrink-0">
        <X className="w-4 h-4" />
      </button>
    </div>
  );
};

export default ToastContainer;