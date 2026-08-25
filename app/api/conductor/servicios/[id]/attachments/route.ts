import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const ODOO_URL = (process.env.ODOO_URL || process.env.URL_ODOO || '').trim().replace(/\/$/, '')
const ODOO_DB = (process.env.ODOO_DB || process.env.DB || '').trim()
const ODOO_EMAIL = (process.env.ODOO_EMAIL || process.env.EMAIL || '').trim()
const ODOO_API_KEY = (process.env.ODOO_API_KEY || process.env.API_KEY || '').trim()

async function odooAuth(): Promise<number> {
  const res = await fetch(`${ODOO_URL}/jsonrpc`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0', method: 'call', id: 1,
      params: { service: 'common', method: 'authenticate', args: [ODOO_DB, ODOO_EMAIL, ODOO_API_KEY, {}] },
    }),
  })
  const data = await res.json()
  if (data.error) throw new Error(data.error.data?.message ?? data.error.message)
  if (!data.result) throw new Error('Autenticación Odoo fallida')
  return data.result as number
}

async function odooCall<T = unknown>(
  uid: number, model: string, method: string, args: unknown[], kwargs: Record<string, unknown> = {}
): Promise<T> {
  const res = await fetch(`${ODOO_URL}/jsonrpc`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0', method: 'call', id: Date.now(),
      params: { service: 'object', method: 'execute_kw', args: [ODOO_DB, uid, ODOO_API_KEY, model, method, args, kwargs] },
    }),
  })
  const data = await res.json()
  if (data.error) throw new Error(data.error.data?.message ?? data.error.message)
  return data.result as T
}

type FieldMeta = { type: string; relation?: string; string?: string }

function guessMimetype(b64: string): string {
  const head = b64.substring(0, 8)
  if (head.startsWith('JVBERi0')) return 'application/pdf'
  if (head.startsWith('/9j/')) return 'image/jpeg'
  if (head.startsWith('iVBOR')) return 'image/png'
  if (head.startsWith('R0lGOD')) return 'image/gif'
  if (head.startsWith('UEsD')) return 'application/vnd.openxmlformats-officedocument'
  return 'application/octet-stream'
}

function guessExt(mime: string): string {
  if (mime === 'application/pdf') return '.pdf'
  if (mime === 'image/jpeg') return '.jpg'
  if (mime === 'image/png') return '.png'
  if (mime === 'image/gif') return '.gif'
  return ''
}

const FIELD_LABELS: Record<string, string> = {
  x_studio_gua_de_remisin_remitente: 'Guía de Remisión Remitente',
  x_studio_gua_de_remisin_transportista: 'Guía de Remisión Transportista',
  x_studio_memo_de_devolucion: 'Memo de Devolución',
  x_studio_eirl: 'EIRL',
}

// These guia fields always appear in the response (even if empty)
const GUIA_FIELDS = [
  'x_studio_gua_de_remisin_remitente',
  'x_studio_gua_de_remisin_transportista',
]

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const { data: profile } = await supabase
      .from('user_profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    if (!profile || (profile.role !== 'conductor' && profile.role !== 'admin')) {
      return NextResponse.json({ error: 'Acceso denegado' }, { status: 403 })
    }

    const { id } = await params
    const taskId = parseInt(id)
    if (isNaN(taskId)) return NextResponse.json({ error: 'ID inválido' }, { status: 400 })

    const uid = await odooAuth()

    // Discover binary + many2many→ir.attachment fields on project.task
    const allFields = await odooCall<Record<string, FieldMeta>>(
      uid, 'project.task', 'fields_get', [],
      { attributes: ['type', 'relation', 'string'] }
    )

    const binaryFields = Object.entries(allFields)
      .filter(([name, meta]) => name.startsWith('x_studio') && meta.type === 'binary')
      .map(([name]) => name)

    const m2mFields = Object.entries(allFields)
      .filter(([name, meta]) =>
        name.startsWith('x_studio') &&
        meta.type === 'many2many' &&
        meta.relation === 'ir.attachment'
      )
      .map(([name]) => name)

    const attachments: {
      id: number | string
      name: string
      mimetype: string
      file_size: number
      fieldName?: string
      hasData: boolean
    }[] = []

    // ── Binary fields: read data to check presence + detect mimetype ──────────
    // Always include GUIA_FIELDS even if empty; other binary fields only if they have data
    const fieldsToRead = Array.from(new Set([...binaryFields, ...GUIA_FIELDS.filter(f => f in allFields)]))
    if (fieldsToRead.length > 0) {
      const tasks = await odooCall<Record<string, unknown>[]>(
        uid, 'project.task', 'read',
        [[taskId]],
        { fields: fieldsToRead }
      )
      const task = tasks[0]
      if (task) {
        const processedGuia = new Set<string>()

        // Guia fields first — always included
        for (const field of GUIA_FIELDS) {
          if (!(field in (task ?? {}))) continue
          processedGuia.add(field)
          const b64 = task[field]
          const hasData = typeof b64 === 'string' && b64.length > 0
          const mimetype = hasData ? guessMimetype(b64 as string) : 'application/pdf'
          const ext = guessExt(mimetype)
          const label = FIELD_LABELS[field] || field
          attachments.push({
            id: field,
            name: `${label}${ext}`,
            mimetype,
            file_size: hasData ? Math.round((b64 as string).length * 0.75) : 0,
            fieldName: field,
            hasData,
          })
        }

        // Other binary fields — only if they have data.
        // Odoo Studio tiene varios campos "related field" duplicados que
        // apuntan al mismo archivo bajo distintos nombres técnicos (ej.
        // x_studio_memo_de_devolucion, _1, _2, x_studio_related_field_2bk_...,
        // todos etiquetados "MEMO de Devolución") — sobre todo en la sección
        // de devolución de vacío de importación. Sin deduplicar, el mismo PDF
        // aparece 3-4 veces en la lista. Se deduplica por contenido: si dos
        // campos tienen exactamente el mismo base64, es el mismo archivo.
        const seenContent = new Set<string>()
        const contentKey = (b64: string) => `${b64.length}:${b64.slice(0, 48)}:${b64.slice(-48)}`
        for (const field of binaryFields) {
          if (processedGuia.has(field)) continue
          const b64 = task[field]
          if (typeof b64 === 'string' && b64.length > 0) {
            const key = contentKey(b64)
            if (seenContent.has(key)) continue
            seenContent.add(key)
            const mimetype = guessMimetype(b64)
            const ext = guessExt(mimetype)
            const label = FIELD_LABELS[field] || allFields[field]?.string || field
            attachments.push({
              id: field,
              name: `${label}${ext}`,
              mimetype,
              file_size: Math.round(b64.length * 0.75),
              fieldName: field,
              hasData: true,
            })
          }
        }
      }
    }

    // ── Many2many fields: collect ir.attachment IDs ───────────────────────────
    if (m2mFields.length > 0) {
      const tasks = await odooCall<Record<string, unknown>[]>(
        uid, 'project.task', 'read',
        [[taskId]],
        { fields: m2mFields }
      )
      const task = tasks[0]
      if (task) {
        const ids: number[] = []
        for (const field of m2mFields) {
          const val = task[field]
          if (Array.isArray(val)) ids.push(...(val as number[]))
        }
        if (ids.length > 0) {
          const records = await odooCall<{ id: number; name: string; mimetype: string; file_size: number }[]>(
            uid, 'ir.attachment', 'read',
            [ids],
            { fields: ['id', 'name', 'mimetype', 'file_size'] }
          )
          for (const r of records) attachments.push({ ...r, hasData: true })
        }
      }
    }

    // ── Fallback: ir.attachment by res_model/res_id ───────────────────────────
    const byResId = await odooCall<{ id: number; name: string; mimetype: string; file_size: number }[]>(
      uid, 'ir.attachment', 'search_read',
      [[['res_model', '=', 'project.task'], ['res_id', '=', taskId]]],
      { fields: ['id', 'name', 'mimetype', 'file_size'], order: 'id asc' }
    )
    const seenIds = new Set(attachments.map(a => a.id))
    for (const a of byResId) {
      if (!seenIds.has(a.id)) attachments.push({ ...a, hasData: true })
    }

    return NextResponse.json({ attachments })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[conductor/servicios/attachments]', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
