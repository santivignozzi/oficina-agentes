import type { Metadata, Viewport } from 'next'
import { Figtree, Fredoka, JetBrains_Mono } from 'next/font/google'
import './globals.css'
import { OFFICE } from '@/config'

const display = Fredoka({ variable: '--font-fredoka', subsets: ['latin'], weight: ['500', '600'] })
const text = Figtree({ variable: '--font-figtree', subsets: ['latin'], weight: ['400', '500', '600', '700'] })
const mono = JetBrains_Mono({ variable: '--font-jetbrains', subsets: ['latin'], weight: ['400', '500'] })

export const metadata: Metadata = {
  title: OFFICE.name,
  description: 'Una oficina virtual donde cada personaje es un agente y lo que ves es lo que está pasando.',
}

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#F7F0E5' },
    { media: '(prefers-color-scheme: dark)', color: '#16152A' },
  ],
}

// Corre antes de pintar: si esperara a React, el tema oscuro arrancaría con un fogonazo claro.
const THEME_SCRIPT = `try{var t=localStorage.getItem('ai-office-theme');if(t!=='light'&&t!=='dark'){t=matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'}document.documentElement.dataset.theme=t}catch(e){document.documentElement.dataset.theme='light'}`

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="es" className={`${display.variable} ${text.variable} ${mono.variable} antialiased`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body>{children}</body>
    </html>
  )
}
