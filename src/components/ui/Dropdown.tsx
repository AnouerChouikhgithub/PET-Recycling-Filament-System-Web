import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { CheckIcon, ChevronDownIcon } from '../icons'

export interface DropdownOption<T extends string> {
  value: T
  label: string
  icon?: ReactNode
}

interface DropdownProps<T extends string> {
  value: T
  options: DropdownOption<T>[]
  onChange: (v: T) => void
  align?: 'left' | 'right'
  triggerClassName?: string
}

export function Dropdown<T extends string>({
  value,
  options,
  onChange,
  align = 'left',
  triggerClassName = '',
}: DropdownProps<T>) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  const current = options.find((o) => o.value === value)

  return (
    <div className="dropdown" ref={ref}>
      <button
        className={`btn btn-secondary btn-sm ${triggerClassName}`.trim()}
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        {current?.icon}
        {current?.label ?? value}
        <ChevronDownIcon size={14} />
      </button>
      {open && (
        <div
          className="dropdown-menu"
          role="listbox"
          style={align === 'left' ? { left: 0, right: 'auto' } : undefined}
        >
          {options.map((o) => (
            <button
              key={o.value}
              role="option"
              aria-selected={o.value === value}
              className={`dropdown-item ${o.value === value ? 'selected' : ''}`}
              onClick={() => {
                onChange(o.value)
                setOpen(false)
              }}
            >
              {o.icon}
              <span style={{ flex: 1 }}>{o.label}</span>
              {o.value === value && <CheckIcon size={15} />}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
