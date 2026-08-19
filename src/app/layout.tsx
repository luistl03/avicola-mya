import { SerwistProvider } from "@serwist/turbopack/react";
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { cookies } from "next/headers";
import "./globals.css";

import { IdleTimer } from "@/components/domain/auth/idle-timer";
import { IosInstallBanner } from "@/components/domain/pwa/ios-install-banner";
import { InstallPromptAndroid } from "@/components/domain/pwa/install-prompt-android";
import { PrecargarCatalogos } from "@/components/domain/pwa/precargar-catalogos";
import { AppSidebar } from "@/components/layout/sidebar";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { ToastProvider } from "@/components/ui/toast";
import { TooltipProvider } from "@/components/ui/tooltip";
import { auth } from "@/server/auth";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Avícola M&A",
  description: "Sistema de gestión interna — Avícola M&A",
  icons: {
    icon: "/avicolamya-imagotipo.png",
    apple: "/apple-touch-icon.png",
  },
  appleWebApp: {
    // iOS no lee el manifest para esto — necesita estas meta tags propias
    // (Sprint 13, H2/decisión 4).
    capable: true,
    statusBarStyle: "default",
    title: "Avícola M&A",
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const session = await auth();
  const usuario = session?.user;
  // SidebarProvider guarda la preferencia expandido/colapsado en esta cookie
  // (client-side, al togglear). Leerla acá evita el flash de "expandido" en
  // el primer render de una sesión que lo había dejado colapsado.
  const cookieStore = await cookies();
  const sidebarAbierto = cookieStore.get("sidebar_state")?.value !== "false";

  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        <ToastProvider>
          {usuario ? (
            <TooltipProvider>
              <SidebarProvider defaultOpen={sidebarAbierto}>
                <AppSidebar rol={usuario.rol} nombre={usuario.nombre} />
                <SidebarInset>{children}</SidebarInset>
              </SidebarProvider>
            </TooltipProvider>
          ) : (
            children
          )}
          {usuario ? (
            <SerwistProvider swUrl="/serwist/sw.js" reloadOnOnline={false}>
              <IdleTimer />
              <PrecargarCatalogos />
              <InstallPromptAndroid />
              <IosInstallBanner />
            </SerwistProvider>
          ) : null}
        </ToastProvider>
      </body>
    </html>
  );
}
