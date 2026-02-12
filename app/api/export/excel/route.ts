import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import * as XLSX from 'xlsx'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

export async function POST(request: NextRequest) {
  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Obtener solo registros NO exportados
    const { data: registros, error } = await supabase
      .from('registros')
      .select(`
        id,
        fecha_y_hora_pago,
        beneficiario,
        monto,
        moneda,
        descripcion,
        categoria_id,
        creado_por
      `)
      .eq('exportado_a_odoo', false)
      .order('fecha_y_hora_pago', { ascending: true })

    if (error) {
      throw new Error(`Error al obtener registros: ${error.message}`)
    }

    if (!registros || registros.length === 0) {
      return NextResponse.json(
        { message: 'No hay registros pendientes de exportar' },
        { status: 404 }
      )
    }

    // Obtener IDs únicos de usuarios y categorías
    const usuariosIds = [...new Set(registros.map(r => r.creado_por))]
    const categoriasIds = [...new Set(registros.map(r => r.categoria_id))]

    // Obtener nombres de usuarios
    const { data: usuarios } = await supabase.auth.admin.listUsers()
    const usuariosMap = new Map(
      usuarios?.users?.map(u => [u.id, u.user_metadata?.full_name || u.email]) || []
    )

    // Obtener nombres de categorías
    const { data: categorias } = await supabase
      .from('categorias')
      .select('id, categoria_nombre')
      .in('id', categoriasIds)

    const categoriasMap = new Map(
      categorias?.map(c => [c.id, c.categoria_nombre]) || []
    )

    // Formatear datos para Excel
    const excelData = registros.map(registro => {
      const fecha = new Date(registro.fecha_y_hora_pago)
      const fechaFormateada = fecha.toLocaleDateString('es-PE', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
      })

      return {
        'Empleado': usuariosMap.get(registro.creado_por) || 'Desconocido',
        'Descripción': registro.descripcion || registro.beneficiario,
        'Fecha del gasto': fechaFormateada,
        'Categoría': categoriasMap.get(registro.categoria_id) || 'Sin categoría',
        'Pagado por': 'Empleado (a reembolsar)',
        'Total': registro.monto.toFixed(2)
      }
    })

    // Crear libro de Excel
    const worksheet = XLSX.utils.json_to_sheet(excelData)
    
    // Ajustar ancho de columnas
    const columnWidths = [
      { wch: 25 }, // Empleado
      { wch: 50 }, // Descripción
      { wch: 15 }, // Fecha del gasto
      { wch: 20 }, // Categoría
      { wch: 25 }, // Pagado por
      { wch: 15 }  // Total
    ]
    worksheet['!cols'] = columnWidths

    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Gastos')

    // Generar buffer del archivo Excel
    const excelBuffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' })

    // Generar ID único para este lote de exportación
    const loteId = Date.now()

    // Marcar registros como exportados
    const registrosIds = registros.map(r => r.id)
    console.log('Intentando actualizar registros:', registrosIds)
    console.log('Lote ID:', loteId)
    
    const { data: updateData, error: updateError } = await supabase
      .from('registros')
      .update({
        exportado_a_odoo: true,
        fecha_exportacion: new Date().toISOString(),
        lote_exportacion_id: loteId
      })
      .in('id', registrosIds)
      .select()

    if (updateError) {
      console.error('❌ ERROR al marcar registros como exportados:', updateError)
      return NextResponse.json(
        { 
          error: 'Error al marcar registros como exportados', 
          details: updateError.message,
          hint: updateError.hint,
          code: updateError.code
        },
        { status: 500 }
      )
    }

    console.log('✅ Registros actualizados correctamente:', updateData?.length)

    // Crear nombre de archivo con fecha actual
    const fechaActual = new Date().toLocaleDateString('es-PE').replace(/\//g, '-')
    const fileName = `Gastos_Odoo_${fechaActual}_${registros.length}_registros.xlsx`

    // Retornar el archivo Excel
    return new NextResponse(excelBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${fileName}"`,
        'X-Registros-Exportados': registros.length.toString(),
        'X-Lote-Id': loteId.toString()
      }
    })

  } catch (error: any) {
    console.error('Error en exportación:', error)
    return NextResponse.json(
      { error: error.message || 'Error al exportar registros' },
      { status: 500 }
    )
  }
}

// GET - Obtener estadísticas de exportación
export async function GET(request: NextRequest) {
  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Contar registros pendientes
    const { count: pendientes, error: errorPendientes } = await supabase
      .from('registros')
      .select('*', { count: 'exact', head: true })
      .eq('exportado_a_odoo', false)

    // Contar registros exportados
    const { count: exportados, error: errorExportados } = await supabase
      .from('registros')
      .select('*', { count: 'exact', head: true })
      .eq('exportado_a_odoo', true)

    if (errorPendientes || errorExportados) {
      throw new Error('Error al obtener estadísticas')
    }

    return NextResponse.json({
      pendientes: pendientes || 0,
      exportados: exportados || 0,
      total: (pendientes || 0) + (exportados || 0)
    })

  } catch (error: any) {
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    )
  }
}
