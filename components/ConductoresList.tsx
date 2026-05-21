'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { Truck, Trash2, AlertCircle, Calendar, Link2, UserX } from 'lucide-react'
import { format } from 'date-fns'
import { createAdminClient } from '@/lib/supabase/admin'

interface ConductorProfile {
  id: string
  full_name: string | null
  dni: string | null
  odoo_employee_id: number | null
  odoo_employee_name: string | null
  last_sign_in_at: string | null
  created_at: string
}

export function ConductoresList() {
  const [conductores, setConductores] = useState<ConductorProfile[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [conductorToDelete, setConductorToDelete] = useState<ConductorProfile | null>(null)
  const [deleting, setDeleting] = useState(false)

  const supabase = createClient()

  useEffect(() => { loadConductores() }, [])

  const loadConductores = async () => {
    setLoading(true)
    setError(null)
    try {
      const { data, error: fetchError } = await supabase
        .from('user_profiles')
        .select('id, full_name, dni, odoo_employee_id, odoo_employee_name, last_sign_in_at, created_at')
        .eq('role', 'conductor')
        .order('full_name', { ascending: true })

      if (fetchError) throw fetchError
      setConductores(data || [])
    } catch (err: any) {
      setError(err.message || 'Error al cargar conductores')
    } finally {
      setLoading(false)
    }
  }

  const handleDeleteClick = (conductor: ConductorProfile) => {
    setConductorToDelete(conductor)
    setDeleteDialogOpen(true)
  }

  const handleConfirmDelete = async () => {
    if (!conductorToDelete) return
    setDeleting(true)
    try {
      const res = await fetch(`/api/users/delete`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: conductorToDelete.id }),
      })
      if (!res.ok) {
        const d = await res.json()
        throw new Error(d.error || 'Error al eliminar')
      }
      await loadConductores()
      setDeleteDialogOpen(false)
      setConductorToDelete(null)
    } catch (err: any) {
      alert(`Error al eliminar conductor: ${err.message}`)
    } finally {
      setDeleting(false)
    }
  }

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Truck className="h-5 w-5" />Conductores</CardTitle>
          <CardDescription>Choferes con acceso al Portal del Conductor</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center p-8">
            <div className="text-center">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
              <p className="mt-2 text-sm text-muted-foreground">Cargando conductores...</p>
            </div>
          </div>
        </CardContent>
      </Card>
    )
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Truck className="h-5 w-5" />Conductores</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2 p-4 bg-red-50 border border-red-200 rounded-lg">
            <AlertCircle className="h-5 w-5 text-red-600" />
            <p className="text-sm text-red-800">{error}</p>
          </div>
          <Button onClick={loadConductores} className="mt-4">Reintentar</Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Truck className="h-5 w-5" />
                Conductores
                <span className="ml-1 text-sm font-normal text-muted-foreground">({conductores.length})</span>
              </CardTitle>
              <CardDescription>Choferes con acceso al Portal del Conductor</CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={loadConductores}>Actualizar</Button>
          </div>
        </CardHeader>
        <CardContent>
          {conductores.length === 0 ? (
            <div className="text-center py-10">
              <UserX className="h-10 w-10 mx-auto text-muted-foreground/40 mb-3" />
              <p className="text-muted-foreground text-sm">No hay conductores registrados.</p>
              <p className="text-muted-foreground text-xs mt-1">Usa el formulario de abajo para crear uno.</p>
            </div>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Conductor</TableHead>
                    <TableHead>DNI</TableHead>
                    <TableHead>Empleado Odoo</TableHead>
                    <TableHead>Último acceso</TableHead>
                    <TableHead className="text-right">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {conductores.map(c => (
                    <TableRow key={c.id}>
                      <TableCell>
                        <span className="font-medium">{c.full_name || 'Sin nombre'}</span>
                      </TableCell>
                      <TableCell>
                        <span className="font-mono text-sm">{c.dni || '—'}</span>
                      </TableCell>
                      <TableCell>
                        {c.odoo_employee_name ? (
                          <div className="flex items-center gap-1.5">
                            <Link2 className="h-3.5 w-3.5 text-green-600 shrink-0" />
                            <span className="text-sm">{c.odoo_employee_name}</span>
                          </div>
                        ) : (
                          <span className="text-sm text-muted-foreground">Sin vincular</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {c.last_sign_in_at ? (
                          <div className="flex items-center gap-1 text-sm">
                            <Calendar className="h-3 w-3" />
                            {format(new Date(c.last_sign_in_at), 'dd/MM/yyyy HH:mm')}
                          </div>
                        ) : (
                          <span className="text-sm text-muted-foreground">Nunca</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => handleDeleteClick(c)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar conductor?</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminará permanentemente la cuenta de <strong>{conductorToDelete?.full_name}</strong> (DNI: {conductorToDelete?.dni}). Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              disabled={deleting}
              className="bg-red-600 hover:bg-red-700"
            >
              {deleting ? 'Eliminando...' : 'Eliminar conductor'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
