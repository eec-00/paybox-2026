'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { FileText, DollarSign, TrendingUp, Calendar, CreditCard, User, PieChart } from 'lucide-react'

interface DashboardStats {
  totalPayments: number
  // Soles
  totalAmountSoles: number
  monthlyTotalSoles: number
  userAmountSoles: number
  // Dólares
  totalAmountDolares: number
  monthlyTotalDolares: number
  userAmountDolares: number
  // Counts
  userPayments: number
  todayPayments: number
}

interface PaymentsByMethod {
  method: string
  count: number
  amountSoles: number
  amountDolares: number
}

interface PaymentsByCategory {
  category: string
  count: number
  amountSoles: number
  amountDolares: number
}

interface DailyTrend {
  date: string
  count: number
  amountSoles: number
  amountDolares: number
}

export function Dashboard() {
  const [stats, setStats] = useState<DashboardStats>({
    totalPayments: 0,
    totalAmountSoles: 0,
    monthlyTotalSoles: 0,
    userAmountSoles: 0,
    totalAmountDolares: 0,
    monthlyTotalDolares: 0,
    userAmountDolares: 0,
    userPayments: 0,
    todayPayments: 0
  })
  const [paymentsByMethod, setPaymentsByMethod] = useState<PaymentsByMethod[]>([])
  const [topCategories, setTopCategories] = useState<PaymentsByCategory[]>([])
  const [weeklyTrend, setWeeklyTrend] = useState<DailyTrend[]>([])
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  const fetchStats = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()

      const today = new Date().toISOString().split('T')[0]
      const currentMonth = new Date().toISOString().slice(0, 7)

      const { data: payments, error: paymentsError } = await supabase
        .from('registros')
        .select('*')
        .order('fecha_y_hora_pago', { ascending: false })

      if (paymentsError) {
        console.error('Error en consulta de registros:', paymentsError)
        throw paymentsError
      }

      const { data: categories, error: categoriesError } = await supabase
        .from('categorias')
        .select('*')

      if (categoriesError) {
        console.error('Error en consulta de categorías:', categoriesError)
      }

      const categoriesMap = new Map(
        categories?.map(c => [c.id, c.categoria_nombre]) || []
      )

      const enrichedPayments = payments?.map(p => ({
        ...p,
        categoria_nombre: categoriesMap.get(p.categoria_id) || 'Sin categoría'
      })) || []

      // Helper: separar monto por moneda
      const isSoles = (p: any) => !p.moneda || p.moneda === 'soles'
      const isDolares = (p: any) => p.moneda === 'dolares'

      // Totales globales
      const totalAmountSoles = enrichedPayments
        .filter(isSoles)
        .reduce((sum, p) => sum + (p.monto || 0), 0)
      const totalAmountDolares = enrichedPayments
        .filter(isDolares)
        .reduce((sum, p) => sum + (p.monto || 0), 0)

      // Totales mensuales
      const monthlyPayments = enrichedPayments.filter(p =>
        p.fecha_y_hora_pago?.startsWith(currentMonth)
      )
      const monthlyTotalSoles = monthlyPayments
        .filter(isSoles)
        .reduce((sum, p) => sum + (p.monto || 0), 0)
      const monthlyTotalDolares = monthlyPayments
        .filter(isDolares)
        .reduce((sum, p) => sum + (p.monto || 0), 0)

      // Estadísticas del usuario actual
      const userPayments = enrichedPayments.filter(p => p.creado_por === user?.id)
      const userAmountSoles = userPayments
        .filter(isSoles)
        .reduce((sum, p) => sum + (p.monto || 0), 0)
      const userAmountDolares = userPayments
        .filter(isDolares)
        .reduce((sum, p) => sum + (p.monto || 0), 0)

      // Pagos de hoy
      const todayPaymentsCount = enrichedPayments.filter(p =>
        p.fecha_y_hora_pago?.startsWith(today)
      ).length

      setStats({
        totalPayments: enrichedPayments.length,
        totalAmountSoles,
        monthlyTotalSoles,
        userAmountSoles,
        totalAmountDolares,
        monthlyTotalDolares,
        userAmountDolares,
        userPayments: userPayments.length,
        todayPayments: todayPaymentsCount
      })

      // Agrupar por método de pago (separando monedas)
      const methodsMap = new Map<string, { count: number; amountSoles: number; amountDolares: number }>()
      enrichedPayments.forEach(p => {
        const method = p.metodo_pago || 'Sin especificar'
        const current = methodsMap.get(method) || { count: 0, amountSoles: 0, amountDolares: 0 }
        methodsMap.set(method, {
          count: current.count + 1,
          amountSoles: current.amountSoles + (isSoles(p) ? (p.monto || 0) : 0),
          amountDolares: current.amountDolares + (isDolares(p) ? (p.monto || 0) : 0),
        })
      })
      setPaymentsByMethod(
        Array.from(methodsMap.entries())
          .map(([method, data]) => ({ method, ...data }))
          .sort((a, b) => (b.amountSoles + b.amountDolares) - (a.amountSoles + a.amountDolares))
      )

      // Top 5 categorías (separando monedas)
      const categoriesAmountMap = new Map<string, { count: number; amountSoles: number; amountDolares: number }>()
      enrichedPayments.forEach(p => {
        const category = p.categoria_nombre
        const current = categoriesAmountMap.get(category) || { count: 0, amountSoles: 0, amountDolares: 0 }
        categoriesAmountMap.set(category, {
          count: current.count + 1,
          amountSoles: current.amountSoles + (isSoles(p) ? (p.monto || 0) : 0),
          amountDolares: current.amountDolares + (isDolares(p) ? (p.monto || 0) : 0),
        })
      })
      setTopCategories(
        Array.from(categoriesAmountMap.entries())
          .map(([category, data]) => ({ category, ...data }))
          .sort((a, b) => (b.amountSoles + b.amountDolares) - (a.amountSoles + a.amountDolares))
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
          amountSoles: dayPayments.filter(isSoles).reduce((sum, p) => sum + (p.monto || 0), 0),
          amountDolares: dayPayments.filter(isDolares).reduce((sum, p) => sum + (p.monto || 0), 0),
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

  const hasDolares = stats.totalAmountDolares > 0

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold text-primary mb-2">Dashboard</h2>
        <p className="text-muted-foreground">Resumen general del sistema de gestión de pagos</p>
      </div>

      {/* Tarjetas principales */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {/* Total de Registros */}
        <Card className="hover:shadow-lg transition-shadow border-l-4 border-l-primary">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Registros</CardTitle>
            <FileText className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalPayments}</div>
            <p className="text-xs text-muted-foreground mt-1">En el sistema</p>
          </CardContent>
        </Card>

        {/* Monto Total en Soles */}
        <Card className="hover:shadow-lg transition-shadow border-l-4 border-l-green-500">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Monto Total</CardTitle>
            <DollarSign className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              S/ {stats.totalAmountSoles.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            {hasDolares && (
              <div className="text-sm font-semibold text-amber-600 mt-1">
                $ {stats.totalAmountDolares.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
            )}
            <p className="text-xs text-muted-foreground mt-1">Todos los pagos</p>
          </CardContent>
        </Card>

        {/* Mes Actual */}
        <Card className="hover:shadow-lg transition-shadow border-l-4 border-l-blue-500">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Mes Actual</CardTitle>
            <Calendar className="h-4 w-4 text-blue-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              S/ {stats.monthlyTotalSoles.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            {hasDolares && stats.monthlyTotalDolares > 0 && (
              <div className="text-sm font-semibold text-amber-600 mt-1">
                $ {stats.monthlyTotalDolares.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
            )}
            <p className="text-xs text-muted-foreground mt-1">
              {new Date().toLocaleDateString('es-PE', { month: 'long' })}
            </p>
          </CardContent>
        </Card>

        {/* Mis Registros */}
        <Card className="hover:shadow-lg transition-shadow border-l-4 border-l-secondary">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Mis Registros</CardTitle>
            <User className="h-4 w-4 text-secondary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.userPayments}</div>
            <p className="text-xs text-muted-foreground mt-1">
              S/ {stats.userAmountSoles.toLocaleString('es-PE', { maximumFractionDigits: 0 })}
              {hasDolares && stats.userAmountDolares > 0 && (
                <span className="text-amber-600 ml-1">
                  · $ {stats.userAmountDolares.toLocaleString('es-PE', { maximumFractionDigits: 0 })}
                </span>
              )}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Grid de información detallada */}
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
                const maxSoles = paymentsByMethod[0]?.amountSoles || 1
                const maxDolares = Math.max(...paymentsByMethod.map(m => m.amountDolares), 1)
                const percentageSoles = (method.amountSoles / maxSoles) * 100
                const percentageDolares = (method.amountDolares / maxDolares) * 100

                const barColors = [
                  'bg-primary',
                  'bg-secondary',
                  'bg-green-500',
                  'bg-blue-500',
                  'bg-purple-500',
                ]

                return (
                  <div key={index} className="space-y-1.5">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium">{method.method}</span>
                      <span className="text-muted-foreground">{method.count} pagos</span>
                    </div>
                    {/* Barra soles */}
                    {method.amountSoles > 0 && (
                      <div className="flex items-center gap-3">
                        <div className="flex-1 bg-muted rounded-full h-2">
                          <div
                            className={`h-2 rounded-full transition-all ${barColors[index]}`}
                            style={{ width: `${percentageSoles}%` }}
                          ></div>
                        </div>
                        <span className="text-sm font-bold min-w-[5rem] text-right">
                          S/ {method.amountSoles.toLocaleString('es-PE', { maximumFractionDigits: 0 })}
                        </span>
                      </div>
                    )}
                    {/* Barra dólares */}
                    {method.amountDolares > 0 && (
                      <div className="flex items-center gap-3">
                        <div className="flex-1 bg-muted rounded-full h-2">
                          <div
                            className="h-2 rounded-full transition-all bg-amber-400"
                            style={{ width: `${percentageDolares}%` }}
                          ></div>
                        </div>
                        <span className="text-sm font-bold min-w-[5rem] text-right text-amber-600">
                          $ {method.amountDolares.toLocaleString('es-PE', { maximumFractionDigits: 0 })}
                        </span>
                      </div>
                    )}
                  </div>
                )
              })}
              {paymentsByMethod.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-8">
                  No hay datos disponibles
                </p>
              )}
            </div>

            {/* Leyenda de monedas */}
            {hasDolares && (
              <div className="flex items-center gap-4 mt-4 pt-3 border-t text-xs text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <span className="inline-block w-3 h-3 rounded-full bg-primary"></span>
                  Soles (S/)
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="inline-block w-3 h-3 rounded-full bg-amber-400"></span>
                  Dólares ($)
                </span>
              </div>
            )}
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
                const maxSoles = topCategories[0]?.amountSoles || 1
                const maxDolares = Math.max(...topCategories.map(c => c.amountDolares), 1)
                const percentageSoles = (cat.amountSoles / maxSoles) * 100
                const percentageDolares = (cat.amountDolares / maxDolares) * 100

                return (
                  <div key={index} className="space-y-1.5">
                    <div className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <span className="text-xs font-bold text-muted-foreground">#{index + 1}</span>
                        <span className="font-medium truncate" title={cat.category}>
                          {cat.category}
                        </span>
                      </div>
                      <span className="text-muted-foreground whitespace-nowrap ml-2">{cat.count} registros</span>
                    </div>
                    {/* Barra soles */}
                    {cat.amountSoles > 0 && (
                      <div className="flex items-center gap-3">
                        <div className="flex-1 bg-muted rounded-full h-2">
                          <div
                            className="bg-linear-to-r from-primary to-secondary h-2 rounded-full transition-all"
                            style={{ width: `${percentageSoles}%` }}
                          ></div>
                        </div>
                        <span className="text-sm font-bold min-w-[5rem] text-right">
                          S/ {cat.amountSoles.toLocaleString('es-PE', { maximumFractionDigits: 0 })}
                        </span>
                      </div>
                    )}
                    {/* Barra dólares */}
                    {cat.amountDolares > 0 && (
                      <div className="flex items-center gap-3">
                        <div className="flex-1 bg-muted rounded-full h-2">
                          <div
                            className="h-2 rounded-full transition-all bg-amber-400"
                            style={{ width: `${percentageDolares}%` }}
                          ></div>
                        </div>
                        <span className="text-sm font-bold min-w-[5rem] text-right text-amber-600">
                          $ {cat.amountDolares.toLocaleString('es-PE', { maximumFractionDigits: 0 })}
                        </span>
                      </div>
                    )}
                  </div>
                )
              })}
              {topCategories.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-8">
                  No hay datos disponibles
                </p>
              )}
            </div>

            {/* Leyenda de monedas */}
            {hasDolares && (
              <div className="flex items-center gap-4 mt-4 pt-3 border-t text-xs text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <span className="inline-block w-3 h-3 rounded-full bg-primary"></span>
                  Soles (S/)
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="inline-block w-3 h-3 rounded-full bg-amber-400"></span>
                  Dólares ($)
                </span>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Tendencia Semanal */}
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
              const maxAmount = Math.max(...weeklyTrend.map(d => d.amountSoles + d.amountDolares), 1)
              const totalDay = day.amountSoles + day.amountDolares
              const heightPercentage = (totalDay / maxAmount) * 100

              return (
                <div key={index} className="flex flex-col items-center gap-2">
                  <div className="h-32 w-full flex items-end justify-center">
                    <div
                      className="w-full bg-linear-to-r from-primary to-secondary rounded-t-md transition-all hover:opacity-80 relative group"
                      style={{ height: `${Math.max(heightPercentage, 8)}%` }}
                      title={`${day.count} pagos · S/ ${day.amountSoles.toLocaleString('es-PE', { maximumFractionDigits: 0 })}${day.amountDolares > 0 ? ` · $ ${day.amountDolares.toLocaleString('es-PE', { maximumFractionDigits: 0 })}` : ''}`}
                    >
                      <div className="absolute -top-10 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity bg-primary text-white text-xs px-2 py-1 rounded whitespace-nowrap z-10">
                        <div>{day.count} pagos</div>
                        {day.amountSoles > 0 && <div>S/ {day.amountSoles.toLocaleString('es-PE', { maximumFractionDigits: 0 })}</div>}
                        {day.amountDolares > 0 && <div className="text-amber-300">$ {day.amountDolares.toLocaleString('es-PE', { maximumFractionDigits: 0 })}</div>}
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
