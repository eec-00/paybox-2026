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

function guessMimetype(b64: string): string {
  const head = b64.substring(0, 8)
  if (head.startsWith('JVBERi0')) return 'application/pdf'
  if (head.startsWith('/9j/')) return 'image/jpeg'
  if (head.startsWith('iVBOR')) return 'image/png'
  if (head.startsWith('R0lGOD')) return 'image/gif'
  return 'application/octet-stream'
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; attachId: string }> }
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

    const { id, attachId } = await params
    const taskId = parseInt(id)
    if (isNaN(taskId)) return NextResponse.json({ error: 'ID tarea inválido' }, { status: 400 })

    const uid = await odooAuth()

    // ── Binary field on project.task (attachId = field name) ─────────────────
    if (attachId.startsWith('x_studio_')) {
      const tasks = await odooCall<Record<string, unknown>[]>(
        uid, 'project.task', 'read',
        [[taskId]],
        { fields: [attachId] }
      )
      const task = tasks[0]
      const b64 = task?.[attachId]
      if (typeof b64 !== 'string' || !b64) {
        return NextResponse.json({ error: 'Archivo no encontrado' }, { status: 404 })
      }
      const mimetype = guessMimetype(b64)
      const buffer = Buffer.from(b64, 'base64')
      return new NextResponse(buffer, {
        headers: {
          'Content-Type': mimetype,
          'Content-Disposition': 'inline',
          'Content-Length': String(buffer.length),
          'Cache-Control': 'private, max-age=300',
        },
      })
    }

    // ── ir.attachment record (attachId = numeric ID) ──────────────────────────
    const attachmentId = parseInt(attachId)
    if (isNaN(attachmentId)) return NextResponse.json({ error: 'ID adjunto inválido' }, { status: 400 })

    const records = await odooCall<{ id: number; name: string; mimetype: string; datas: string; res_id: number }[]>(
      uid, 'ir.attachment', 'read',
      [[attachmentId]],
      { fields: ['id', 'name', 'mimetype', 'datas', 'res_id'] }
    )
    const attachment = records[0]
    if (!attachment) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })
    if (attachment.res_id !== taskId) return NextResponse.json({ error: 'Acceso denegado' }, { status: 403 })
    if (!attachment.datas) return NextResponse.json({ error: 'Archivo sin contenido' }, { status: 404 })

    const buffer = Buffer.from(attachment.datas, 'base64')
    const safeName = encodeURIComponent(attachment.name)
    return new NextResponse(buffer, {
      headers: {
        'Content-Type': attachment.mimetype || 'application/octet-stream',
        'Content-Disposition': `inline; filename*=UTF-8''${safeName}`,
        'Content-Length': String(buffer.length),
        'Cache-Control': 'private, max-age=300',
      },
    })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[conductor/servicios/attachments/[attachId]]', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
