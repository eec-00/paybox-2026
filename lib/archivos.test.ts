import { describe, expect, it } from 'vitest'
import { rutaComprobante, urlArchivo } from './archivos'

const base = 'https://x.supabase.co/storage/v1/object/public/comprobantes/'

describe('urlArchivo', () => {
  it('pasa por /api/archivos un comprobante del bucket', () => {
    expect(urlArchivo(`${base}gastos-conductor/a b.jpg`)).toBe('/api/archivos?ruta=gastos-conductor%2Fa%20b.jpg')
    expect(urlArchivo(`${base}gastos-conductor/a.jpg?t=1`)).toBe('/api/archivos?ruta=gastos-conductor%2Fa.jpg')
  })

  it('deja igual lo que no es del bucket', () => {
    for (const url of ['blob:http://x/1', 'https://otro.com/a.jpg', 'https://x.supabase.co/storage/v1/object/public/otro/a.jpg']) {
      expect(urlArchivo(url)).toBe(url)
    }
  })

  it('una URL dañada no rompe la pantalla', () => {
    expect(rutaComprobante(`${base}%E0%A4%A`)).toBeNull()
    expect(urlArchivo(`${base}%E0%A4%A`)).toBe(`${base}%E0%A4%A`)
  })

  it('decodifica la ruta guardada', () => {
    expect(rutaComprobante(`${base}hitos-servicio/1/a%20b.jpg`)).toBe('hitos-servicio/1/a b.jpg')
  })
})
