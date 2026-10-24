import { NextResponse } from 'next/server'



import { odooAuth, odooCall, ODOO_URL, ODOO_DB } from '@/lib/odoo'
export async function GET() {
  try {
    const uid = await odooAuth()

    // 1. Buscar por etiqueta (field_description) en hr.employee
    const byLabel = await odooCall<any[]>(uid, 'ir.model.fields', 'search_read',
      [[['model', '=', 'hr.employee'], ['field_description', 'ilike', 'vence']]],
      { fields: ['name', 'field_description', 'ttype'], order: 'name asc', limit: 100 }
    )

    // 2. Todos los campos date/datetime de hr.employee (sin filtrar por nombre)
    const allDateFields = await odooCall<any[]>(uid, 'ir.model.fields', 'search_read',
      [[['model', '=', 'hr.employee'], ['ttype', 'in', ['date', 'datetime']]]],
      { fields: ['name', 'field_description', 'ttype'], order: 'name asc', limit: 200 }
    )

    // 3. Leer employee 77 con el campo confirmado en screenshot: x_studio_licencia_vence
    let readTest: any = null
    try {
      const r = await odooCall<any[]>(uid, 'hr.employee', 'read',
        [[77], ['name', 'x_studio_licencia_vence', 'x_studio_dni_vence', 'x_studio_sctr', 'x_studio_ransa']]
      )
      readTest = { ok: true, data: r?.[0] }
    } catch (e: any) {
      readTest = { ok: false, error: e.message }
    }

    // 4. ¿Qué URL/DB estamos usando?
    const instanceInfo = { ODOO_URL, ODOO_DB }

    return NextResponse.json({ instanceInfo, byLabel, allDateFields, readTest })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
