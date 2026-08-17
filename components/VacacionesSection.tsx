'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { getCurrentUserProfile } from '@/lib/utils/auth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Checkbox } from '@/components/ui/checkbox'
import {
  CalendarClock, RefreshCw, Search, XCircle, Plus, Pencil, UserX, UserCheck,
  AlertTriangle, Loader2, Users, UserPlus,
} from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import {
  getSaldo, getEstado, getEstadoColor, getEstadoLabel, getEstadoOrden,
  getRegistroVigente, getProximoAviso,
} from '@/lib/vacaciones/calculos'
import { VacacionEmpleadoDetalle } from '@/components/VacacionEmpleadoDetalle'
import type {
  VacacionEmpleadoConDetalle, VacacionEmpresa,
} from '@/lib/types/vacaciones.types'

function fmt(d: string | null | undefined): string {
  if (!d) return '—'
  return new Date(d + 'T00:00:00').toLocaleDateString('es-PE')
}

interface EmpleadoFormState {
  id?: string
  empresa: VacacionEmpresa
  nombre_completo: string
  dni: string
  cargo: string
  area: string
  celular: string
  correo: string
  tipo_contrato: string
  fecha_ingreso: string
  activo: boolean
  user_id: string | null
}

function emptyForm(empresa: VacacionEmpresa): EmpleadoFormState {
  return {
    empresa, nombre_completo: '', dni: '', cargo: '', area: '', celular: '',
    correo: '', tipo_contrato: 'Indefinido', fecha_ingreso: '', activo: true, user_id: null,
  }
}

interface UsuarioVinculable {
  id: string
  full_name: string | null
  email: string
  role: string
  dni: string | null
}

export function VacacionesSection() {
  const supabase = createClient()

  const [empresaTab, setEmpresaTab] = useState<VacacionEmpresa>('EESAC')
  const [empleados, setEmpleados] = useState<VacacionEmpleadoConDetalle[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [mostrarInactivos, setMostrarInactivos] = useState(false)

  const [canCreate, setCanCreate] = useState(false)
  const [canEdit, setCanEdit] = useState(false)
  const [canLinkUser, setCanLinkUser] = useState(false)
  const [usuarios, setUsuarios] = useState<UsuarioVinculable[]>([])
  const [usuariosCargados, setUsuariosCargados] = useState(false)

  const [importOpen, setImportOpen] = useState(false)
  const [importSeleccion, setImportSeleccion] = useState<Record<string, boolean>>({})
  const [importFechaIngreso, setImportFechaIngreso] = useState<Record<string, string>>({})
  const [importSaving, setImportSaving] = useState(false)

  const [detalleEmpleado, setDetalleEmpleado] = useState<VacacionEmpleadoConDetalle | null>(null)

  const [formOpen, setFormOpen] = useState(false)
  const [form, setForm] = useState<EmpleadoFormState>(emptyForm('EESAC'))
  const [saving, setSaving] = useState(false)

  const [bajaEmpleado, setBajaEmpleado] = useState<VacacionEmpleadoConDetalle | null>(null)
  const [bajaSaving, setBajaSaving] = useState(false)

  useEffect(() => {
    (async () => {
      const profile = await getCurrentUserProfile()
      const isPriv = profile?.role === 'admin' || profile?.role === 'developer'
      const mod = profile?.module_permissions?.rrhh
      setCanCreate(isPriv || !!mod?.can_create)
      setCanEdit(isPriv || !!mod?.can_edit)
      // get_rrhh_usuarios() ya se autoriza en el backend (can_manage_vacaciones);
      // no depende de que el rol sea 'admin' literal como sí exige la RLS directa de user_profiles.
      setCanLinkUser(isPriv || !!mod?.enabled)
    })()
  }, [])

  const fetchEmpleados = async () => {
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('vacaciones_empleados')
        .select('*, registros:vacaciones_registros(*), solicitudes:vacaciones_solicitudes(*)')
        .order('nombre_completo', { ascending: true })
      if (error) throw error
      setEmpleados((data as any) || [])
    } catch (err: any) {
      toast.error(err.message || 'Error al cargar trabajadores')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchEmpleados() }, [])

  const loadUsuarios = async () => {
    if (usuariosCargados) return
    const { data, error } = await supabase.rpc('get_rrhh_usuarios')
    if (!error && data) {
      setUsuarios(data as UsuarioVinculable[])
      setUsuariosCargados(true)
    }
  }

  // IDs de usuarios ya vinculados a algún trabajador (en cualquier empresa)
  const usuariosVinculadosIds = useMemo(
    () => new Set(empleados.map((e) => e.user_id).filter((id): id is string => !!id)),
    [empleados]
  )

  // Candidatos para "Importar": conductores/usuarios que aún no tienen un registro de vacaciones
  const usuariosImportables = useMemo(
    () => usuarios.filter((u) => !usuariosVinculadosIds.has(u.id)),
    [usuarios, usuariosVinculadosIds]
  )

  const filtrados = useMemo(() => {
    return empleados
      .filter((e) => e.empresa === empresaTab)
      .filter((e) => mostrarInactivos || e.activo)
      .filter((e) => {
        if (!search.trim()) return true
        const q = search.toLowerCase()
        return e.nombre_completo.toLowerCase().includes(q) || (e.dni || '').includes(q)
      })
      .sort((a, b) => {
        const ra = getRegistroVigente(a.registros)
        const rb = getRegistroVigente(b.registros)
        const oa = ra ? getEstadoOrden(getEstado(ra, a.solicitudes)) : 99
        const ob = rb ? getEstadoOrden(getEstado(rb, b.solicitudes)) : 99
        if (oa !== ob) return oa - ob
        return a.nombre_completo.localeCompare(b.nombre_completo)
      })
  }, [empleados, empresaTab, mostrarInactivos, search])

  const alertas = useMemo(() => {
    return empleados
      .filter((e) => e.activo)
      .filter((e) => {
        const r = getRegistroVigente(e.registros)
        if (!r) return false
        const estado = getEstado(r, e.solicitudes)
        return estado === 'vencido' || estado === 'pendiente'
      }).length
  }, [empleados])

  const openNuevo = async () => {
    setForm(emptyForm(empresaTab))
    if (canLinkUser) await loadUsuarios()
    setFormOpen(true)
  }

  const openEditar = async (e: VacacionEmpleadoConDetalle) => {
    setForm({
      id: e.id,
      empresa: e.empresa,
      nombre_completo: e.nombre_completo,
      dni: e.dni || '',
      cargo: e.cargo || '',
      area: e.area || '',
      celular: e.celular || '',
      correo: e.correo || '',
      tipo_contrato: e.tipo_contrato || '',
      fecha_ingreso: e.fecha_ingreso,
      activo: e.activo,
      user_id: e.user_id,
    })
    if (canLinkUser) await loadUsuarios()
    setFormOpen(true)
  }

  // Al elegir una cuenta a vincular, autocompleta nombre/DNI/correo si aún están vacíos
  const handleVincular = (userId: string | null) => {
    setForm((f) => {
      if (!userId) return { ...f, user_id: null }
      const u = usuarios.find((x) => x.id === userId)
      return {
        ...f,
        user_id: userId,
        nombre_completo: f.nombre_completo.trim() || u?.full_name || u?.email || f.nombre_completo,
        dni: f.dni.trim() || u?.dni || f.dni,
        correo: f.correo.trim() || u?.email || f.correo,
        cargo: f.cargo.trim() || (u?.role === 'conductor' ? 'Conductor' : f.cargo),
      }
    })
  }

  const openImportar = async () => {
    setImportSeleccion({})
    setImportFechaIngreso({})
    await loadUsuarios()
    setImportOpen(true)
  }

  const handleImportar = async () => {
    const seleccionados = usuariosImportables.filter((u) => importSeleccion[u.id])
    if (seleccionados.length === 0) { toast.error('Selecciona al menos un trabajador'); return }

    // Importa los que ya tienen fecha de ingreso; los que faltan quedan
    // seleccionados en la lista para completarlos sin perder el resto.
    const listos = seleccionados.filter((u) => importFechaIngreso[u.id])
    const faltantes = seleccionados.filter((u) => !importFechaIngreso[u.id])

    if (listos.length === 0) {
      toast.error('Ingresa la fecha de ingreso de al menos uno de los seleccionados')
      return
    }

    setImportSaving(true)
    try {
      const payload = listos.map((u) => ({
        empresa: empresaTab,
        nombre_completo: u.full_name || u.email,
        dni: u.dni,
        correo: u.email,
        cargo: u.role === 'conductor' ? 'Conductor' : null,
        tipo_contrato: 'Indefinido',
        fecha_ingreso: importFechaIngreso[u.id],
        user_id: u.id,
      }))
      const { error } = await supabase.from('vacaciones_empleados').insert(payload)
      if (error) throw error
      toast.success(`${listos.length} trabajador${listos.length !== 1 ? 'es' : ''} importado${listos.length !== 1 ? 's' : ''}`)

      if (faltantes.length > 0) {
        toast.error(`Falta la fecha de ingreso de: ${faltantes.map((u) => u.full_name || u.email).join(', ')}. Quedaron seleccionados.`)
        setImportSeleccion(Object.fromEntries(faltantes.map((u) => [u.id, true])))
      } else {
        setImportOpen(false)
      }
      fetchEmpleados()
    } catch (err: any) {
      toast.error(err.message || 'Error al importar')
    } finally {
      setImportSaving(false)
    }
  }

  const handleGuardar = async () => {
    if (!form.nombre_completo.trim()) { toast.error('El nombre es obligatorio'); return }
    if (!form.fecha_ingreso) { toast.error('La fecha de ingreso es obligatoria'); return }

    setSaving(true)
    try {
      const payload = {
        empresa: form.empresa,
        nombre_completo: form.nombre_completo.trim(),
        dni: form.dni.trim() || null,
        cargo: form.cargo.trim() || null,
        area: form.area.trim() || null,
        celular: form.celular.trim() || null,
        correo: form.correo.trim() || null,
        tipo_contrato: form.tipo_contrato.trim() || null,
        fecha_ingreso: form.fecha_ingreso,
        activo: form.activo,
        user_id: form.user_id,
      }

      if (form.id) {
        const { error } = await supabase.from('vacaciones_empleados').update(payload).eq('id', form.id)
        if (error) throw error
        toast.success('Trabajador actualizado')
      } else {
        const { error } = await supabase.from('vacaciones_empleados').insert(payload)
        if (error) throw error
        toast.success('Trabajador registrado')
      }
      setFormOpen(false)
      fetchEmpleados()
    } catch (err: any) {
      toast.error(err.message || 'Error al guardar el trabajador')
    } finally {
      setSaving(false)
    }
  }

  const handleBaja = async () => {
    if (!bajaEmpleado) return
    setBajaSaving(true)
    try {
      const { error } = await supabase
        .from('vacaciones_empleados')
        .update({ activo: !bajaEmpleado.activo })
        .eq('id', bajaEmpleado.id)
      if (error) throw error
      toast.success(bajaEmpleado.activo ? 'Trabajador dado de baja' : 'Trabajador reactivado')
      setBajaEmpleado(null)
      fetchEmpleados()
    } catch (err: any) {
      toast.error(err.message || 'Error al actualizar el trabajador')
    } finally {
      setBajaSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <div className="p-2 bg-primary/10 rounded-lg">
            <CalendarClock className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h2 className="text-xl sm:text-2xl font-bold text-primary tracking-tight">Vacaciones</h2>
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">
              Control de vacaciones del personal
            </p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={fetchEmpleados} disabled={loading} className="h-8 gap-1.5">
          <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
          Actualizar
        </Button>
      </div>

      {alertas > 0 && (
        <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-800">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {alertas} trabajador{alertas !== 1 ? 'es' : ''} con vacaciones pendientes o con aviso vencido.
        </div>
      )}

      {/* Tabs por empresa (los 2 "libros" del Excel) */}
      <div className="flex items-center gap-1 bg-muted/50 p-1 rounded-lg w-fit">
        {(['EESAC', 'EGARCIA'] as VacacionEmpresa[]).map((emp) => (
          <button
            key={emp}
            onClick={() => setEmpresaTab(emp)}
            className={cn(
              'px-4 py-1.5 rounded-md text-sm font-medium transition-colors',
              empresaTab === emp ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {emp}
          </button>
        ))}
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-2 bg-card/40 p-3 rounded-xl border border-border/50 shadow-sm">
        <div className="flex items-center gap-1.5 flex-1 min-w-[180px] bg-background border rounded-lg px-3 h-9">
          <Search className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <input
            type="text"
            placeholder="Buscar por nombre o DNI..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="flex-1 bg-transparent text-xs outline-none placeholder:text-muted-foreground"
          />
        </div>
        <Button
          variant={mostrarInactivos ? 'secondary' : 'outline'}
          size="sm"
          className="h-9 text-xs"
          onClick={() => setMostrarInactivos((v) => !v)}
        >
          {mostrarInactivos ? 'Ocultar inactivos' : 'Mostrar inactivos'}
        </Button>
        {search && (
          <Button variant="ghost" size="sm" onClick={() => setSearch('')} className="h-9 px-2 text-muted-foreground hover:text-destructive">
            <XCircle className="h-4 w-4" />
          </Button>
        )}
        {canCreate && (
          <div className="flex items-center gap-2 ml-auto">
            {canLinkUser && (
              <Button variant="outline" size="sm" className="h-9 gap-1.5" onClick={openImportar}>
                <UserPlus className="h-4 w-4" /> Importar existentes
              </Button>
            )}
            <Button size="sm" className="h-9 gap-1.5" onClick={openNuevo}>
              <Plus className="h-4 w-4" /> Nuevo trabajador
            </Button>
          </div>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground text-sm gap-2">
          <RefreshCw className="h-4 w-4 animate-spin" /> Cargando trabajadores...
        </div>
      ) : filtrados.length === 0 ? (
        <div className="text-center py-16 border rounded-xl">
          <Users className="h-10 w-10 mx-auto text-muted-foreground/40 mb-3" />
          <p className="text-muted-foreground text-sm">No hay trabajadores registrados en {empresaTab}.</p>
          <p className="text-muted-foreground text-xs mt-1">
            El módulo arranca vacío: no importa conductores/usuarios automáticamente.
            {canCreate && canLinkUser && ' Usa "Importar existentes" para traer tus conductores o usuarios ya creados.'}
          </p>
        </div>
      ) : (
        <div className="border rounded-xl overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50 hover:bg-muted/50">
                  <TableHead className="whitespace-nowrap font-bold text-xs">Trabajador</TableHead>
                  <TableHead className="whitespace-nowrap font-bold text-xs">Cargo</TableHead>
                  <TableHead className="whitespace-nowrap font-bold text-xs">F. Ingreso</TableHead>
                  <TableHead className="whitespace-nowrap font-bold text-xs">Récord vigente</TableHead>
                  <TableHead className="whitespace-nowrap font-bold text-xs text-center">Saldo</TableHead>
                  <TableHead className="whitespace-nowrap font-bold text-xs text-center">Estado</TableHead>
                  <TableHead className="whitespace-nowrap font-bold text-xs">Próximo aviso</TableHead>
                  <TableHead className="whitespace-nowrap font-bold text-xs text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtrados.map((e) => {
                  const registro = getRegistroVigente(e.registros)
                  const estado = registro ? getEstado(registro, e.solicitudes) : null
                  const proximoAviso = registro ? getProximoAviso(registro) : null
                  return (
                    <TableRow key={e.id} className={cn(!e.activo && 'opacity-50')}>
                      <TableCell>
                        <div className="font-medium">{e.nombre_completo}</div>
                        <div className="text-xs text-muted-foreground font-mono">{e.dni || '—'}</div>
                      </TableCell>
                      <TableCell className="text-sm">{e.cargo || '—'}</TableCell>
                      <TableCell className="text-sm whitespace-nowrap">{fmt(e.fecha_ingreso)}</TableCell>
                      <TableCell className="text-sm whitespace-nowrap">{registro ? fmt(registro.fecha_record) : 'Sin récord'}</TableCell>
                      <TableCell className="text-sm text-center font-medium">{registro ? getSaldo(registro) : '—'}</TableCell>
                      <TableCell className="text-center">
                        {estado ? (
                          <span className={cn('inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium', getEstadoColor(estado))}>
                            {getEstadoLabel(estado)}
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-sm whitespace-nowrap">
                        {proximoAviso ? fmt(proximoAviso.toISOString().slice(0, 10)) : '—'}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button size="sm" variant="outline" onClick={() => setDetalleEmpleado(e)}>Gestionar</Button>
                          {canEdit && (
                            <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => openEditar(e)}>
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                          )}
                          {canEdit && (
                            <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setBajaEmpleado(e)}>
                              {e.activo ? <UserX className="h-3.5 w-3.5 text-red-600" /> : <UserCheck className="h-3.5 w-3.5 text-green-600" />}
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      {detalleEmpleado && (
        <VacacionEmpleadoDetalle
          empleado={empleados.find((e) => e.id === detalleEmpleado.id) || detalleEmpleado}
          open={!!detalleEmpleado}
          onClose={() => setDetalleEmpleado(null)}
          onChanged={fetchEmpleados}
          canCreate={canCreate}
          canEdit={canEdit}
          canDelete={canEdit}
        />
      )}

      {/* Alta / edición de trabajador */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{form.id ? 'Editar trabajador' : 'Nuevo trabajador'}</DialogTitle>
            <DialogDescription>{form.empresa}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Empresa</Label>
              <Select value={form.empresa} onValueChange={(v) => setForm((f) => ({ ...f, empresa: v as VacacionEmpresa }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="EESAC">EESAC</SelectItem>
                  <SelectItem value="EGARCIA">EGARCIA</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {canLinkUser && (
              <div>
                <Label>Trabajador ya registrado en el sistema (opcional)</Label>
                <Select value={form.user_id || '__none__'} onValueChange={(v) => handleVincular(v === '__none__' ? null : v)}>
                  <SelectTrigger><SelectValue placeholder="Elegir conductor o usuario existente" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Sin vincular / escribir manualmente</SelectItem>
                    {usuarios
                      .filter((u) => !usuariosVinculadosIds.has(u.id) || u.id === form.user_id)
                      .map((u) => (
                        <SelectItem key={u.id} value={u.id}>{u.full_name || u.email} ({u.role})</SelectItem>
                      ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground mt-1">
                  Autocompleta nombre, DNI y correo, y le permite ver este registro desde su propio acceso.
                </p>
              </div>
            )}
            <div>
              <Label>Nombre completo</Label>
              <Input value={form.nombre_completo} onChange={(e) => setForm((f) => ({ ...f, nombre_completo: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>DNI</Label>
                <Input value={form.dni} onChange={(e) => setForm((f) => ({ ...f, dni: e.target.value }))} />
              </div>
              <div>
                <Label>Fecha de ingreso</Label>
                <Input type="date" value={form.fecha_ingreso} onChange={(e) => setForm((f) => ({ ...f, fecha_ingreso: e.target.value }))} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Cargo</Label>
                <Input value={form.cargo} onChange={(e) => setForm((f) => ({ ...f, cargo: e.target.value }))} placeholder="Conductor" />
              </div>
              <div>
                <Label>Área</Label>
                <Input value={form.area} onChange={(e) => setForm((f) => ({ ...f, area: e.target.value }))} placeholder="Operativo" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Celular</Label>
                <Input value={form.celular} onChange={(e) => setForm((f) => ({ ...f, celular: e.target.value }))} />
              </div>
              <div>
                <Label>Correo</Label>
                <Input value={form.correo} onChange={(e) => setForm((f) => ({ ...f, correo: e.target.value }))} />
              </div>
            </div>
            <div>
              <Label>Tipo de contrato</Label>
              <Input value={form.tipo_contrato} onChange={(e) => setForm((f) => ({ ...f, tipo_contrato: e.target.value }))} />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setFormOpen(false)}>Cancelar</Button>
            <Button onClick={handleGuardar} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : (form.id ? 'Guardar cambios' : 'Registrar')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!bajaEmpleado} onOpenChange={(o) => !o && setBajaEmpleado(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {bajaEmpleado?.activo ? '¿Dar de baja al trabajador?' : '¿Reactivar al trabajador?'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {bajaEmpleado?.activo
                ? `${bajaEmpleado?.nombre_completo} dejará de aparecer en la lista activa. Su historial de vacaciones se conserva.`
                : `${bajaEmpleado?.nombre_completo} volverá a aparecer como trabajador activo.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={bajaSaving}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleBaja} disabled={bajaSaving} className={bajaEmpleado?.activo ? 'bg-red-600 hover:bg-red-700' : ''}>
              {bajaSaving ? 'Guardando...' : (bajaEmpleado?.activo ? 'Dar de baja' : 'Reactivar')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Importar conductores/usuarios ya creados */}
      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Importar a {empresaTab}</DialogTitle>
            <DialogDescription>
              Elige conductores o usuarios ya creados en Paybox e indica su fecha de ingreso (el único dato que no tenemos guardado en su cuenta).
            </DialogDescription>
          </DialogHeader>

          {usuariosImportables.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">
              No hay conductores ni usuarios sin vincular. Todos ya tienen un registro de vacaciones.
            </p>
          ) : (
            <div className="space-y-2">
              {usuariosImportables.map((u) => {
                const checked = !!importSeleccion[u.id]
                const faltaFecha = checked && !importFechaIngreso[u.id]
                return (
                  <div key={u.id} className={cn('border rounded-md p-2.5 flex items-center gap-3', checked && 'border-primary bg-primary/5')}>
                    <Checkbox
                      checked={checked}
                      onCheckedChange={(v) => setImportSeleccion((s) => ({ ...s, [u.id]: !!v }))}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{u.full_name || u.email}</p>
                      <p className="text-xs text-muted-foreground truncate">{u.role} {u.dni ? `· DNI ${u.dni}` : ''}</p>
                    </div>
                    <div>
                      <Input
                        type="date"
                        className={cn('w-[150px] h-8 text-xs', faltaFecha && 'border-red-400 focus-visible:ring-red-400')}
                        disabled={!checked}
                        value={importFechaIngreso[u.id] || ''}
                        onChange={(e) => setImportFechaIngreso((s) => ({ ...s, [u.id]: e.target.value }))}
                      />
                      {faltaFecha && <p className="text-[10px] text-red-500 mt-0.5">Falta fecha</p>}
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setImportOpen(false)}>Cancelar</Button>
            <Button onClick={handleImportar} disabled={importSaving || usuariosImportables.length === 0}>
              {importSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Importar seleccionados'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
