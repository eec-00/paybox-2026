'use client'

import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { Check, ChevronDown, Search } from 'lucide-react'
import { cn } from '@/lib/utils'

// Selector de filtro con buscador, para listas largas (cientos de clientes,
// conductores o almacenes) donde el Select común obliga a hacer scroll.
// Mismo aspecto que SelectTrigger; el valor "all" = sin filtrar.

const MAX_VISIBLES = 200

/** Minúsculas y sin tildes: "Almacén" encuentra "almacen". */
const normalizar = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

interface FiltroBuscableProps {
  value: string
  onChange: (value: string) => void
  options: string[]
  /** Texto de la opción "todos" (sin filtro), ej. "Todos los clientes" */
  allLabel: string
  className?: string
}

export function FiltroBuscable({ value, onChange, options, allLabel, className }: FiltroBuscableProps) {
  const [abierto, setAbierto] = useState(false)
  const [texto, setTexto] = useState('')
  const [activo, setActivo] = useState(0)
  const raiz = useRef<HTMLDivElement>(null)
  const input = useRef<HTMLInputElement>(null)
  const lista = useRef<HTMLUListElement>(null)
  const listaId = useId()

  const filtradas = useMemo(() => {
    const q = normalizar(texto.trim())
    const base = q ? options.filter((o) => normalizar(o).includes(q)) : options
    return base.slice(0, MAX_VISIBLES)
  }, [options, texto])
  // Índice 0 = "todos"; las opciones van de 1 en adelante
  const items = useMemo(() => [{ v: 'all', label: allLabel }, ...filtradas.map((o) => ({ v: o, label: o }))], [allLabel, filtradas])

  const cerrar = () => { setAbierto(false); setTexto('') }
  const elegir = (v: string) => { onChange(v); cerrar() }

  // Cerrar al hacer clic afuera
  useEffect(() => {
    if (!abierto) return
    const onDown = (e: MouseEvent) => { if (!raiz.current?.contains(e.target as Node)) cerrar() }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [abierto])

  useEffect(() => {
    if (!abierto) return
    input.current?.focus()
    const i = items.findIndex((it) => it.v === value)
    setActivo(i >= 0 ? i : 0)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abierto])

  useEffect(() => { setActivo(texto ? 1 : 0) }, [texto])

  // Mantener visible la opción resaltada al navegar con flechas
  useEffect(() => {
    lista.current?.querySelector<HTMLElement>(`[data-i="${activo}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [activo])

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActivo((i) => Math.min(i + 1, items.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActivo((i) => Math.max(i - 1, 0)) }
    else if (e.key === 'Enter') { e.preventDefault(); if (items[activo]) elegir(items[activo].v) }
    else if (e.key === 'Escape') { e.preventDefault(); cerrar() }
  }

  const filtrando = value !== 'all'

  return (
    <div ref={raiz} className={cn('relative', className)}>
      <button
        type="button"
        role="combobox"
        aria-expanded={abierto}
        aria-controls={listaId}
        aria-haspopup="listbox"
        onClick={() => (abierto ? cerrar() : setAbierto(true))}
        className={cn(
          'border-input focus-visible:border-ring focus-visible:ring-ring/50 dark:bg-input/30 dark:hover:bg-input/50 flex h-9 w-full items-center justify-between gap-2 rounded-md border bg-transparent px-3 py-2 text-xs whitespace-nowrap shadow-xs outline-none transition-[color,box-shadow] focus-visible:ring-[3px]',
          !filtrando && 'text-muted-foreground'
        )}
        title={filtrando ? value : allLabel}
      >
        <span className="truncate">{filtrando ? value : allLabel}</span>
        <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
      </button>

      {abierto && (
        <div className="absolute left-0 top-full z-50 mt-1 w-full min-w-[16rem] max-w-[90vw] overflow-hidden rounded-md border bg-popover text-popover-foreground shadow-md">
          <div className="flex items-center gap-2 border-b px-3">
            <Search className="size-3.5 shrink-0 text-muted-foreground" />
            <input
              ref={input}
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Buscar..."
              aria-label={`Buscar en ${allLabel.toLowerCase()}`}
              aria-activedescendant={`${listaId}-${activo}`}
              className="h-9 w-full bg-transparent text-xs outline-none placeholder:text-muted-foreground"
            />
          </div>
          <ul ref={lista} id={listaId} role="listbox" className="max-h-64 overflow-y-auto p-1">
            {items.map((it, i) => (
              <li
                key={it.v}
                id={`${listaId}-${i}`}
                data-i={i}
                role="option"
                aria-selected={it.v === value}
                onMouseEnter={() => setActivo(i)}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => elegir(it.v)}
                className={cn(
                  'flex cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-xs',
                  i === activo && 'bg-accent text-accent-foreground',
                  i === 0 && 'font-medium'
                )}
              >
                <Check className={cn('size-3.5 shrink-0', it.v === value ? 'opacity-100' : 'opacity-0')} />
                <span className="truncate" title={it.label}>{it.label}</span>
              </li>
            ))}
            {filtradas.length === 0 && (
              <li className="px-2 py-3 text-center text-xs text-muted-foreground">Sin resultados para “{texto}”</li>
            )}
          </ul>
        </div>
      )}
    </div>
  )
}
