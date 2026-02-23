import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';
import { X, CheckCircle2, AlertCircle, AlertTriangle, Info } from 'lucide-react';

/* ── Types ─────────────────────────────────────────────────── */

type ToastVariant = 'success' | 'error' | 'warning' | 'info';

interface Toast {
  id: string;
  message: string;
  variant: ToastVariant;
  duration: number;
}

interface ToastContextValue {
  toasts: Toast[];
  addToast: (message: string, variant?: ToastVariant, duration?: number) => void;
  removeToast: (id: string) => void;
}

/* ── Context ───────────────────────────────────────────────── */

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>');
  return ctx;
}

/* ── Provider ──────────────────────────────────────────────── */

let toastCounter = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const addToast = useCallback((message: string, variant: ToastVariant = 'info', duration = 4000) => {
    const id = `toast-${++toastCounter}`;
    setToasts(prev => [...prev, { id, message, variant, duration }]);
    if (duration > 0) {
      setTimeout(() => removeToast(id), duration);
    }
  }, [removeToast]);

  return (
    <ToastContext.Provider value={{ toasts, addToast, removeToast }}>
      {children}
      <ToastContainer toasts={toasts} onDismiss={removeToast} />
    </ToastContext.Provider>
  );
}

/* ── Renderer ──────────────────────────────────────────────── */

const VARIANT_STYLES: Record<ToastVariant, string> = {
  success: 'bg-green-50 border-green-300 text-green-800',
  error:   'bg-red-50 border-red-300 text-red-800',
  warning: 'bg-yellow-50 border-yellow-300 text-yellow-800',
  info:    'bg-blue-50 border-blue-300 text-blue-800',
};

const VARIANT_ICONS: Record<ToastVariant, typeof CheckCircle2> = {
  success: CheckCircle2,
  error:   AlertCircle,
  warning: AlertTriangle,
  info:    Info,
};

function ToastContainer({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: string) => void }) {
  if (toasts.length === 0) return null;

  return (
    <div className="fixed top-4 right-4 z-[9999] flex flex-col gap-2 max-w-sm w-full pointer-events-none">
      {toasts.map(toast => {
        const Icon = VARIANT_ICONS[toast.variant];
        return (
          <div
            key={toast.id}
            className={`pointer-events-auto flex items-start gap-3 p-4 rounded-lg border shadow-lg animate-in slide-in-from-right fade-in duration-200 ${VARIANT_STYLES[toast.variant]}`}
          >
            <Icon className="h-5 w-5 mt-0.5 shrink-0" />
            <p className="text-sm flex-1">{toast.message}</p>
            <button onClick={() => onDismiss(toast.id)} className="shrink-0 opacity-60 hover:opacity-100">
              <X className="h-4 w-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
