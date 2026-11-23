// frontend/src/features/analytics/components/DataTableWithFilter.jsx
import React, { useState } from 'react';
import { Search, ChevronLeft, ChevronRight, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';

export default function DataTableWithFilter({
  columns = [], // [{ key, label, sortable, render, className }]
  data = [],
  totalCount,
  page = 1,
  pageSize = 10,
  onPageChange,
  search = '',
  onSearchChange,
  searchPlaceholder = 'Search…',
  filtersNode,
  isLoading = false,
  emptyMessage = 'No data available for the selected criteria.',
  className = '',
}) {
  const [sortKey, setSortKey] = useState(null);
  const [sortOrder, setSortOrder] = useState('desc'); // 'asc' | 'desc'

  const handleSort = (key) => {
    if (sortKey === key) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortOrder('desc');
    }
  };

  // Client-side sorting if needed
  let sortedData = [...data];
  if (sortKey) {
    sortedData.sort((a, b) => {
      const aVal = a[sortKey];
      const bVal = b[sortKey];
      if (aVal === bVal) return 0;
      if (aVal === null || aVal === undefined) return 1;
      if (bVal === null || bVal === undefined) return -1;
      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return sortOrder === 'asc' ? aVal - bVal : bVal - aVal;
      }
      return sortOrder === 'asc'
        ? String(aVal).localeCompare(String(bVal))
        : String(bVal).localeCompare(String(aVal));
    });
  }

  const effectiveTotal = totalCount !== undefined ? totalCount : data.length;
  const totalPages = Math.max(1, Math.ceil(effectiveTotal / pageSize));

  return (
    <div className={`card overflow-hidden ${className}`}>
      {/* Header controls: Search & Custom filters */}
      <div className="p-3.5 border-b border-surface-200 bg-surface-50/50 flex flex-wrap items-center justify-between gap-3">
        {onSearchChange ? (
          <div className="relative min-w-[220px] max-w-sm flex-1">
            <Search className="w-3.5 h-3.5 text-surface-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder={searchPlaceholder}
              className="w-full pl-8 pr-3 py-1.5 text-xs bg-white border border-surface-200 rounded-lg text-surface-800 placeholder-surface-400 focus:outline-hidden focus:ring-1 focus:ring-brand-500"
            />
          </div>
        ) : (
          <div />
        )}

        {filtersNode && <div className="flex items-center gap-2">{filtersNode}</div>}
      </div>

      {/* Table Body */}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs text-surface-600">
          <thead className="bg-surface-50 text-surface-500 border-b border-surface-200 uppercase text-2xs font-semibold tracking-wider">
            <tr>
              {columns.map((col) => (
                <th
                  key={col.key}
                  className={`px-4 py-2.5 ${col.className || ''}`}
                  onClick={() => col.sortable && handleSort(col.key)}
                >
                  <div
                    className={`flex items-center gap-1 ${
                      col.sortable ? 'cursor-pointer select-none hover:text-surface-800' : ''
                    }`}
                  >
                    <span>{col.label}</span>
                    {col.sortable && (
                      <span className="text-surface-400">
                        {sortKey === col.key ? (
                          sortOrder === 'asc' ? (
                            <ArrowUp className="w-3 h-3 text-brand-600" />
                          ) : (
                            <ArrowDown className="w-3 h-3 text-brand-600" />
                          )
                        ) : (
                          <ArrowUpDown className="w-3 h-3" />
                        )}
                      </span>
                    )}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-surface-100">
            {isLoading ? (
              <tr>
                <td colSpan={columns.length} className="px-4 py-8 text-center text-surface-400">
                  Loading data…
                </td>
              </tr>
            ) : sortedData.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="px-4 py-8 text-center text-surface-400">
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              sortedData.map((row, idx) => (
                <tr key={row.id || idx} className="hover:bg-surface-50/70 transition-colors">
                  {columns.map((col) => (
                    <td key={col.key} className={`px-4 py-2.5 ${col.className || ''}`}>
                      {col.render ? col.render(row[col.key], row) : (row[col.key] ?? '—')}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination Footer */}
      {onPageChange && (
        <div className="p-3 border-t border-surface-200 bg-surface-50/30 flex items-center justify-between text-xs text-surface-500">
          <div>
            Showing{' '}
            <span className="font-semibold text-surface-800">
              {effectiveTotal > 0 ? (page - 1) * pageSize + 1 : 0}
            </span>{' '}
            to{' '}
            <span className="font-semibold text-surface-800">
              {Math.min(page * pageSize, effectiveTotal)}
            </span>{' '}
            of <span className="font-semibold text-surface-800">{effectiveTotal}</span> results
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              disabled={page <= 1 || isLoading}
              onClick={() => onPageChange(page - 1)}
              className="p-1.5 rounded-lg border border-surface-200 bg-white text-surface-600 hover:text-surface-900 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
            <span className="px-2 text-surface-700 font-medium">
              Page {page} of {totalPages}
            </span>
            <button
              type="button"
              disabled={page >= totalPages || isLoading}
              onClick={() => onPageChange(page + 1)}
              className="p-1.5 rounded-lg border border-surface-200 bg-white text-surface-600 hover:text-surface-900 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
