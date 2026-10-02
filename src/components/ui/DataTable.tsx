import type { ReactNode } from 'react'
import { ChevronDownIcon, ChevronUpIcon, SortIcon } from '../icons'
import { EmptyState } from './states'

export interface Column<T> {
  key: string
  header: string
  align?: 'left' | 'right' | 'center'
  sortable?: boolean
  render: (row: T) => ReactNode
  hideOnMobile?: boolean
}

interface DataTableProps<T> {
  columns: Column<T>[]
  rows: T[]
  rowKey: (row: T) => string
  onRowClick?: (row: T) => void
  sort?: { key: string; dir: 'asc' | 'desc' }
  onSortChange?: (key: string) => void
  emptyTitle?: string
  emptyDesc?: string
}

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  onRowClick,
  sort,
  onSortChange,
  emptyTitle = 'No rows',
  emptyDesc,
}: DataTableProps<T>) {
  if (rows.length === 0) {
    return <EmptyState title={emptyTitle} desc={emptyDesc} />
  }

  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            {columns.map((c) => (
              <th
                key={c.key}
                style={{
                  textAlign: c.align ?? 'left',
                  display: c.hideOnMobile ? undefined : undefined,
                }}
                className={c.hideOnMobile ? 'hide-sm' : undefined}
              >
                {c.sortable && onSortChange ? (
                  <button
                    onClick={() => onSortChange(c.key)}
                    className="row"
                    style={{ gap: 5, fontWeight: 600, color: 'inherit', fontSize: 'inherit' }}
                  >
                    {c.header}
                    {sort?.key === c.key ? (
                      sort.dir === 'asc' ? (
                        <ChevronUpIcon size={13} />
                      ) : (
                        <ChevronDownIcon size={13} />
                      )
                    ) : (
                      <SortIcon size={12} style={{ opacity: 0.4 }} />
                    )}
                  </button>
                ) : (
                  c.header
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={rowKey(row)}
              className={onRowClick ? 'clickable' : undefined}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
            >
              {columns.map((c) => (
                <td
                  key={c.key}
                  style={{ textAlign: c.align ?? 'left' }}
                  className={c.hideOnMobile ? 'hide-sm' : undefined}
                >
                  {c.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
