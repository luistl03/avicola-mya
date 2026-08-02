"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  SESION_HEARTBEAT_THROTTLE_MS,
  SESION_IDLE_AVISO_MIN,
  SESION_IDLE_LIMITE_MIN,
} from "@/lib/constants";
import { logout } from "@/server/actions/auth";
import { registrarActividad } from "@/server/actions/sesion";

const AVISO_MS = SESION_IDLE_AVISO_MIN * 60_000;
const LIMITE_MS = SESION_IDLE_LIMITE_MIN * 60_000;

const EVENTOS_ACTIVIDAD = ["mousemove", "keydown", "touchstart", "scroll", "click"] as const;

export function IdleTimer() {
  const [mostrarAviso, setMostrarAviso] = useState(false);
  const avisoTimeout = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const logoutTimeout = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const ultimoHeartbeat = useRef(0);

  const programarTimers = useCallback(() => {
    clearTimeout(avisoTimeout.current);
    clearTimeout(logoutTimeout.current);
    avisoTimeout.current = setTimeout(() => setMostrarAviso(true), AVISO_MS);
    logoutTimeout.current = setTimeout(() => {
      void logout();
    }, LIMITE_MS);
  }, []);

  const registrarActividadLocal = useCallback(() => {
    const ahora = Date.now();
    // El heartbeat al servidor nunca se dispara más de una vez cada ~60s
    // (SESION_HEARTBEAT_THROTTLE_MS) — un ping por evento de actividad
    // saturaría la conexión a Neon (ver R3 en specs/sprint-01-autenticacion/spec.md).
    if (ahora - ultimoHeartbeat.current >= SESION_HEARTBEAT_THROTTLE_MS) {
      ultimoHeartbeat.current = ahora;
      void registrarActividad();
    }
    setMostrarAviso(false);
    programarTimers();
  }, [programarTimers]);

  useEffect(() => {
    programarTimers();
    for (const evento of EVENTOS_ACTIVIDAD) {
      window.addEventListener(evento, registrarActividadLocal, { passive: true });
    }
    return () => {
      clearTimeout(avisoTimeout.current);
      clearTimeout(logoutTimeout.current);
      for (const evento of EVENTOS_ACTIVIDAD) {
        window.removeEventListener(evento, registrarActividadLocal);
      }
    };
  }, [programarTimers, registrarActividadLocal]);

  if (!mostrarAviso) return null;

  return (
    <div className="fixed inset-x-4 bottom-4 z-50 flex items-center justify-between gap-4 rounded-lg border bg-card p-4 text-card-foreground shadow-lg">
      <p className="text-sm">Tu sesión está por expirar por inactividad.</p>
      <Button size="sm" onClick={registrarActividadLocal}>
        Seguir conectado
      </Button>
    </div>
  );
}
