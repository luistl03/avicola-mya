"use client";

import { useSyncExternalStore } from "react";

import { Button } from "@/components/ui/button";

const STORAGE_KEY = "pwa-ios-banner-visto";

function esIosSafariSinInstalar(): boolean {
  const esIos = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const esStandalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as { standalone?: boolean }).standalone === true;
  return esIos && !esStandalone;
}

// Store mínimo a nivel de módulo, compartido con ios-install-button.tsx
// (botón manual "Cómo instalar" del footer del Sidebar) — mismo patrón
// que install-prompt-android.tsx/install-app-button.tsx.
type Escucha = () => void;
const escuchas = new Set<Escucha>();
let visible = false;
let inicializado = false;

function notificar() {
  for (const escuchar of escuchas) escuchar();
}

// Se evalúa una sola vez, la primera vez que algún componente pide el
// snapshot (siempre del lado del cliente — useSyncExternalStore nunca
// llama a getSnapshot durante SSR) — no vuelve a leer el user agent en
// cada llamada, solo el flag ya calculado.
function inicializarSiHaceFalta() {
  if (inicializado) return;
  inicializado = true;
  visible = esIosSafariSinInstalar() && !localStorage.getItem(STORAGE_KEY);
}

export function suscribirseABannerIos(callback: Escucha) {
  escuchas.add(callback);
  return () => escuchas.delete(callback);
}

export function obtenerBannerVisible() {
  inicializarSiHaceFalta();
  return visible;
}

// Usado por ios-install-button.tsx: el botón se muestra en iOS Safari sin
// instalar, sin importar si el banner automático ya se cerró.
export function puedeInstalarEnIos(): boolean {
  inicializarSiHaceFalta();
  return esIosSafariSinInstalar();
}

export function reabrirBannerIos() {
  visible = true;
  notificar();
}

function cerrarBannerIos() {
  localStorage.setItem(STORAGE_KEY, "1");
  visible = false;
  notificar();
}

// SSR: sin navigator/localStorage, nunca visible hasta el cliente.
function obtenerSnapshotServidor() {
  return false;
}

// Decisión de negocio 4 (spec.md): banner automático la primera vez tras
// el login desde iOS Safari sin la app instalada; botón manual
// (ios-install-button.tsx) para volver a verlo después.
export function IosInstallBanner() {
  const bannerVisible = useSyncExternalStore(suscribirseABannerIos, obtenerBannerVisible, obtenerSnapshotServidor);

  if (!bannerVisible) return null;

  return (
    <div className="fixed inset-x-4 bottom-4 z-50 rounded-lg border bg-card p-4 text-card-foreground shadow-lg">
      <p className="mb-2 text-sm font-medium">Instalá Avícola M&A en tu iPhone</p>
      <ol className="mb-3 list-decimal space-y-1 pl-4 text-sm text-muted-foreground">
        <li>Tocá el ícono de Compartir (el cuadrado con la flecha hacia arriba)</li>
        <li>Elegí &quot;Añadir a inicio&quot;</li>
        <li>Confirmá el nombre y tocá &quot;Añadir&quot;</li>
      </ol>
      <Button size="sm" variant="outline" onClick={cerrarBannerIos}>
        Entendido
      </Button>
    </div>
  );
}
