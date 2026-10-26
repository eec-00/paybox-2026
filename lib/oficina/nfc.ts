// Lectura del link que abre el sticker NFC (NTAG213/215/216 con "UID mirror"
// + "counter mirror" activados en NXP TagWriter). El chip agrega al final del
// link su número de serie (7 bytes = 14 hex) y su contador de toques
// (3 bytes = 6 hex) separados por una "x":
//   https://paybox.eemersonsac.com/oficina/marcar?m=04A1B2C3D4E5F6x00002A

export interface Toque { uid: string; contador: number }

const PATRON = /([0-9A-F]{14})x([0-9A-F]{6})/i

export function leerToque(params: { m?: string | null; uid?: string | null; ctr?: string | null }): Toque | null {
  const match = params.m?.match(PATRON)
  if (match) return { uid: match[1].toUpperCase(), contador: parseInt(match[2], 16) }

  // Variante con parámetros separados (?uid=...&ctr=...)
  if (params.uid && params.ctr && /^[0-9A-F]{14}$/i.test(params.uid) && /^[0-9A-F]{1,6}$/i.test(params.ctr)) {
    return { uid: params.uid.toUpperCase(), contador: parseInt(params.ctr, 16) }
  }
  return null
}
