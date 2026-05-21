import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { ConductorShell } from './ConductorShell'

export default async function ConductorPortalLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/conductor/login')

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('full_name, role, dni, odoo_employee_name')
    .eq('id', user.id)
    .single()

  if (!profile || (profile.role !== 'conductor' && profile.role !== 'admin')) {
    redirect('/dashboard')
  }

  return (
    <ConductorShell
      conductorName={profile.full_name || profile.odoo_employee_name || 'Conductor'}
    >
      {children}
    </ConductorShell>
  )
}
