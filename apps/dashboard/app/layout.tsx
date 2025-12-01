import './globals.css';
import type { ReactNode } from 'react';

export const metadata = {
  title: 'Unified Dashboard',
  description: 'Unified Shipping Platform Dashboard',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-gray-50 text-gray-900">
        <div className="mx-auto max-w-5xl p-6">{children}</div>
      </body>
    </html>
  );
}
