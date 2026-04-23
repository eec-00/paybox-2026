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

function daysColor(dias: number) {
  if (dias < 0) return '#dc2626'
  if (dias <= 7) return '#ea580c'
  if (dias <= 30) return '#d97706'
  return '#854d0e'
}

function daysLabel(dias: number) {
  if (dias < 0) return `VENCIDO hace ${Math.abs(dias)}d`
  if (dias === 0) return 'VENCE HOY'
  return `en ${dias} dias`
}

export async function generateFlyerPng(
  rows: FlyerRow[],
  titulo = 'Vencimientos Proximos'
): Promise<Buffer> {
  const fontsDir = join(process.cwd(), 'public', 'fonts')
  const readFont = (name: string): ArrayBuffer => {
    const buf = readFileSync(join(fontsDir, name))
    return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer
  }
  const regular = readFont('lato-regular.ttf')
  const bold = readFont('lato-bold.ttf')

  const colStyle = (extra: object = {}) => ({
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '9px 14px',
    fontSize: 13,
    color: '#1c1917',
    borderRight: '1px solid #e8e0d4',
    ...extra,
  })

  const tableRows = rows.map((row, i) =>
    h(
      'div',
      {
        key: i,
        style: {
          display: 'flex',
          flexDirection: 'row' as const,
          background: i % 2 === 0 ? '#fffbf0' : '#ffffff',
          borderLeft: '1px solid #e8e0d4',
          borderBottom: '1px solid #e8e0d4',
        },
      },
      h('div', { style: colStyle({ fontWeight: 700 }) }, row.unidad),
      h('div', { style: colStyle({ color: '#44403c' }) }, row.documento),
      h(
        'div',
        {
          style: {
            flex: 1,
            display: 'flex',
            flexDirection: 'column' as const,
            alignItems: 'center',
            justifyContent: 'center',
            padding: '9px 14px',
            color: daysColor(row.dias),
          },
        },
        h('span', { style: { fontSize: 13, fontWeight: 700 } }, row.fecha),
        h('span', { style: { fontSize: 10, marginTop: 2 } }, daysLabel(row.dias))
      )
    )
  )

  const element = h(
    'div',
    {
      style: {
        width: 780,
        padding: '36px 40px 32px',
        background: '#fafaf8',
        fontFamily: 'Lato',
        display: 'flex',
        flexDirection: 'column' as const,
        border: '1px solid #e8e0d4',
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
          borderBottom: '2px solid #d97706',
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
            flexShrink: 0,
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
          'EEMERSON SAC · SISTEMA PAYBOX'
        ),
        h('div', { style: { fontSize: 26, fontWeight: 700, color: '#1c1917', marginTop: 3 } }, titulo)
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
          border: '1px solid #292524',
        },
      },
      ...['Unidad / Conductor', 'Documento', 'F. Vencimiento'].map((label, i) =>
        h(
          'div',
          {
            key: i,
            style: {
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '11px 14px',
              color: '#f59e0b',
              fontWeight: 700,
              fontSize: 11,
              letterSpacing: 1,
              borderRight: i < 2 ? '1px solid #292524' : undefined,
            },
          },
          label.toUpperCase()
        )
      )
    ),
    // Rows container
    h('div', { style: { display: 'flex', flexDirection: 'column' as const } }, ...tableRows),
    // Notice
    h(
      'div',
      {
        style: {
          marginTop: 20,
          padding: '11px 18px',
          background: '#fffbf0',
          borderLeft: '3px solid #d97706',
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
          borderTop: '1px solid #d4c9bc',
          display: 'flex',
          flexDirection: 'row' as const,
          justifyContent: 'space-between',
          alignItems: 'center',
        },
      },
      h('div', { style: { fontSize: 17, fontWeight: 600, color: '#1c1917' } }, 'Gracias por su atencion'),
      h(
        'div',
        { style: { fontSize: 11, color: '#a8a29e', letterSpacing: 1 } },
        'ADMINISTRACION · EEMERSON SAC'
      )
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
