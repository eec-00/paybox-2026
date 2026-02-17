'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog'
import { Eye, Pencil, Trash2, Download, Filter } from 'lucide-react'
import { getUserPermissions, isAdmin } from '@/lib/utils/auth'
import type { Registro } from '@/lib/types/database.types'
import { format } from 'date-fns'
import EditPaymentForm from './EditPaymentForm'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

interface PaymentsTableProps {
  refresh?: number
}

export function PaymentsTable({ refresh }: PaymentsTableProps) {
  const [registros, setRegistros] = useState<Registro[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedRegistro, setSelectedRegistro] = useState<Registro | null>(null)
  const [editingRegistro, setEditingRegistro] = useState<Registro | null>(null)
  const [currentUser, setCurrentUser] = useState<any>(null)
  const [isAdminUser, setIsAdminUser] = useState(false)
  const [permissions, setPermissions] = useState({ can_create: false, can_edit: false, can_delete: false })
  const [deleting, setDeleting] = useState<number | null>(null)
  const [filtroExportacion, setFiltroExportacion] = useState<'todos' | 'pendientes' | 'exportados'>('todos')
  const [exporting, setExporting] = useState(false)
  const [estadisticas, setEstadisticas] = useState({ pendientes: 0, exportados: 0, total: 0 })
  const supabase = createClient()

  useEffect(() => {
    loadUser()
    loadRegistros()
    loadEstadisticas()
  }, [refresh, filtroExportacion])

  const loadUser = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      setCurrentUser(user)
      const perms = await getUserPermissions()
      setPermissions(perms)
      const adminStatus = await isAdmin()
      setIsAdminUser(adminStatus)
    } catch (error) {
      console.error('Error loading user:', error)
    }
  }

  const loadRegistros = async () => {
    setLoading(true)
    try {
      console.log('🔄 Cargando registros...')
      
      // Consultar directamente a Supabase sin Edge Functions
      const { data: registros, error } = await supabase
        .from('registros')
        .select(`
          *,
          categoria:categoria_id (
            id,
            categoria_id_texto,
            categoria_nombre,
            ejes_obligatorios
          )
        `)
        .order('created_at', { ascending: false })

      if (error) {
        console.error('❌ Error en query de registros:', error)
        throw error
      }

      console.log('✅ Registros cargados:', registros?.length || 0)

      // Obtener nombres desde user_profiles usando creado_por
      if (registros && registros.length > 0) {
        const userIds = [...new Set(registros.map(r => r.creado_por))]
        console.log('👥 Consultando perfiles para:', userIds.length, 'usuarios')
        
        const { data: profiles, error: profileError } = await supabase
          .from('user_profiles')
          .select('id, full_name')
          .in('id', userIds)
        
        if (profileError) {
          console.error('⚠️ Error al cargar perfiles (continuando sin nombres):', profileError)
          // Continuar sin nombres en lugar de fallar
          const registrosSinNombres = registros.map(r => ({
            ...r,
            nombre_usuario: 'Usuario desconocido'
          }))
          setRegistros(registrosSinNombres)
          return
        }
        
        console.log('✅ Perfiles cargados:', profiles?.length || 0)
        
        if (profiles) {
          const profileMap = new Map(profiles.map(p => [p.id, p.full_name]))
          
          const registrosConNombres = registros.map(r => ({
            ...r,
            nombre_usuario: profileMap.get(r.creado_por) || 'Usuario desconocido'
          }))
          
          setRegistros(registrosConNombres)
          console.log('✅ Registros con nombres asignados')
          return
        }
      }

      console.log('ℹ️ No hay registros o están vacíos')
      setRegistros(registros || [])
    } catch (error: any) {
      console.error('❌ Error al cargar registros:', error)
      console.error('❌ Stack:', error?.stack)
      console.error('❌ Message:', error?.message)
    } finally {
      setLoading(false)
    }
  }

  const loadEstadisticas = async () => {
    try {
      const response = await fetch('/api/export/excel')
      const data = await response.json()
      setEstadisticas(data)
    } catch (error: any) {
      console.error('Error al cargar estadísticas:', error)
    }
  }

  const handleExport = async () => {
    setExporting(true)
    try {
      const response = await fetch('/api/export/excel', {
        method: 'POST',
      })

      if (!response.ok) {
        const errorData = await response.json()
        console.error('❌ Error del servidor:', errorData)
        throw new Error(errorData.details || errorData.error || 'Error al exportar')
      }

      // Descargar el archivo
      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `Gastos_Odoo_${format(new Date(), 'dd-MM-yyyy')}.xlsx`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      window.URL.revokeObjectURL(url)

      console.log('✅ Archivo exportado exitosamente')

      // Recargar datos
      await loadRegistros()
      await loadEstadisticas()
    } catch (error: any) {
      console.error('❌ Error completo:', error)
      alert(`Error al exportar registros: ${error.message}`)
    } finally {
      setExporting(false)
    }
  }

  const formatCurrency = (amount: number, currency: 'soles' | 'dolares') => {
    const symbol = currency === 'soles' ? 'S/' : '$'
    return `${symbol} ${amount.toFixed(2)}`
  }

  const formatDateTime = (dateString: string) => {
    try {
      return format(new Date(dateString), 'dd/MM/yyyy HH:mm')
    } catch {
      return dateString
    }
  }

  const formatDateOnly = (dateString: string) => {
    try {
      return format(new Date(dateString), 'dd/MM/yyyy')
    } catch {
      return dateString
    }
  }

  const handleDelete = async (id: number) => {
    setDeleting(id)
    try {
      const { error } = await supabase
        .from('registros')
        .delete()
        .eq('id', id)

      if (error) throw error

      // Recargar registros
      await loadRegistros()
    } catch (error: any) {
      console.error('Error al eliminar registro:', error)
      alert('Error al eliminar el registro: ' + error.message)
    } finally {
      setDeleting(null)
    }
  }

  const canEditRegistro = (registro: Registro) => {
    if (!currentUser) return false
    if (isAdminUser) return true
    return permissions.can_edit && registro.creado_por === currentUser.id
  }

  const canDeleteRegistro = (registro: Registro) => {
    if (!currentUser) return false
    if (isAdminUser) return true
    return permissions.can_delete && registro.creado_por === currentUser.id
  }

  if (loading) {
    return (
      <Card>
        <CardContent className="py-8">
          <p className="text-center text-muted-foreground">Cargando registros...</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-4">
          <div>
            <CardTitle className="text-primary">Registros de Pagos</CardTitle>
            <CardDescription>
              {registros.length} {registros.length === 1 ? 'registro' : 'registros'} en total
              {estadisticas && (
                <span className="ml-2 text-amber-600 font-medium">
                  • {estadisticas.pendientes} pendientes de exportar
                </span>
              )}
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Select value={filtroExportacion} onValueChange={(value) => {
              if (value === 'todos' || value === 'pendientes' || value === 'exportados') {
                setFiltroExportacion(value)
              }
            }}>
              <SelectTrigger className="w-[180px]">
                <Filter className="h-4 w-4 mr-2" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                <SelectItem value="pendientes">Pendientes</SelectItem>
                <SelectItem value="exportados">Exportados</SelectItem>
              </SelectContent>
            </Select>
            <Button 
              onClick={handleExport} 
              disabled={exporting || !estadisticas || estadisticas.pendientes === 0}
              variant="outline"
              size="sm"
            >
              <Download className="h-4 w-4 mr-2" />
              {exporting ? 'Exportando...' : 'Exportar a Odoo'}
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Subido por</TableHead>
                <TableHead>Fecha y Hora</TableHead>
                <TableHead>Beneficiario</TableHead>
                <TableHead>Tipo de Documento</TableHead>
                <TableHead>Monto</TableHead>
                <TableHead>Categoría</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {registros.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                    No hay registros aún. Crea tu primer registro arriba.
                  </TableCell>
                </TableRow>
              ) : (
                registros.map((registro) => (
                  <TableRow key={registro.id}>
                    <TableCell>
                      <span className="font-medium text-sm">{registro.nombre_usuario || 'Usuario desconocido'}</span>
                    </TableCell>
                    <TableCell className="font-medium">
                      {formatDateTime(registro.fecha_y_hora_pago)}
                    </TableCell>
                    <TableCell>{registro.beneficiario}</TableCell>
                    <TableCell>
                      {registro.tipo_documento ? (
                        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-secondary/10 text-secondary">
                          {registro.tipo_documento === 'factura' ? 'Factura' : 'Comprobante'}
                        </span>
                      ) : (
                        <span className="text-muted-foreground text-xs">-</span>
                      )}
                    </TableCell>
                    <TableCell className="font-semibold">
                      {formatCurrency(registro.monto, registro.moneda)}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="font-medium text-secondary">
                          {registro.categoria?.categoria_id_texto}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {registro.categoria?.categoria_nombre}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Dialog>
                          <DialogTrigger asChild>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setSelectedRegistro(registro)}
                            >
                              <Eye className="h-4 w-4 mr-1" />
                              Ver más
                            </Button>
                          </DialogTrigger>
                          <DialogContent className="max-w-[95vw] lg:max-w-[1400px] max-h-[95vh] overflow-y-auto">
                          <DialogHeader className="pb-4 border-b">
                            <DialogTitle className="text-2xl text-primary">Detalles del Registro</DialogTitle>
                            <DialogDescription className="text-base">
                              Información completa del comprobante
                            </DialogDescription>
                          </DialogHeader>
                          {selectedRegistro && (
                            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 py-4">
                              {/* Columna Izquierda: Información del registro */}
                              <div className="lg:col-span-2 space-y-6">
                                {/* Datos Generales */}
                                <div className="bg-secondary/5 rounded-lg p-6">
                                  <h3 className="font-semibold text-lg text-secondary mb-4 flex items-center gap-2">
                                    <span className="w-1 h-6 bg-secondary rounded"></span>
                                    Datos Generales
                                  </h3>
                                  <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4">
                                    <div className="space-y-1">
                                      <span className="text-xs text-muted-foreground uppercase tracking-wide">Subido por</span>
                                      <p className="font-semibold text-base">{selectedRegistro.nombre_usuario || 'Usuario desconocido'}</p>
                                    </div>
                                    <div className="space-y-1">
                                      <span className="text-xs text-muted-foreground uppercase tracking-wide">Fecha y Hora de Pago</span>
                                      <p className="font-semibold text-base">{formatDateTime(selectedRegistro.fecha_y_hora_pago)}</p>
                                    </div>
                                    <div className="space-y-1">
                                      <span className="text-xs text-muted-foreground uppercase tracking-wide">Beneficiario</span>
                                      <p className="font-semibold text-base">{selectedRegistro.beneficiario}</p>
                                    </div>
                                    <div className="space-y-1">
                                      <span className="text-xs text-muted-foreground uppercase tracking-wide">Monto</span>
                                      <p className="font-bold text-2xl text-primary">
                                        {formatCurrency(selectedRegistro.monto, selectedRegistro.moneda)}
                                      </p>
                                    </div>
                                    <div className="space-y-1">
                                      <span className="text-xs text-muted-foreground uppercase tracking-wide">Método de Pago</span>
                                      <p className="font-semibold text-base">{selectedRegistro.metodo_pago}</p>
                                    </div>
                                    {selectedRegistro.banco_cuenta && (
                                      <div className="space-y-1">
                                        <span className="text-xs text-muted-foreground uppercase tracking-wide">Banco/Cuenta</span>
                                        <p className="font-semibold text-base">{selectedRegistro.banco_cuenta}</p>
                                      </div>
                                    )}
                                    {selectedRegistro.tipo_documento && (
                                      <div className="space-y-1">
                                        <span className="text-xs text-muted-foreground uppercase tracking-wide">Tipo de Documento</span>
                                        <p className="font-semibold text-base capitalize">
                                          {selectedRegistro.tipo_documento}
                                        </p>
                                      </div>
                                    )}
                                    {selectedRegistro.numero_documento && (
                                      <div className="space-y-1">
                                        <span className="text-xs text-muted-foreground uppercase tracking-wide">Número de Documento</span>
                                        <p className="font-semibold text-base">{selectedRegistro.numero_documento}</p>
                                      </div>
                                    )}
                                    {selectedRegistro.ruc && (
                                      <div className="space-y-1">
                                        <span className="text-xs text-muted-foreground uppercase tracking-wide">RUC del Emisor</span>
                                        <p className="font-semibold text-base font-mono">{selectedRegistro.ruc}</p>
                                      </div>
                                    )}
                                    <div className="space-y-1">
                                      <span className="text-xs text-muted-foreground uppercase tracking-wide">Categoría</span>
                                      <p className="font-semibold text-base text-secondary">
                                        {selectedRegistro.categoria?.categoria_id_texto}
                                      </p>
                                      <p className="text-sm text-muted-foreground">{selectedRegistro.categoria?.categoria_nombre}</p>
                                    </div>
                                    {selectedRegistro.descripcion && (
                                      <div className="md:col-span-2 space-y-1">
                                        <span className="text-xs text-muted-foreground uppercase tracking-wide">Descripción / Concepto</span>
                                        <p className="font-medium text-base leading-relaxed p-3 bg-white rounded border">
                                          {selectedRegistro.descripcion}
                                        </p>
                                      </div>
                                    )}
                                  </div>
                                </div>

                                {/* Datos Dinámicos */}
                                {selectedRegistro.datos_dinamicos && Object.keys(selectedRegistro.datos_dinamicos).length > 0 && (
                                  <div className="bg-primary/5 rounded-lg p-6">
                                    <h3 className="font-semibold text-lg text-primary mb-4 flex items-center gap-2">
                                      <span className="w-1 h-6 bg-primary rounded"></span>
                                      Datos Específicos de la Categoría
                                    </h3>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4">
                                      {Object.entries(selectedRegistro.datos_dinamicos).map(([key, value]) => (
                                        <div key={key} className="space-y-1">
                                          <span className="text-xs text-muted-foreground uppercase tracking-wide">{key}</span>
                                          <p className="font-semibold text-base">{String(value)}</p>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )}

                                {/* Metadata */}
                                <div className="bg-muted/30 rounded-lg p-4">
                                  <h3 className="font-semibold text-muted-foreground mb-2 text-sm uppercase tracking-wide">
                                    Información del Sistema
                                  </h3>
                                  <div className="text-sm text-muted-foreground space-y-1">
                                    <p className="flex items-center gap-2">
                                      <span className="font-medium">ID:</span> 
                                      <span className="font-mono bg-muted px-2 py-0.5 rounded">{selectedRegistro.id}</span>
                                    </p>
                                    {selectedRegistro.created_at && (
                                      <p className="flex items-center gap-2">
                                        <span className="font-medium">Creado:</span>
                                        <span>{format(new Date(selectedRegistro.created_at), 'dd/MM/yyyy HH:mm')}</span>
                                      </p>
                                    )}
                                  </div>
                                </div>
                              </div>

                              {/* Columna Derecha: Comprobantes */}
                              <div className="lg:col-span-1">
                                {selectedRegistro.comprobantes && selectedRegistro.comprobantes.length > 0 && (
                                  <div className="bg-white rounded-lg border shadow-sm p-6 sticky top-4">
                                    <h3 className="font-semibold text-lg text-secondary mb-4 flex items-center gap-2">
                                      <span className="w-1 h-6 bg-secondary rounded"></span>
                                      Comprobantes
                                    </h3>
                                    <div className="space-y-4">
                                      {selectedRegistro.comprobantes.map((url, index) => (
                                        <div key={index} className="relative group">
                                          <div className="relative overflow-hidden rounded-lg border-2 border-secondary/20 shadow-md hover:shadow-xl transition-all hover:border-secondary/40">
                                            <div className="aspect-[3/4] relative">
                                              <img
                                                src={url}
                                                alt={`Comprobante ${index + 1}`}
                                                className="w-full h-full object-contain bg-gray-50 transition-transform group-hover:scale-105"
                                                onError={(e) => {
                                                  const target = e.target as HTMLImageElement
                                                  target.src = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="100" height="100"%3E%3Crect fill="%23f5f5f5" width="100" height="100"/%3E%3Ctext fill="%23999" x="50%25" y="50%25" text-anchor="middle" dy=".3em" font-size="12"%3EImagen no disponible%3C/text%3E%3C/svg%3E'
                                                }}
                                              />
                                            </div>
                                            {index === 0 && (
                                              <div className="absolute top-3 left-3 bg-gradient-to-r from-secondary to-secondary/80 text-white px-3 py-1.5 rounded-full text-xs font-bold shadow-lg">
                                                📄 Principal
                                              </div>
                                            )}
                                          </div>
                                          <a
                                            href={url}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="mt-3 flex items-center justify-center gap-2 text-sm text-secondary hover:text-secondary/80 font-semibold hover:underline transition-colors"
                                          >
                                            <Eye className="h-4 w-4" />
                                            Ver en tamaño completo
                                          </a>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )}
                              </div>
                            </div>
                          )}
                        </DialogContent>
                      </Dialog>

                        {canEditRegistro(registro) && (
                          <Dialog open={editingRegistro?.id === registro.id} onOpenChange={(open) => {
                            if (!open) setEditingRegistro(null)
                          }}>
                            <DialogTrigger asChild>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setEditingRegistro(registro)}
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                            </DialogTrigger>
                            <DialogContent className="max-w-[95vw] lg:max-w-[1200px] max-h-[90vh] overflow-y-auto">
                              {editingRegistro && (
                                <EditPaymentForm
                                  registro={editingRegistro}
                                  onSuccess={() => {
                                    setEditingRegistro(null)
                                    loadRegistros()
                                  }}
                                  onCancel={() => setEditingRegistro(null)}
                                />
                              )}
                            </DialogContent>
                          </Dialog>
                        )}

                        {canDeleteRegistro(registro) && (
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button
                                variant="outline"
                                size="sm"
                                disabled={deleting === registro.id}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>¿Eliminar registro?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  Esta acción no se puede deshacer. Se eliminará permanentemente el registro
                                  de pago de {registro.beneficiario} por {formatCurrency(registro.monto, registro.moneda)}.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={() => handleDelete(registro.id)}
                                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                >
                                  {deleting === registro.id ? 'Eliminando...' : 'Eliminar'}
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  )
}
