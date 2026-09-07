import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = {
  title: 'Tarefas | Equipe XP',
  icons: { icon: '/xp-factory-logo.png' },
  description: 'Tarefas, responsáveis e prazos da equipe XP.',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
