import { AppShell } from './AppShell'
import { ConfirmProvider } from '@/components/ui/confirm'

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <ConfirmProvider>
      <AppShell>{children}</AppShell>
    </ConfirmProvider>
  )
}
