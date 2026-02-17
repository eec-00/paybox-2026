'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { FileText, DollarSign, TrendingUp, Calendar, CreditCard, User, PieChart } from 'lucide-react'

interface DashboardStats {
  totalPayments: number
  totalAmount: number
  monthlyTotal: number
  userPayments: number
  userAmount: number
  todayPayments: number
}

interface PaymentsByMethod {
  method: string
  count: number
  amount: number
}

interface PaymentsByCategory {
  category: string
  count: number
  amount: number
}

interface DailyTrend {
  date: string
  count: number
  amount: number
}

export function Dashboard() {
  const [stats, setStats] = useState<DashboardStats>({
    totalPayments: 0,
    totalAmount: 0,
    monthlyTotal: 0,
    userPayments: 0,
    userAmount: 0,
    todayPayments: 0
  })
  const [paymentsByMethod, setPaymentsByMethod] = useState<PaymentsByMethod[]>([])
  const [topCategories, setTopCategories] = useState<PaymentsByCategory[]>([])
  const [weeklyTrend, setWeeklyTrend] = useState<DailyTrend[]>([])
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  const fetchStats = useCallback(async () => {
    try {
      // Obtener usuario actual
      const { data: { user } } = await supabase.auth.getUser()

      // Fecha actual e inicio del mes
      const today = new Date().toISOString().split('T')[0]
      const currentMonth = new Date().toISOString().slice(0, 7)

      // Obtener todos los pagos
      const { data: payments, error: paymentsError } = await supabase
        .from('registros')
        .select('*')
        .order('fecha_y_hora_pago', { ascending: false })

      if (paymentsError) {
        console.error('Error en consulta de registros:', paymentsError)
        throw paymentsError
      }

      // Obtener todas las categorías
      const { data: categories, error: categoriesError } = await supabase
        .from('categorias')
        .select('*')

      if (categoriesError) {
        console.error('Error en consulta de categorías:', categoriesError)
      }

      // Crear mapa de categorías para lookup rápido
      const categoriesMap = new Map(
        categories?.map(c => [c.id, c.categoria_nombre]) || []
      )

      // Enriquecer payments con nombre de categoría
      const enrichedPayments = payments?.map(p => ({
        ...p,
        categoria_nombre: categoriesMap.get(p.categoria_id) || 'Sin categoría'
      })) || []

      // Calcular estadísticas generales
      const totalAmount = enrichedPayments.reduce((sum, p) => sum + (p.monto || 0), 0)
      const monthlyPayments = enrichedPayments.filter(p => 
        p.fecha_y_hora_pago?.startsWith(currentMonth)
      )
      const monthlyTotal = monthlyPayments.reduce((sum, p) => sum + (p.monto || 0), 0)
      
      // Estadísticas del usuario actual
      const userPayments = enrichedPayments.filter(p => p.creado_por === user?.id)
      const userAmount = userPayments.reduce((sum, p) => sum + (p.monto || 0), 0)
      
      // Pagos de hoy
      const todayPaymentsCount = enrichedPayments.filter(p => 
        p.fecha_y_hora_pago?.startsWith(today)
      ).length

      setStats({
        totalPayments: enrichedPayments.length,
        totalAmount,
        monthlyTotal,
        userPayments: userPayments.length,
        userAmount,
        todayPayments: todayPaymentsCount
      })

      // Agrupar por método de pago
      const methodsMap = new Map<string, { count: number; amount: number }>()
      enrichedPayments.forEach(p => {
        const method = p.metodo_pago || 'Sin especificar'
        const current = methodsMap.get(method) || { count: 0, amount: 0 }
        methodsMap.set(method, {
          count: current.count + 1,
          amount: current.amount + (p.monto || 0)
        })
      })
      setPaymentsByMethod(
        Array.from(methodsMap.entries())
          .map(([method, data]) => ({ method, ...data }))
          .sort((a, b) => b.amount - a.amount)
      )

      // Top 5 categorías
      const categoriesAmountMap = new Map<string, { count: number; amount: number }>()
      enrichedPayments.forEach(p => {
        const category = p.categoria_nombre
        const current = categoriesAmountMap.get(category) || { count: 0, amount: 0 }
        categoriesAmountMap.set(category, {
          count: current.count + 1,
          amount: current.amount + (p.monto || 0)
        })
      })
      setTopCategories(
        Array.from(categoriesAmountMap.entries())
          .map(([category, data]) => ({ category, ...data }))
          .sort((a, b) => b.amount - a.amount)
          .slice(0, 3)
      )

      // Tendencia de los últimos 7 días
      const last7Days = Array.from({ length: 7 }, (_, i) => {
        const date = new Date()
        date.setDate(date.getDate() - (6 - i))
        return date.toISOString().split('T')[0]
      })

      const trends = last7Days.map(date => {
        const dayPayments = enrichedPayments.filter(p => 
          p.fecha_y_hora_pago?.startsWith(date)
        )
        return {
          date,
          count: dayPayments.length,
          amount: dayPayments.reduce((sum, p) => sum + (p.monto || 0), 0)
        }
      })
      setWeeklyTrend(trends)

    } catch (error) {
      console.error('Error fetching stats:', error)
    } finally {
      setLoading(false)
    }
  }, [supabase])

  useEffect(() => {
    fetchStats()
  }, [fetchStats])

  if (loading) {
    return (
      <div className="space-y-4">
        <div>
          <h2 className="text-3xl font-bold text-primary mb-2">Dashboard</h2>
          <p className="text-muted-foreground">Cargando información...</p>
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[...Array(6)].map((_, i) => (
            <Card key={i} className="animate-pulse">
              <CardHeader className="pb-2">
                <div className="h-4 bg-muted rounded w-24"></div>
              </CardHeader>
              <CardContent>
                <div className="h-8 bg-muted rounded w-32 mb-2"></div>
                <div className="h-3 bg-muted rounded w-20"></div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold text-primary mb-2">Dashboard</h2>
        <p className="text-muted-foreground">Resumen general del sistema de gestión de pagos</p>
      </div>

      {/* Grid de tarjetas estadísticas principales - Solo las más importantes */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {/* Total de Registros */}
        <Card className="hover:shadow-lg transition-shadow border-l-4 border-l-primary">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Total Registros
            </CardTitle>
            <FileText className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalPayments}</div>
            <p className="text-xs text-muted-foreground mt-1">
              En el sistema
            </p>
          </CardContent>
        </Card>

        {/* Monto Total */}
        <Card className="hover:shadow-lg transition-shadow border-l-4 border-l-green-500">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Monto Total
            </CardTitle>
            <DollarSign className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">S/ {stats.totalAmount.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
            <p className="text-xs text-muted-foreground mt-1">
              Todos los pagos
            </p>
          </CardContent>
        </Card>

        {/* Total del Mes */}
        <Card className="hover:shadow-lg transition-shadow border-l-4 border-l-blue-500">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Mes Actual
            </CardTitle>
            <Calendar className="h-4 w-4 text-blue-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">S/ {stats.monthlyTotal.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {new Date().toLocaleDateString('es-PE', { month: 'long' })}
            </p>
          </CardContent>
        </Card>

        {/* Mis Registros */}
        <Card className="hover:shadow-lg transition-shadow border-l-4 border-l-secondary">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Mis Registros
            </CardTitle>
            <User className="h-4 w-4 text-secondary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.userPayments}</div>
            <p className="text-xs text-muted-foreground mt-1">
              S/ {stats.userAmount.toLocaleString('es-PE', { maximumFractionDigits: 0 })}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Grid de información detallada - Simplificado */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* Distribución por Método de Pago */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CreditCard className="h-5 w-5 text-primary" />
              Por Método de Pago
            </CardTitle>
            <CardDescription>
              Distribución de pagos según el método utilizado
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {paymentsByMethod.slice(0, 5).map((method, index) => {
                const maxAmount = paymentsByMethod[0]?.amount || 1
                const percentage = (method.amount / maxAmount) * 100
                
                return (
                  <div key={index} className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium">{method.method}</span>
                      <span className="text-muted-foreground">{method.count} pagos</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="flex-1 bg-muted rounded-full h-2">
                        <div 
                          className={`h-2 rounded-full transition-all ${
                            index === 0 ? 'bg-primary' :
                            index === 1 ? 'bg-secondary' :
                            index === 2 ? 'bg-green-500' :
                            index === 3 ? 'bg-blue-500' : 'bg-purple-500'
                          }`}
                          style={{ width: `${percentage}%` }}
                        ></div>
                      </div>
                      <span className="text-sm font-bold min-w-20 text-right">
                        S/ {method.amount.toLocaleString('es-PE', { maximumFractionDigits: 0 })}
                      </span>
                    </div>
                  </div>
                )
              })}
              {paymentsByMethod.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-8">
                  No hay datos disponibles
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Top Categorías */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <PieChart className="h-5 w-5 text-primary" />
              Top 3 Categorías
            </CardTitle>
            <CardDescription>
              Categorías con mayor gasto acumulado
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {topCategories.map((cat, index) => {
                const maxAmount = topCategories[0]?.amount || 1
                const percentage = (cat.amount / maxAmount) * 100
                
                return (
                  <div key={index} className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <span className="text-xs font-bold text-muted-foreground">#{index + 1}</span>
                        <span className="font-medium truncate" title={cat.category}>
                          {cat.category}
                        </span>
                      </div>
                      <span className="text-muted-foreground whitespace-nowrap ml-2">{cat.count} registros</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="flex-1 bg-muted rounded-full h-2">
                        <div 
                          className="bg-linear-to-r from-primary to-secondary h-2 rounded-full transition-all"
                          style={{ width: `${percentage}%` }}
                        ></div>
                      </div>
                      <span className="text-sm font-bold min-w-20 text-right">
                        S/ {cat.amount.toLocaleString('es-PE', { maximumFractionDigits: 0 })}
                      </span>
                    </div>
                  </div>
                )
              })}
              {topCategories.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-8">
                  No hay datos disponibles
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tendencia Semanal - Simplificada y más compacta */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-primary" />
            Tendencia de los Últimos 7 Días
          </CardTitle>
          <CardDescription>
            Actividad de registro en la última semana
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-7 gap-2">
            {weeklyTrend.map((day, index) => {
              const date = new Date(day.date)
              const dayName = date.toLocaleDateString('es-PE', { weekday: 'short' })
              const dayNum = date.getDate()
              const maxAmount = Math.max(...weeklyTrend.map(d => d.amount), 1)
              const heightPercentage = (day.amount / maxAmount) * 100
              
              return (
                <div key={index} className="flex flex-col items-center gap-2">
                  <div className="h-32 w-full flex items-end justify-center">
                    <div 
                      className="w-full bg-linear-to-r from-primary to-secondary rounded-t-md transition-all hover:opacity-80 relative group"
                      style={{ height: `${Math.max(heightPercentage, 8)}%` }}
                      title={`${day.count} pagos - S/ ${day.amount.toLocaleString('es-PE', { maximumFractionDigits: 0 })}`}
                    >
                      <div className="absolute -top-8 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity bg-primary text-white text-xs px-2 py-1 rounded whitespace-nowrap">
                        {day.count} pagos
                      </div>
                    </div>
                  </div>
                  <div className="text-center">
                    <p className="text-xs font-medium capitalize">{dayName}</p>
                    <p className="text-xs text-muted-foreground">{dayNum}</p>
                  </div>
                </div>
              )
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
