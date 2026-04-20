'use client'

import { forwardRef } from 'react'

export interface FlyerRow {
  unidad: string
  documento: string
  fecha: string
  dias: number
}

interface Props {
  rows: FlyerRow[]
  titulo?: string
}

export const VencimientosFlyer = forwardRef<HTMLDivElement, Props>(
  ({ rows, titulo = 'Vencimientos Próximos' }, ref) => {
    return (
      <div
        ref={ref}
        style={{
          width: 700,
          fontFamily: "'Lato', 'Helvetica Neue', Arial, sans-serif",
          background: '#fafaf8',
          padding: '36px 40px 32px',
          borderRadius: 14,
          boxSizing: 'border-box',
          border: '1px solid #e8e0d4',
        }}
      >
        {/* Fuentes via @import */}
        <style>{`@import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,600;0,700;1,600&family=Lato:wght@400;700&display=swap');`}</style>

        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 28,
            paddingBottom: 20,
            borderBottom: '2px solid #d97706',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            {/* Ícono calendario */}
            <div
              style={{
                width: 52,
                height: 52,
                background: 'linear-gradient(135deg, #f59e0b 0%, #b45309 100%)',
                borderRadius: 12,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                boxShadow: '0 4px 12px rgba(180,83,9,0.30)',
              }}
            >
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
                <line x1="16" y1="2" x2="16" y2="6"/>
                <line x1="8" y1="2" x2="8" y2="6"/>
                <line x1="3" y1="10" x2="21" y2="10"/>
                <line x1="12" y1="14" x2="12" y2="17"/>
                <circle cx="12" cy="19" r="0.5" fill="white"/>
              </svg>
            </div>
            <div>
              <p
                style={{
                  margin: 0,
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: 3,
                  color: '#b45309',
                  textTransform: 'uppercase',
                  fontFamily: "'Lato', sans-serif",
                }}
              >
                Eemerson SAC · Sistema PayBox
              </p>
              <h1
                style={{
                  margin: '3px 0 0',
                  fontSize: 28,
                  fontWeight: 700,
                  letterSpacing: 0.5,
                  color: '#1c1917',
                  fontFamily: "'Playfair Display', Georgia, serif",
                  lineHeight: 1.1,
                }}
              >
                {titulo}
              </h1>
            </div>
          </div>

          {/* Logo empresa */}
          <img
            src="/logo.png"
            alt="Eemerson SAC"
            style={{ width: 64, height: 64, objectFit: 'contain', flexShrink: 0 }}
          />
        </div>

        {/* Table */}
        <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 13 }}>
          <thead>
            <tr style={{ background: '#1c1917' }}>
              {['Unidad / Conductor', 'Documento', 'F. Vencimiento'].map((h) => (
                <th
                  key={h}
                  style={{
                    border: '1px solid #292524',
                    padding: '11px 16px',
                    color: '#f59e0b',
                    fontWeight: 700,
                    textAlign: 'center',
                    textTransform: 'uppercase',
                    letterSpacing: 1,
                    fontSize: 11,
                    fontFamily: "'Lato', sans-serif",
                  }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i} style={{ background: i % 2 === 0 ? '#fffbf0' : '#ffffff' }}>
                <td
                  style={{
                    border: '1px solid #e8e0d4',
                    padding: '9px 16px',
                    textAlign: 'center',
                    color: '#1c1917',
                    fontWeight: 700,
                    fontFamily: "'Lato', sans-serif",
                  }}
                >
                  {row.unidad}
                </td>
                <td
                  style={{
                    border: '1px solid #e8e0d4',
                    padding: '9px 16px',
                    textAlign: 'center',
                    color: '#44403c',
                    fontFamily: "'Lato', sans-serif",
                  }}
                >
                  {row.documento}
                </td>
                <td
                  style={{
                    border: '1px solid #e8e0d4',
                    padding: '9px 16px',
                    textAlign: 'center',
                    color: row.dias < 0 ? '#dc2626' : row.dias <= 7 ? '#ea580c' : row.dias <= 30 ? '#d97706' : '#854d0e',
                    fontWeight: 700,
                    fontFamily: "'Lato', sans-serif",
                  }}
                >
                  {row.fecha}
                  <div style={{ fontSize: 10, fontWeight: 400, opacity: 0.7, marginTop: 2 }}>
                    {row.dias < 0 ? `vencido hace ${Math.abs(row.dias)}d` : row.dias === 0 ? 'VENCE HOY' : `en ${row.dias} días`}
                  </div>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={3} style={{ border: '1px solid #e8e0d4', padding: '16px', textAlign: 'center', color: '#78716c' }}>
                  No hay vencimientos próximos.
                </td>
              </tr>
            )}
          </tbody>
        </table>

        {/* Notice */}
        <div
          style={{
            marginTop: 20,
            padding: '11px 18px',
            background: '#fffbf0',
            borderLeft: '3px solid #d97706',
            borderRadius: '0 6px 6px 0',
            fontSize: 13,
            color: '#78350f',
            fontFamily: "'Lato', sans-serif",
            fontStyle: 'italic',
          }}
        >
          Si ya lo actualizaste, <strong style={{ fontStyle: 'normal' }}>comunícalo</strong> al área administrativa para que pueda proceder con su presentación.
        </div>

        {/* Footer */}
        <div
          style={{
            marginTop: 24,
            paddingTop: 16,
            borderTop: '1px solid #d4c9bc',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'baseline',
          }}
        >
          <p
            style={{
              margin: 0,
              fontSize: 17,
              fontWeight: 600,
              color: '#1c1917',
              fontFamily: "'Playfair Display', Georgia, serif",
              fontStyle: 'italic',
              letterSpacing: 0.3,
            }}
          >
            Gracias por su atención
          </p>
          <p
            style={{
              margin: 0,
              fontSize: 11,
              color: '#a8a29e',
              fontFamily: "'Lato', sans-serif",
              letterSpacing: 1,
              textTransform: 'uppercase',
            }}
          >
            Administración · Eemerson SAC
          </p>
        </div>
      </div>
    )
  }
)

VencimientosFlyer.displayName = 'VencimientosFlyer'
