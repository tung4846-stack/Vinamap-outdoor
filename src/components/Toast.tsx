import React, { useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { CheckCircle2, AlertTriangle, Info, XCircle, X } from 'lucide-react';

export type ToastType = 'success' | 'warning' | 'error' | 'info';

export interface ToastMessage {
  id: string;
  message: string;
  type: ToastType;
  duration?: number;
}

interface ToastProps {
  toasts: ToastMessage[];
  removeToast: (id: string) => void;
}

export const Toast: React.FC<ToastProps> = ({ toasts, removeToast }) => {
  return (
    <div className="fixed top-4 right-4 z-[9999] flex flex-col gap-2 max-w-sm w-full pointer-events-none">
      <AnimatePresence>
        {toasts.map((toast) => (
          <ToastItem key={toast.id} toast={toast} onClose={() => removeToast(toast.id)} />
        ))}
      </AnimatePresence>
    </div>
  );
};

const ToastItem: React.FC<{ toast: ToastMessage; onClose: () => void }> = ({ toast, onClose }) => {
  const { message, type, duration = 4000 } = toast;

  useEffect(() => {
    const timer = setTimeout(() => {
      onClose();
    }, duration);
    return () => clearTimeout(timer);
  }, [duration, onClose]);

  const icons = {
    success: <CheckCircle2 className="w-5 h-5 text-[#00FF41] shrink-0" />,
    warning: <AlertTriangle className="w-5 h-5 text-[#FFD700] shrink-0" />,
    error: <XCircle className="w-5 h-5 text-[#FF4444] shrink-0" />,
    info: <Info className="w-5 h-5 text-sky-400 shrink-0" />,
  };

  const bgColors = {
    success: 'bg-black/95 border-2 border-[#00FF41] text-white shadow-[0_0_15px_rgba(0,255,65,0.1)]',
    warning: 'bg-black/95 border-2 border-[#FFD700] text-white shadow-[0_0_15px_rgba(255,215,0,0.1)]',
    error: 'bg-black/95 border-2 border-[#FF4444] text-white shadow-[0_0_15px_rgba(255,68,68,0.1)]',
    info: 'bg-black/95 border-2 border-sky-400 text-white shadow-[0_0_15px_rgba(56,189,248,0.1)]',
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: -20, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.15 } }}
      className={`p-4 rounded-xl shadow-2xl flex items-start gap-3 pointer-events-auto ${bgColors[type]}`}
    >
      {icons[type]}
      <div className="flex-1 text-sm font-sans font-bold leading-snug">{message}</div>
      <button
        onClick={onClose}
        className="text-gray-400 hover:text-white transition-colors shrink-0 p-0.5 rounded-md hover:bg-gray-800"
      >
        <X className="w-4 h-4" />
      </button>
    </motion.div>
  );
};
