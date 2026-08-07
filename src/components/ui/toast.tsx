"use client";

import * as React from "react";
import { Toast as ToastPrimitive } from "@base-ui/react/toast";
import { CircleCheck, CircleX, Info, X } from "lucide-react";

import { cn } from "@/lib/utils";

// Manager a nivel de módulo (no de componente): permite disparar
// toast.add({...}) desde cualquier client component del proyecto sin pasar
// por un hook ni volver a montar un <Toast.Provider> por pantalla. Un solo
// <ToastProvider> en el layout raíz + un solo manager = "misma plantilla"
// para todo el proyecto, tal como se pidió.
const toastManager = ToastPrimitive.createToastManager();

type TipoToast = "success" | "error" | "info";

const TIPO_ICONO: Record<TipoToast, typeof Info> = {
  success: CircleCheck,
  error: CircleX,
  info: Info,
};

// Las clases reales (fondo/borde/texto por tipo) viven en globals.css
// (.toast-success/.toast-error/.toast-info) — acá solo se elige cuál
// aplicar. El ícono no tiene color propio: hereda este mismo texto vía
// currentColor (ver ToastItem más abajo).
const TIPO_ESTILO: Record<TipoToast, string> = {
  success: "toast-success",
  error: "toast-error",
  info: "toast-info",
};

function ToastProvider({ children }: { children: React.ReactNode }) {
  return (
    <ToastPrimitive.Provider toastManager={toastManager} limit={3}>
      {children}
      <ToastViewport />
    </ToastPrimitive.Provider>
  );
}

function ToastViewport() {
  const { toasts } = ToastPrimitive.useToastManager();
  return (
    <ToastPrimitive.Portal>
      <ToastPrimitive.Viewport className="fixed inset-x-4 bottom-4 z-[100] flex flex-col-reverse gap-2 outline-none sm:inset-x-auto sm:right-4 sm:w-full sm:max-w-sm">
        {toasts.map((toast) => (
          <ToastItem key={toast.id} toast={toast} />
        ))}
      </ToastPrimitive.Viewport>
    </ToastPrimitive.Portal>
  );
}

function ToastItem({ toast }: { toast: ToastPrimitive.Root.ToastObject }) {
  const tipo = ((toast.type as TipoToast | undefined) ?? "info") satisfies TipoToast;
  const Icono = TIPO_ICONO[tipo];

  return (
    <ToastPrimitive.Root
      toast={toast}
      className={cn(
        "relative flex items-start gap-2.5 overflow-hidden rounded-lg border border-l-4 py-3 pr-8 pl-3.5 text-sm shadow-md transition-all duration-200",
        TIPO_ESTILO[tipo],
        "data-[starting-style]:translate-y-2 data-[starting-style]:opacity-0",
        "data-[ending-style]:translate-y-2 data-[ending-style]:opacity-0",
      )}
    >
      <Icono className="mt-0.5 size-4 shrink-0" />
      <div className="flex flex-1 flex-col gap-0.5">
        <ToastPrimitive.Title className="font-heading text-sm leading-tight font-semibold" />
        {/* Sin color propio: hereda el tono tintado del Root (TIPO_ESTILO) y
        se atenúa con opacity — así no hay que declarar una variante gris
        por tipo que además rompería el contraste sobre el fondo de color. */}
        <ToastPrimitive.Description className="text-sm opacity-80" />
      </div>
      <ToastPrimitive.Close
        aria-label="Cerrar"
        className="absolute top-2 right-2 rounded-md p-1 opacity-70 outline-none hover:bg-black/10 hover:opacity-100 focus-visible:ring-2 focus-visible:ring-ring/50 dark:hover:bg-white/10"
      >
        <X className="size-3.5" />
      </ToastPrimitive.Close>
    </ToastPrimitive.Root>
  );
}

export { ToastProvider, toastManager };
