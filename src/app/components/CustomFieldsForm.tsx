import React from 'react';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';

export interface CustomFieldDefinition {
  key: string;
  label: string;
  type: 'text' | 'number' | 'date' | 'select' | 'multiSelect' | 'boolean' | 'currency' | 'url' | 'email' | 'phone';
  value?: any;
  options?: string[];
  required?: boolean;
  placeholder?: string;
}

interface CustomFieldsFormProps {
  fields: CustomFieldDefinition[];
  values: Record<string, any>;
  onChange: (key: string, value: any) => void;
  className?: string;
}

/**
 * Reusable component for rendering dynamic custom fields
 * Used by InventoryItem forms and any other entity with custom fields
 */
export function CustomFieldsForm({ fields, values, onChange, className = '' }: CustomFieldsFormProps) {
  if (!fields || fields.length === 0) return null;

  return (
    <div className={`space-y-4 ${className}`}>
      <h4 className="text-sm font-semibold text-gray-700 border-b pb-2">Custom Fields</h4>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {fields.map((field) => (
          <div key={field.key}>
            <Label htmlFor={`custom-${field.key}`}>
              {field.label}
              {field.required && <span className="text-red-500 ml-1">*</span>}
            </Label>
            {renderField(field, values[field.key], (val) => onChange(field.key, val))}
          </div>
        ))}
      </div>
    </div>
  );
}

function renderField(
  field: CustomFieldDefinition,
  value: any,
  onChange: (value: any) => void
) {
  switch (field.type) {
    case 'text':
    case 'url':
    case 'email':
    case 'phone':
      return (
        <Input
          id={`custom-${field.key}`}
          type={field.type === 'email' ? 'email' : field.type === 'url' ? 'url' : field.type === 'phone' ? 'tel' : 'text'}
          value={value || ''}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder || `Enter ${field.label.toLowerCase()}`}
        />
      );

    case 'number':
    case 'currency':
      return (
        <Input
          id={`custom-${field.key}`}
          type="number"
          value={value || ''}
          onChange={(e) => onChange(e.target.value ? Number(e.target.value) : '')}
          placeholder={field.placeholder || `Enter ${field.label.toLowerCase()}`}
        />
      );

    case 'date':
      return (
        <Input
          id={`custom-${field.key}`}
          type="date"
          value={value || ''}
          onChange={(e) => onChange(e.target.value)}
        />
      );

    case 'boolean':
      return (
        <div className="flex items-center gap-2 mt-1">
          <input
            id={`custom-${field.key}`}
            type="checkbox"
            checked={!!value}
            onChange={(e) => onChange(e.target.checked)}
            className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          />
          <label htmlFor={`custom-${field.key}`} className="text-sm text-gray-600">
            {field.label}
          </label>
        </div>
      );

    case 'select':
      return (
        <Select value={value || ''} onValueChange={onChange}>
          <SelectTrigger>
            <SelectValue placeholder={`Select ${field.label.toLowerCase()}`} />
          </SelectTrigger>
          <SelectContent>
            {(field.options || []).map((option) => (
              <SelectItem key={option} value={option}>
                {option}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      );

    case 'multiSelect':
      return (
        <div className="flex flex-wrap gap-2 mt-1">
          {(field.options || []).map((option) => {
            const selected = Array.isArray(value) && value.includes(option);
            return (
              <button
                key={option}
                type="button"
                onClick={() => {
                  const current = Array.isArray(value) ? value : [];
                  if (selected) {
                    onChange(current.filter((v: string) => v !== option));
                  } else {
                    onChange([...current, option]);
                  }
                }}
                className={`px-3 py-1 text-xs rounded-full border transition-colors ${
                  selected
                    ? 'bg-blue-100 border-blue-400 text-blue-700'
                    : 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100'
                }`}
              >
                {option}
              </button>
            );
          })}
        </div>
      );

    default:
      return (
        <Input
          id={`custom-${field.key}`}
          value={value || ''}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder || `Enter ${field.label.toLowerCase()}`}
        />
      );
  }
}

export default CustomFieldsForm;
