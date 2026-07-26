import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as SonnerToaster } from "@/components/ui/sonner";
import { ThemeProvider } from "@/components/theme/ThemeProvider";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Dungeon and Soccer · Monte seu Time dos Sonhos",
  description:
    "Dungeon and Soccer: monte seu time de futebol com jogadores do mundo inteiro. Busca em tempo real, formações táticas, gestão de reservas, login de usuários e painel administrativo.",
  keywords: [
    "Dungeon and Soccer",
    "montador de time",
    "futebol",
    "escalacao",
    "jogadores mundiais",
    "tempo real",
    "Next.js",
    "Prisma",
    "Neon",
    "Vercel",
  ],
  authors: [{ name: "Dungeon and Soccer" }],
  icons: {
    icon: "/logo.png",
  },
  openGraph: {
    title: "Dungeon and Soccer · Monte seu Time dos Sonhos",
    description:
      "Monte seu time com jogadores de qualquer liga do mundo. Busca em tempo real e gestão completa de reservas.",
    siteName: "Dungeon and Soccer",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Dungeon and Soccer",
    description: "Monte seu time de futebol com jogadores do mundo inteiro.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground transition-colors duration-300`}
      >
        <ThemeProvider>
          {children}
          <Toaster />
          <SonnerToaster position="top-right" richColors closeButton />
        </ThemeProvider>
      </body>
    </html>
  );
}
