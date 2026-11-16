import type { Metadata } from 'next'
import { LoginForm } from '@/components/login-form'
import { OFFICE } from '@/config'

export const metadata: Metadata = { title: `Entrar · ${OFFICE.name}` }

export default function Page() {
  return (
    <main className="grid min-h-dvh place-items-center p-4">
      <LoginForm />
    </main>
  )
}
