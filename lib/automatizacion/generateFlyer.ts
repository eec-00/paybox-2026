import { createElement as h } from 'react'
import { readFileSync } from 'fs'
import { join } from 'path'
import satori from 'satori'
import { Resvg } from '@resvg/resvg-js'

export interface FlyerRow {
  unidad: string
  documento: string
  fecha: string
  dias: number
}

function daysColor(dias: number): string {
  if (dias < 0) return '#dc2626'
  if (dias <= 7) return '#ea580c'
  if (dias <= 30) return '#d97706'
  return '#854d0e'
}

function daysLabel(dias: number): string {
  if (dias < 0) return `VENCIDO hace ${Math.abs(dias)}d`
  if (dias === 0) return 'VENCE HOY'
  return `en ${dias} dias`
}

function s(v: unknown): string {
  if (v === null || v === undefined) return ''
  return String(v)
}

export async function generateFlyerPng(
  rows: FlyerRow[],
  titulo = 'Vencimientos Proximos'
): Promise<Buffer> {
  const fontsDir = join(process.cwd(), 'public', 'fonts')
  const readFont = (name: string): ArrayBuffer => {
    const buf = readFileSync(join(fontsDir, name))
    const ab = new ArrayBuffer(buf.length)
    new Uint8Array(ab).set(buf)
    return ab
  }
  const regular = readFont('lato-regular.ttf')
  const bold = readFont('lato-bold.ttf')

  // ─── helpers ─────────────────────────────────────────────────────────────
  const ROW_CELL: React.CSSProperties = {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 9,
    paddingBottom: 9,
    paddingLeft: 14,
    paddingRight: 14,
    fontSize: 13,
    color: '#1c1917',
    borderRightWidth: 1,
    borderRightStyle: 'solid',
    borderRightColor: '#e8e0d4',
  }

  const HEAD_CELL: React.CSSProperties = {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 11,
    paddingBottom: 11,
    paddingLeft: 14,
    paddingRight: 14,
    color: '#f59e0b',
    fontWeight: 700,
    fontSize: 11,
    letterSpacing: 1,
    borderRightWidth: 1,
    borderRightStyle: 'solid',
    borderRightColor: '#292524',
  }

  // ─── table rows ──────────────────────────────────────────────────────────
  const tableRows = rows.map((row, i) =>
    h(
      'div',
      {
        key: i,
        style: {
          display: 'flex',
          flexDirection: 'row' as const,
          background: i % 2 === 0 ? '#fffbf0' : '#ffffff',
          borderLeftWidth: 1,
          borderLeftStyle: 'solid' as const,
          borderLeftColor: '#e8e0d4',
          borderBottomWidth: 1,
          borderBottomStyle: 'solid' as const,
          borderBottomColor: '#e8e0d4',
        },
      },
      h('div', { style: { ...ROW_CELL, fontWeight: 700 } }, s(row.unidad)),
      h('div', { style: { ...ROW_CELL, color: '#44403c' } }, s(row.documento)),
      h(
        'div',
        {
          style: {
            flex: 1,
            display: 'flex',
            flexDirection: 'column' as const,
            alignItems: 'center',
            justifyContent: 'center',
            paddingTop: 9,
            paddingBottom: 9,
            paddingLeft: 14,
            paddingRight: 14,
            color: daysColor(row.dias),
          },
        },
        h('span', { style: { fontSize: 13, fontWeight: 700 } }, s(row.fecha)),
        h('span', { style: { fontSize: 10, marginTop: 2, color: daysColor(row.dias) } }, daysLabel(row.dias))
      )
    )
  )

  // ─── full element ─────────────────────────────────────────────────────────
  const element = h(
    'div',
    {
      style: {
        width: 780,
        paddingTop: 36,
        paddingRight: 40,
        paddingBottom: 32,
        paddingLeft: 40,
        background: '#fafaf8',
        fontFamily: 'Lato',
        display: 'flex',
        flexDirection: 'column' as const,
        borderWidth: 1,
        borderStyle: 'solid' as const,
        borderColor: '#e8e0d4',
      },
    },

    // Header
    h(
      'div',
      {
        style: {
          display: 'flex',
          flexDirection: 'row' as const,
          alignItems: 'center',
          marginBottom: 28,
          paddingBottom: 20,
          borderBottomWidth: 2,
          borderBottomStyle: 'solid' as const,
          borderBottomColor: '#d97706',
        },
      },
      h(
        'div',
        {
          style: {
            width: 52,
            height: 52,
            background: '#f59e0b',
            borderRadius: 12,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginRight: 16,
          },
        },
        h('div', { style: { fontSize: 26, fontWeight: 900, color: 'white' } }, 'V')
      ),
      h(
        'div',
        { style: { display: 'flex', flexDirection: 'column' as const } },
        h(
          'div',
          { style: { fontSize: 11, fontWeight: 700, color: '#b45309', letterSpacing: 2 } },
          'EEMERSON SAC - SISTEMA PAYBOX'
        ),
        h('div', { style: { fontSize: 26, fontWeight: 700, color: '#1c1917', marginTop: 3 } }, s(titulo))
      )
    ),

    // Table header
    h(
      'div',
      {
        style: {
          display: 'flex',
          flexDirection: 'row' as const,
          background: '#1c1917',
          borderTopWidth: 1,
          borderTopStyle: 'solid' as const,
          borderTopColor: '#292524',
          borderLeftWidth: 1,
          borderLeftStyle: 'solid' as const,
          borderLeftColor: '#292524',
          borderRightWidth: 1,
          borderRightStyle: 'solid' as const,
          borderRightColor: '#292524',
        },
      },
      h('div', { style: HEAD_CELL }, 'UNIDAD / CONDUCTOR'),
      h('div', { style: HEAD_CELL }, 'DOCUMENTO'),
      h('div', { style: { ...HEAD_CELL, borderRightWidth: 0 } }, 'F. VENCIMIENTO')
    ),

    // Rows container
    h('div', { style: { display: 'flex', flexDirection: 'column' as const } }, ...tableRows),

    // Notice
    h(
      'div',
      {
        style: {
          marginTop: 20,
          paddingTop: 11,
          paddingBottom: 11,
          paddingLeft: 18,
          paddingRight: 18,
          background: '#fffbf0',
          borderLeftWidth: 3,
          borderLeftStyle: 'solid' as const,
          borderLeftColor: '#d97706',
          fontSize: 13,
          color: '#78350f',
          display: 'flex',
        },
      },
      'Si ya lo actualizaste, comunicalo al area administrativa para su presentacion.'
    ),

    // Footer
    h(
      'div',
      {
        style: {
          marginTop: 24,
          paddingTop: 16,
          borderTopWidth: 1,
          borderTopStyle: 'solid' as const,
          borderTopColor: '#d4c9bc',
          display: 'flex',
          flexDirection: 'row' as const,
          justifyContent: 'space-between',
          alignItems: 'center',
        },
      },
      h('div', { style: { fontSize: 17, fontWeight: 600, color: '#1c1917' } }, 'Gracias por su atencion'),
      h('div', { style: { fontSize: 11, color: '#a8a29e', letterSpacing: 1 } }, 'ADMINISTRACION - EEMERSON SAC')
    )
  )

  const svg = await satori(element, {
    width: 780,
    fonts: [
      { name: 'Lato', data: regular, weight: 400, style: 'normal' },
      { name: 'Lato', data: bold, weight: 700, style: 'normal' },
    ],
  })

  const resvg = new Resvg(svg)
  const pngData = resvg.render()
  return Buffer.from(pngData.asPng())
}
