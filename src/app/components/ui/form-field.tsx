import { type ReactNode, type InputHTMLAttributes, forwardRef } from 'react';
import { Input } from './input';
import { Label } from './label';

/**
 * Reusable form field with label, input, and optional error message.
 */

interface FormFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
  /** If true, shows a red asterisk next to the label */
  required?: boolean;
  /** Override the input with a custom element (e.g. select, textarea) */
  children?: ReactNode;
  /** Additional class on the wrapper div */
  className?: string;
}

export const FormField = forwardRef<HTMLInputElement, FormFieldProps>(
  ({ label, error, required, children, className = '', ...inputProps }, ref) => (
    <div className={`space-y-1.5 ${className}`}>
      <Label className="text-sm font-medium">
        {label}
        {required && <span className="text-red-500 ml-0.5">*</span>}
      </Label>
      {children ?? <Input ref={ref} {...inputProps} className={error ? 'border-red-400' : ''} />}
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  ),
);

FormField.displayName = 'FormField';
export default FormField;
