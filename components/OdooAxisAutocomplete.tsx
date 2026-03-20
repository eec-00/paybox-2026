'use client'

import { useEffect, useRef, useState } from 'react'
import { Input } from '@/components/ui/input'

type AxisKey = 'servicio' | 'placa' | 'conductor'

type OdooOption = {
  value: string
  label: string
}

interface OdooAxisAutocompleteProps {
  id: string
  axis: AxisKey
  value: string
  placeholder: string
  disabled?: boolean
  required?: boolean
  onChange: (value: string) => void
}

export function OdooAxisAutocomplete({
  id,
  axis,
  value,
  placeholder,
  disabled,
  required,
  onChange,
}: OdooAxisAutocompleteProps) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [query, setQuery] = useState(value || '')
  const [options, setOptions] = useState<OdooOption[]>([])
  const wrapperRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setQuery(value || '')
  }, [value])

  useEffect(() => {
    const onClickOutside = (event: MouseEvent) => {
      if (!wrapperRef.current) return
      if (!wrapperRef.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }

    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [])

  useEffect(() => {
    if (!open || disabled) return

    const timeoutId = window.setTimeout(async () => {
      try {
        setLoading(true)
        const url = `/api/odoo-axis-options?axis=${encodeURIComponent(axis)}&q=${encodeURIComponent(query)}&limit=20`
        const res = await fetch(url)
        const data = await res.json()

        if (!res.ok) {
          setOptions([])
          return
        }

        setOptions(Array.isArray(data.options) ? data.options : [])
      } finally {
        setLoading(false)
      }
    }, 250)

    return () => window.clearTimeout(timeoutId)
  }, [axis, query, open, disabled])

  return (
    <div ref={wrapperRef} className="relative">
      <Input
        id={id}
        type="text"
        placeholder={placeholder}
        value={value}
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          const next = e.target.value
          onChange(next)
          setQuery(next)
          setOpen(true)
        }}
        required={required}
        disabled={disabled}
        autoComplete="off"
      />

      {open && (
        <div className="absolute z-50 mt-1 w-full rounded-md border bg-background shadow-lg">
          <div className="max-h-56 overflow-y-auto py-1">
            {loading ? (
              <p className="px-3 py-2 text-sm text-muted-foreground">Buscando en Odoo...</p>
            ) : options.length > 0 ? (
              options.map((option) => (
                <button
                  key={`${axis}-${option.value}`}
                  type="button"
                  className="w-full px-3 py-2 text-left text-sm hover:bg-muted"
                  onClick={() => {
                    onChange(option.value)
                    setQuery(option.value)
                    setOpen(false)
                  }}
                >
                  {option.label}
                </button>
              ))
            ) : (
              <p className="px-3 py-2 text-sm text-muted-foreground">
                {query ? 'Sin resultados en Odoo' : 'Escribe para buscar en Odoo'}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
