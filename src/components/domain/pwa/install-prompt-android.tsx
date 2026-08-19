"use client";

import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { INSTALL_PROMPT_COOLDOWN_DIAS } from "@/lib/constants";

const STORAGE_KEY = "pwa-install-prompt-cerrado-en";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

// __bipEvento lo llena el script inline "beforeInteractive" de
// src/app/layout.tsx — corre ANTES de que React hidrate, capturando el
// evento sin importar cuándo Chrome decida dispararlo. Sin esto, un
// listener agregado recién en un useEffect puede perderse el evento por
// completo: beforeinstallprompt no se vuelve a disparar si ya pasó una
// vez, y en un celular real (más lento que hidratar que un desktop de
// escritorio) Chrome puede dispararlo antes de que React termine de
// montar — hallazgo real, confirmado por el Product Owner probando en su
// Android real: el ícono nativo de instalación de Chrome sí aparecía
// (criterios de instalabilidad cumplidos), pero el banner propio de la
// app nunca se mostraba (el evento se perdía en la carrera).
declare global {
  interface Window {
    __bipEvento?: BeforeInstallPromptEvent | null;
  }
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
    // Si el script inline ya capturó el evento antes de este mount
    // (el caso real que fallaba), lo consume acá — no depende de que el
    // evento se dispare DESPUÉS de que este efecto corra.
    const capturarSiYaLlego = () => {
      if (window.__bipEvento && !eventoCapturado) {
        establecerEvento(window.__bipEvento);
        if (!dentroDelCooldown()) setMostrar(true);
      }
    };
    capturarSiYaLlego();

    // Por si el evento llega DESPUÉS de este mount — el script inline lo
    // captura igual (en window.__bipEvento) y avisa con este evento
    // custom, en vez de que este componente agregue su propio listener
    // de "beforeinstallprompt" (que tendría la misma carrera que se
    // corrigió).
    const alCapturar = () => capturarSiYaLlego();
    const alInstalar = () => {
      establecerEvento(null);
      setMostrar(false);
    };
    window.addEventListener("bip-capturado", alCapturar);
    window.addEventListener("appinstalled", alInstalar);
    return () => {
      window.removeEventListener("bip-capturado", alCapturar);
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
