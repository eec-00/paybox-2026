// Supabase en memoria para probar rutas sin base real. Solo implementa lo que
// usan las rutas de gastos.

type Fila = Record<string, unknown>
type Respuesta = { data: unknown; error: { code?: string; message: string } | null }

export interface DbFalsa {
  user: { id: string } | null
  profile: Fila | null
  tablas: Record<string, Fila[]>
  /** Tablas cuya próxima escritura falla */
  fallar: Set<string>
}

export function crearDb(over: Partial<DbFalsa> = {}): DbFalsa {
  return {
    user: { id: 'u1' },
    profile: { role: 'conductor', full_name: 'Conductor', odoo_employee_id: 5, odoo_employee_name: 'Conductor' },
    tablas: { gastos_conductor: [], calendario_pagos: [] },
    fallar: new Set(),
    ...over,
  }
}

class Consulta implements PromiseLike<Respuesta> {
  private op: 'select' | 'insert' | 'update' | 'delete' = 'select'
  private devuelve = false
  private valores: Fila = {}
  private filtros: ((f: Fila) => boolean)[] = []
  private modo: 'lista' | 'single' | 'maybe' = 'lista'
  private tope: number | null = null

  constructor(private db: DbFalsa, private tabla: string) {}

  select() { if (this.op === 'select') return this; this.devuelve = true; return this }
  insert(valores: Fila) { this.op = 'insert'; this.valores = valores; return this }
  update(valores: Fila) { this.op = 'update'; this.valores = valores; return this }
  delete() { this.op = 'delete'; return this }
  eq(k: string, v: unknown) { this.filtros.push(f => f[k] === v); return this }
  /** Solo cubre `.not(columna, 'is', null)` */
  not(k: string) { this.filtros.push(f => f[k] !== null && f[k] !== undefined); return this }
  limit(n: number) { this.tope = n; return this }
  single() { this.modo = 'single'; return this }
  maybeSingle() { this.modo = 'maybe'; return this }

  private filas() {
    return (this.db.tablas[this.tabla] ??= [])
  }

  private ejecutar(): Respuesta {
    if (this.tabla === 'user_profiles') return { data: this.db.profile, error: null }

    if (this.op !== 'select' && this.db.fallar.delete(this.tabla)) {
      return { data: null, error: { message: `fallo inducido en ${this.tabla}` } }
    }

    const coinciden = () => this.filas().filter(f => this.filtros.every(ok => ok(f)))

    if (this.op === 'insert') {
      const fila = { id: `auto-${this.filas().length + 1}`, ...this.valores }
      if (this.filas().some(f => f.id === fila.id)) {
        return { data: null, error: { code: '23505', message: 'duplicate key' } }
      }
      this.filas().push(fila)
      return { data: this.modo === 'lista' ? [fila] : fila, error: null }
    }
    if (this.op === 'update') {
      const filas = coinciden()
      filas.forEach(f => Object.assign(f, this.valores))
      return { data: filas, error: null }
    }
    if (this.op === 'delete') {
      const filas = coinciden()
      this.db.tablas[this.tabla] = this.filas().filter(f => !filas.includes(f))
      return { data: filas, error: null }
    }

    const filas = this.tope === null ? coinciden() : coinciden().slice(0, this.tope)
    if (this.modo === 'lista') return { data: filas, error: null }
    return { data: filas[0] ?? null, error: null }
  }

  then<A = Respuesta, B = never>(ok?: ((r: Respuesta) => A | PromiseLike<A>) | null, mal?: ((e: unknown) => B | PromiseLike<B>) | null) {
    return Promise.resolve(this.ejecutar()).then(ok, mal)
  }
}

export function clienteFalso(db: DbFalsa) {
  return {
    auth: {
      getUser: async () => ({ data: { user: db.user }, error: null }),
    },
    from: (tabla: string) => new Consulta(db, tabla),
    storage: {
      from: (bucket: string) => ({
        createSignedUrl: async (ruta: string, segundos: number) =>
          ruta.startsWith('no-existe')
            ? { data: null, error: { message: 'not found' } }
            : { data: { signedUrl: `https://storage.test/${bucket}/${ruta}?exp=${segundos}` }, error: null },
      }),
    },
  }
}
