import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";

import { Header } from "@/components/header";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Anti-FOUC (CAT-09): aplica la clase .dark antes del paint. Default:
// preferencia del sistema. Sin dependencias nuevas (no next-themes).
const themeScript = `(function () {
  try {
    var stored = localStorage.getItem('theme');
    var dark =
      stored === 'dark' ||
      (stored !== 'light' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.classList.toggle('dark', dark);
  } catch (error) {}
})();`;

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"),
  title: {
    default: "ISWDB — el IMDb de las series de YouTube",
    template: "%s · ISWDB",
  },
  description:
    "Catálogo público de series de YouTube: descubre las mejor valoradas, filtra por categoría o canal y consulta las últimas añadidas.",
  openGraph: {
    siteName: "ISWDB",
    locale: "es_ES",
    type: "website",
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="es"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        {/*
         * Script inline para anti-FOUC del tema (CAT-09).
         * Next 16 + React 19 generan warning dev-only "Encountered a script tag",
         * pero este script DEBE ser síncrono antes del paint para evitar flash de tema.
         * NO usar <Script> de next/script: rompe CAT-09 (probado con Playwright).
         */}
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="flex min-h-full flex-col">
        <Header />
        <main className="flex-1">{children}</main>
        <footer className="border-t py-6">
          <div className="mx-auto w-full max-w-6xl px-4 text-sm text-muted-foreground">
            iswdb — el IMDb de las series de YouTube.
          </div>
        </footer>
      </body>
    </html>
  );
}
