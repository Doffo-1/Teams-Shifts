import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Teams Shifts Generator',
  description: 'Manage and generate intelligent shifts for Microsoft Teams',
  icons: {
    icon: '/file.svg',
    apple: '/file.svg',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body suppressHydrationWarning>
        <main className="min-h-screen p-4 sm:p-6 lg:p-8">
          {children}
        </main>
      </body>
    </html>
  );
}
