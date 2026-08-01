import { cn } from '@/lib/utils';
import {
  type ColumnDef,
  type RowData,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from '@tanstack/react-table';
import type * as React from 'react';

declare module '@tanstack/react-table' {
  interface ColumnMeta<TData extends RowData, TValue> {
    align?: 'left' | 'center' | 'right';
    hideOnMobile?: boolean;
    className?: string;
  }
}

export type { ColumnDef };

export function DataTable<TData>({
  columns,
  data,
  isLoading,
  error,
  errorMessage = 'Failed to load data',
  emptyIcon,
  emptyTitle = 'No data',
  emptyDescription,
  getRowId,
  onRowClick,
}: Readonly<{
  columns: ColumnDef<TData, unknown>[];
  data: TData[];
  isLoading?: boolean;
  error?: unknown;
  errorMessage?: string;
  emptyIcon?: React.ReactNode;
  emptyTitle?: string;
  emptyDescription?: string;
  getRowId?: (row: TData) => string;
  onRowClick?: (row: TData) => void;
}>) {
  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    ...(getRowId ? { getRowId: (row: TData) => getRowId(row) } : {}),
  });

  let body: React.ReactNode;
  if (isLoading) {
    body = <div className="flex items-center justify-center py-12 text-muted-foreground">Loading…</div>;
  } else if (error) {
    body = <div className="flex items-center justify-center py-12 text-destructive">{errorMessage}</div>;
  } else if (data.length === 0) {
    body = (
      <div className="flex flex-col items-center justify-center gap-2 py-12 text-muted-foreground">
        {emptyIcon}
        <p className="font-medium">{emptyTitle}</p>
        {emptyDescription && <p className="text-sm">{emptyDescription}</p>}
      </div>
    );
  } else {
    body = (
      <table className="w-full text-sm">
        <thead>
          {table.getHeaderGroups().map((headerGroup) => (
            <tr key={headerGroup.id} className="border-b border-border bg-muted/50">
              {headerGroup.headers.map((header) => (
                <th
                  key={header.id}
                  className={cn(
                    'px-4 py-2.5 font-medium text-muted-foreground',
                    header.column.columnDef.meta?.align === 'right' && 'text-right',
                    header.column.columnDef.meta?.align === 'center' && 'text-center',
                    !header.column.columnDef.meta?.align && 'text-left',
                    header.column.columnDef.meta?.hideOnMobile && 'hidden md:table-cell',
                    header.column.columnDef.meta?.className,
                  )}
                >
                  {header.isPlaceholder
                    ? null
                    : flexRender(header.column.columnDef.header, header.getContext())}
                </th>
              ))}
            </tr>
          ))}
        </thead>
        <tbody>
          {table.getRowModel().rows.map((row) => (
            <tr
              key={row.id}
              className={cn(
                'border-b border-border last:border-0 hover:bg-muted/30',
                onRowClick && 'cursor-pointer',
              )}
              onClick={() => onRowClick?.(row.original)}
            >
              {row.getVisibleCells().map((cell) => (
                <td
                  key={cell.id}
                  className={cn(
                    'px-4 py-2.5',
                    cell.column.columnDef.meta?.align === 'right' && 'text-right',
                    cell.column.columnDef.meta?.align === 'center' && 'text-center',
                    cell.column.columnDef.meta?.hideOnMobile && 'hidden md:table-cell',
                    cell.column.columnDef.meta?.className,
                  )}
                >
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    );
  }

  return <div className="rounded-lg border border-border overflow-auto">{body}</div>;
}
