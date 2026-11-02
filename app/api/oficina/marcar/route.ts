import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { hoyLima } from '@/lib/fechas'
import { TIPOS_MARCA, type TipoMarca } from '@/lib/oficina/calculos'
import { estadoHoy } from '@/lib/oficina/servidor'

const MAX_SELFIE_BYTES = 8 * 1024 * 1024

// Confirma la marca: consume el ticket del toque, sube la selfie al bucket
// privado y registra la marca con la hora del servidor.
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const form = await request.formData()
  const ticketId = String(form.get('ticketId') ?? '')
  const tipo = String(form.get('tipo') ?? '') as TipoMarca
  const selfie = form.get('selfie')

  if (!TIPOS_MARCA.includes(tipo)) return NextResponse.json({ error: 'Tipo de marca inválido' }, { status: 400 })
  const foto = selfie instanceof File && selfie.size > 0 ? selfie : null
  if (foto && !foto.type.startsWith('image/')) return NextResponse.json({ error: 'La selfie debe ser una imagen' }, { status: 400 })
  if (foto && foto.size > MAX_SELFIE_BYTES) return NextResponse.json({ error: 'La foto pesa demasiado' }, { status: 400 })

  const admin = createAdminClient()
  const estado = await estadoHoy(admin, user.id)
  if (!estado) return NextResponse.json({ error: 'Tu usuario no está habilitado para marcar en oficina' }, { status: 403 })
  // RRHH elige en Configuración en qué marcas se pide selfie.
  if (!foto && estado.selfieTipos.includes(tipo)) return NextResponse.json({ error: 'La selfie es obligatoria' }, { status: 400 })

  // Solo la marca que le toca, o "salida" directa si se va sin almuerzo.
  const permitido = tipo === estado.siguiente || (tipo === 'salida' && estado.siguiente === 'salida_almuerzo')
  if (!permitido) {
    return NextResponse.json({ error: estado.siguiente ? 'Esa marca no es la que te toca ahora' : 'Ya completaste tus marcas de hoy' }, { status: 400 })
  }

  // Consume el ticket (condicional: si dos envíos llegan juntos, solo uno pasa).
  const ahora = new Date().toISOString()
  const { data: ticket } = await admin
    .from('oficina_tickets')
    .update({ usado_at: ahora })
    .eq('id', ticketId)
    .eq('user_id', user.id)
    .is('usado_at', null)
    .gt('expira_at', ahora)
    .select('id, sticker_uid, contador')
    .maybeSingle()
  if (!ticket) {
    return NextResponse.json({ error: 'El toque venció o ya se usó. Vuelve a acercar tu celular al sticker.' }, { status: 400 })
  }
  const liberarTicket = () => admin.from('oficina_tickets').update({ usado_at: null }).eq('id', ticket.id)

  const fecha = hoyLima()
  const path = foto ? `${user.id}/${fecha}/${tipo}-${Date.now()}.jpg` : null
  if (foto && path) {
    const { error: upErr } = await admin.storage
      .from('asistencia-oficina')
      .upload(path, foto, { contentType: foto.type, upsert: false })
    if (upErr) {
      await liberarTicket()
      return NextResponse.json({ error: 'No se pudo subir la selfie, intenta de nuevo', detalle: `subida selfie: ${upErr.message}` }, { status: 500 })
    }
  }

  const nuevaMarca = {
    user_id: user.id,
    nombre: estado.nombre,
    fecha,
    tipo,
    sticker_uid: ticket.sticker_uid,
    contador: ticket.contador,
    selfie_path: path,
  }
  const insertar = () => admin.from('oficina_marcas').insert(nuevaMarca).select('id, marcado_at').single()

  let { data: marca, error: insErr } = await insertar()
  // Fallo de conexión pasajero (sin código de Postgres): un reintento. Si el primer
  // intento sí llegó a guardarse, el segundo choca (23505) y se toma la marca ya guardada.
  if (insErr && !insErr.code) {
    console.error('[oficina/marcar] fallo de conexión, reintentando', { tipo, userId: user.id, message: insErr.message })
    ;({ data: marca, error: insErr } = await insertar())
    if (insErr?.code === '23505') {
      const { data: existente } = await admin
        .from('oficina_marcas')
        .select('id, marcado_at')
        .eq('user_id', user.id).eq('fecha', fecha).eq('tipo', tipo)
        .maybeSingle()
      if (existente) { marca = existente; insErr = null }
    }
  }
  if (insErr || !marca) {
    console.error('[oficina/marcar] insert falló', { tipo, userId: user.id, code: insErr?.code, message: insErr?.message, details: insErr?.details })
    await liberarTicket()
    if (path) await admin.storage.from('asistencia-oficina').remove([path])
    const msg = insErr?.code === '23505' ? 'Esa marca ya estaba registrada hoy' : 'No se pudo registrar la marca'
    const detalle = insErr ? `${tipo} · ${insErr.code ?? 's/c'} · ${insErr.message}` : `${tipo} · sin respuesta`
    return NextResponse.json({ error: msg, detalle }, { status: 400 })
  }

  await admin.from('oficina_tickets').update({ marca_id: marca.id }).eq('id', ticket.id)

  return NextResponse.json({ ok: true, marcado_at: marca.marcado_at, ...(await estadoHoy(admin, user.id)) })
}
