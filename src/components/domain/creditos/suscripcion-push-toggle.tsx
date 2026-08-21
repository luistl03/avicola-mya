"use client";

import { useEffect, useState, useTransition } from "react";
import { Bell, BellOff } from "lucide-react";

import { Button } from "@/components/ui/button";
import { toastManager } from "@/components/ui/toast";
import { eliminarSuscripcionPush, suscribirPush } from "@/server/actions/pushSubscription";

type Estado = "cargando" | "no-soportado" | "activado" | "desactivado";

// VAPID exige la applicationServerKey como Uint8Array, no como el string
// base64url que llega por env var — conversión estándar de la
// especificación Push API (MDN), sin librería nueva.
function urlBase64ToUint8Array(base64Url: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64Url.length % 4)) % 4);
  const base64 = (base64Url + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) {
    bytes[i] = raw.charCodeAt(i);
  }
  return bytes;
}

// Estado inicial calculado en el propio useState (no en un useEffect que
// haga un setState síncrono en su cuerpo — regla react-hooks/set-state-in-effect):
// "cargando" dispara el chequeo async de getSubscription() de abajo,
// "no-soportado" (SSR, o navegador sin Push API) no dispara nada.
function estadoInicial(): Estado {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator) || typeof window === "undefined" || !("PushManager" in window)) {
    return "no-soportado";
  }
  return "cargando";
}

export function SuscripcionPushToggle() {
  const [estado, setEstado] = useState<Estado>(estadoInicial);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (estado !== "cargando") return;
    navigator.serviceWorker.ready
      .then((registro) => registro.pushManager.getSubscription())
      .then((suscripcion) => setEstado(suscripcion ? "activado" : "desactivado"))
      .catch(() => setEstado("no-soportado"));
  }, [estado]);

  function activar() {
    startTransition(async () => {
      const permiso = await Notification.requestPermission();
      if (permiso !== "granted") {
        toastManager.add({
          type: "error",
          priority: "high",
          title: "Notificaciones bloqueadas",
          description: "Revisa los permisos de notificaciones de este sitio en tu navegador e intenta de nuevo.",
        });
        return;
      }

      const registro = await navigator.serviceWorker.ready;
      const suscripcion = await registro.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? ""),
      });
      const { endpoint, keys } = suscripcion.toJSON() as {
        endpoint: string;
        keys: { p256dh: string; auth: string };
      };

      const resultado = await suscribirPush({ endpoint, p256dh: keys.p256dh, auth: keys.auth });
      if (!resultado.ok) {
        toastManager.add({
          type: "error",
          priority: "high",
          title: "No se pudo activar la notificación",
          description: resultado.error,
        });
        return;
      }
      setEstado("activado");
      toastManager.add({ type: "success", title: "Notificaciones activadas" });
    });
  }

  function desactivar() {
    startTransition(async () => {
      const registro = await navigator.serviceWorker.ready;
      const suscripcion = await registro.pushManager.getSubscription();
      if (suscripcion) {
        const { endpoint } = suscripcion.toJSON() as { endpoint: string };
        await suscripcion.unsubscribe();
        const resultado = await eliminarSuscripcionPush({ endpoint });
        if (!resultado.ok) {
          toastManager.add({
            type: "error",
            priority: "high",
            title: "No se pudo desactivar la notificación",
            description: resultado.error,
          });
          return;
        }
      }
      setEstado("desactivado");
      toastManager.add({ type: "success", title: "Notificaciones desactivadas" });
    });
  }

  if (estado === "cargando" || estado === "no-soportado") return null;

  if (estado === "activado") {
    return (
      <Button type="button" variant="outline" size="md" disabled={pending} onClick={desactivar}>
        <Bell data-icon="inline-start" />
        {pending ? "Desactivando..." : "Notificaciones activadas"}
      </Button>
    );
  }

  return (
    <Button type="button" variant="outline" size="md" disabled={pending} onClick={activar}>
      <BellOff data-icon="inline-start" />
      {pending ? "Activando..." : "Activar notificaciones"}
    </Button>
  );
}
