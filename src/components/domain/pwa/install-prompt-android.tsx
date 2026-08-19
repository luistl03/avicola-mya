"use client";

import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { INSTALL_PROMPT_COOLDOWN_DIAS } from "@/lib/constants";

const STORAGE_KEY = "pwa-install-prompt-cerrado-en";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

// Store mínimo a nivel de módulo, compartido con install-app-button.tsx
// (botón manual de respaldo en el footer del Sidebar) — un solo listener
// global del evento beforeinstallprompt, sin duplicarlo en cada
// componente. Suscripción real (no un no-op): cualquier consumidor con
// useSyncExternalStore se re-renderiza cuando el evento se captura o se
// limpia (appinstalled), no solo en el próximo render disparado por otra
// razón.
type Escucha = () => void;
const escuchas = new Set<Escucha>();
let eventoCapturado: BeforeInstallPromptEvent | null = null;

function establecerEvento(evento: BeforeInstallPromptEvent | null) {
  eventoCapturado = evento;
  for (const escuchar of escuchas) escuchar();
}

export function suscribirseAInstalacion(callback: Escucha) {
  escuchas.add(callback);
  return () => escuchas.delete(callback);
}

export function obtenerInstalacionDisponible() {
  return eventoCapturado !== null;
}

export function dispararInstalacion() {
  void eventoCapturado?.prompt();
}

function dentroDelCooldown(): boolean {
  const guardado = localStorage.getItem(STORAGE_KEY);
  if (!guardado) return false;
  const diasTranscurridos = (Date.now() - Number(guardado)) / 86_400_000;
  return diasTranscurridos < INSTALL_PROMPT_COOLDOWN_DIAS;
}

// Decisión de negocio 3 (spec.md): aparece una vez tras el login; si se
// cierra sin instalar, no vuelve a aparecer solo por
// INSTALL_PROMPT_COOLDOWN_DIAS (localStorage) — el botón manual
// (install-app-button.tsx) sigue disponible antes de que venza ese plazo.
export function InstallPromptAndroid() {
  const [mostrar, setMostrar] = useState(false);

  useEffect(() => {
    const handler = (evento: Event) => {
      evento.preventDefault(); // suprime el mini-infobar nativo de Chrome
      establecerEvento(evento as BeforeInstallPromptEvent);
      if (!dentroDelCooldown()) setMostrar(true);
    };
    const alInstalar = () => {
      establecerEvento(null);
      setMostrar(false);
    };
    window.addEventListener("beforeinstallprompt", handler);
    window.addEventListener("appinstalled", alInstalar);
    return () => {
      window.removeEventListener("beforeinstallprompt", handler);
      window.removeEventListener("appinstalled", alInstalar);
    };
  }, []);

  if (!mostrar) return null;

  return (
    <div className="fixed inset-x-4 bottom-4 z-50 flex items-center justify-between gap-4 rounded-lg border bg-card p-4 text-card-foreground shadow-lg">
      <p className="text-sm">Instalá Avícola M&A en tu celular para abrirla más rápido.</p>
      <div className="flex gap-2">
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            localStorage.setItem(STORAGE_KEY, String(Date.now()));
            setMostrar(false);
          }}
        >
          Ahora no
        </Button>
        <Button
          size="sm"
          onClick={() => {
            dispararInstalacion();
            setMostrar(false);
          }}
        >
          Instalar
        </Button>
      </div>
    </div>
  );
}
