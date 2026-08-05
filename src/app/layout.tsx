import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { cookies } from "next/headers";
import "./globals.css";

import { IdleTimer } from "@/components/domain/auth/idle-timer";
import { MobileSidebarTrigger } from "@/components/layout/mobile-sidebar-trigger";
import { AppSidebar } from "@/components/layout/sidebar";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
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
        {usuario ? (
          <TooltipProvider>
            <SidebarProvider defaultOpen={sidebarAbierto}>
              <AppSidebar rol={usuario.rol} nombre={usuario.nombre} />
              <MobileSidebarTrigger />
              <SidebarInset>{children}</SidebarInset>
            </SidebarProvider>
          </TooltipProvider>
        ) : (
          children
        )}
        {usuario ? <IdleTimer /> : null}
      </body>
    </html>
  );
}
