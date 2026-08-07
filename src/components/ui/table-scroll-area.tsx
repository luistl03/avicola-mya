"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

import { cn } from "@/lib/utils";

type EstadoSombra = "ninguna" | "izquierda" | "derecha" | "ambas";

// Las clases reales (recetas de box-shadow) viven en globals.css
// (.scroll-shadow-*) — acá solo se elige cuál aplicar según hacia dónde
// se puede seguir deslizando, nada de valores de color/sombra sueltos en
// este archivo.
const SOMBRA: Record<EstadoSombra, string> = {
  ninguna: "",
  derecha: "scroll-shadow-derecha",
  izquierda: "scroll-shadow-izquierda",
  ambas: "scroll-shadow-ambas",
};

// Envoltorio de scroll horizontal para toda tabla de datos del proyecto —
// mismo criterio que DataTablePagination/Toast: un solo archivo gobierna
// el comportamiento de todas las tablas futuras (Clientes, Ventas...), no
// se repite en cada una.
export function TableScrollArea({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [estado, setEstado] = useState<EstadoSombra>("ninguna");

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    // Tolerancia de 4px, no 1px: en Safari/iOS el scroll con inercia
    // (momentum) puede disparar el último evento "scroll" un par de
    // píxeles antes de que la posición realmente se asiente en el máximo
    // — con solo 1px de margen, la sombra derecha se quedaba pegada como
    // si todavía faltara deslizar (reportado en iPhone; en Chrome/Android
    // no pasaba porque ahí el evento final sí llega en la posición real).
    const TOLERANCIA_PX = 4;

    // La sombra indica hacia dónde SE PUEDE seguir deslizando, no solo "esta
    // tabla desborda" — al llegar al final del scroll, la del lado ya
    // recorrido desaparece y aparece (o se mantiene) la del lado que falta.
    const chequear = () => {
      const puedeIzquierda = el.scrollLeft > TOLERANCIA_PX;
      const puedeDerecha = el.scrollLeft < el.scrollWidth - el.clientWidth - TOLERANCIA_PX;
      if (puedeIzquierda && puedeDerecha) setEstado("ambas");
      else if (puedeIzquierda) setEstado("izquierda");
      else if (puedeDerecha) setEstado("derecha");
      else setEstado("ninguna");
    };
    chequear();

    // Re-chequeo diferido tras cada evento de scroll (se reinicia en cada
    // uno, así que solo corre una vez que el scroll realmente se detuvo):
    // cubre el mismo caso de iOS desde otro ángulo — aunque el último
    // evento "scroll" del momentum haya llegado con una posición todavía
    // no asentada, este re-chequeo agarra la posición ya quieta 120ms
    // después. `scrollend` (evento dedicado a "el scroll terminó") se suma
    // además donde el navegador lo soporta, como confirmación inmediata.
    let idleTimeout: ReturnType<typeof setTimeout>;
    const chequearDiferido = () => {
      chequear();
      clearTimeout(idleTimeout);
      idleTimeout = setTimeout(chequear, 120);
    };

    // ResizeObserver (no solo window.resize): el ancho disponible también
    // cambia al expandir/colapsar el Sidebar en desktop, sin que la
    // ventana en sí cambie de tamaño. window.resize queda además como
    // respaldo barato para el caso más común en la práctica (rotar el
    // celular), por si el observer tarda en disparar.
    const observer = new ResizeObserver(chequear);
    observer.observe(el);
    el.addEventListener("scroll", chequearDiferido, { passive: true });
    el.addEventListener("scrollend", chequear, { passive: true });
    window.addEventListener("resize", chequear);
    return () => {
      clearTimeout(idleTimeout);
      observer.disconnect();
      el.removeEventListener("scroll", chequearDiferido);
      el.removeEventListener("scrollend", chequear);
      window.removeEventListener("resize", chequear);
    };
  }, []);

  return (
    <div ref={ref} className={cn("overflow-x-auto rounded-lg border", SOMBRA[estado], className)}>
      {children}
    </div>
  );
}
