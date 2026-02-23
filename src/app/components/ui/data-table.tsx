import { type ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from './button';

/**
 * Lightweight reusable data table.
 *
 * Usage:
 *   <DataTable
 *     columns={[
 *       { key: 'name',  header: 'Name' },
 *       { key: 'email', header: 'Email' },
 *       { key: 'actions', header: '', render: (row) => <Button>Edit</Button> },
 *     ]}
 *     rows={users}
 *     loading={loading}
 *     emptyMessage="No users found"
 *   />
 */

export interface Column<T> {
  key: string;
  header: string;
  /** Custom cell renderer. Falls back to `String(row[key])`. */
  render?: (row: T, index: number) => ReactNode;
  className?: string;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  rows: T[];
  loading?: boolean;
  emptyIcon?: ReactNode;
  emptyMessage?: string;
  /** Called when clicking a row (optional) */
  onRowClick?: (row: T) => void;
  /** Pagination */
  page?: number;
  totalPages?: number;
  onPageChange?: (page: number) => void;
}

export function DataTable<T extends Record<string, any>>({
  columns,
  rows,
  loading = false,
  emptyIcon,
  emptyMessage = 'No data available',
  onRowClick,
  page,
  totalPages,
  onPageChange,
}: DataTableProps<T>) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="text-center py-12 text-gray-500">
        {emptyIcon}
        <p className="mt-2 text-sm">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-gray-50">
              {columns.map(col => (
                <th key={col.key} className={`px-4 py-3 text-left font-medium text-gray-600 ${col.className || ''}`}>
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, idx) => (
              <tr
                key={(row as any)._id || (row as any).id || idx}
                className={`border-b last:border-0 ${onRowClick ? 'cursor-pointer hover:bg-gray-50' : ''}`}
                onClick={() => onRowClick?.(row)}
              >
                {columns.map(col => (
                  <td key={col.key} className={`px-4 py-3 ${col.className || ''}`}>
                    {col.render ? col.render(row, idx) : String(row[col.key] ?? '')}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages != null && totalPages > 1 && onPageChange && (
        <div className="flex items-center justify-between px-4 py-3 border-t">
          <span className="text-sm text-gray-500">
            Page {page} of {totalPages}
          </span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page === 1} onClick={() => onPageChange(page! - 1)}>
              Previous
            </Button>
            <Button variant="outline" size="sm" disabled={page === totalPages} onClick={() => onPageChange(page! + 1)}>
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

export default DataTable;
