import { type ReactNode } from 'react';
import { X } from 'lucide-react';
import { Card } from './card';
import { Button } from './button';

/**
 * Reusable modal that works without Radix.
 * Uses a simple portal-free overlay pattern.
 */

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  /** Max width class, default "max-w-lg" */
  maxWidth?: string;
  /** Footer actions */
  footer?: ReactNode;
}

export function Modal({ open, onClose, title, description, children, maxWidth = 'max-w-lg', footer }: ModalProps) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <Card
        className={`w-full ${maxWidth} bg-white shadow-xl`}
        onClick={(e: React.MouseEvent) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 pb-0">
          <div>
            <h3 className="text-lg font-semibold">{title}</h3>
            {description && <p className="text-sm text-gray-500 mt-1">{description}</p>}
          </div>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Body */}
        <div className="p-6">{children}</div>

        {/* Footer */}
        {footer && (
          <div className="flex justify-end gap-2 px-6 pb-6 pt-0">{footer}</div>
        )}
      </Card>
    </div>
  );
}

export default Modal;
