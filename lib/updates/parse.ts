// Las actualizaciones se escriben con el patrón de CLAUDE.md:
//   MÓDULO: ...
//   USUARIOS BENEFICIADOS O AFECTADOS: ...
//   COSAS NUEVAS: ...
// Se separa en secciones para mostrarlas con formato y usar "Cosas nuevas"
// como resumen. Las antiguas (texto libre) devuelven null y se muestran tal cual.

export interface UpdateSections {
  modulo: string
  usuarios: string
  cosasNuevas: string
}

const SECTION_RE = /^\s*(MÓDULO|MODULO|USUARIOS BENEFICIADOS O AFECTADOS|COSAS NUEVAS)\s*:\s*/gim

export function parseUpdateDescription(description: string): UpdateSections | null {
  const matches = [...description.matchAll(SECTION_RE)]
  if (!matches.length) return null
  const out: Partial<Record<keyof UpdateSections, string>> = {}
  matches.forEach((m, i) => {
    const start = (m.index ?? 0) + m[0].length
    const end = i + 1 < matches.length ? matches[i + 1].index : description.length
    const text = description.slice(start, end).trim()
    const key = m[1].toUpperCase()
    if (key.startsWith('M')) out.modulo = text
    else if (key.startsWith('U')) out.usuarios = text
    else out.cosasNuevas = text
  })
  if (!out.cosasNuevas) return null
  return { modulo: out.modulo ?? '', usuarios: out.usuarios ?? '', cosasNuevas: out.cosasNuevas }
}

/** Texto corto para listas/campanita: "Cosas nuevas" si sigue el patrón, si no la descripción completa. */
export function updateSummary(description: string): string {
  return parseUpdateDescription(description)?.cosasNuevas ?? description.replace(/\*\*/g, '')
}

/** Evento de ventana: alguien marcó una actualización como leída (la campanita recalcula). */
export const UPDATES_VIEWED_EVENT = 'paybox:updates-viewed'
