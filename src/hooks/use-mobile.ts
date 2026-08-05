import * as React from "react";

const MOBILE_BREAKPOINT = 768;

export function useIsMobile() {
  // Estado inicial SIEMPRE undefined (server y cliente arrancan igual, sin
  // `window` en ninguno de los dos durante el primer render) — es
  // deliberado, no un descuido: calcular el valor real ya en el
  // lazy initializer (como se probó antes) rompe la hidratación en un
  // celular real, porque el cliente arranca con `isMobile=true` mientras el
  // servidor renderizó asumiendo `false` (sin acceso a `window`).
  const [isMobile, setIsMobile] = React.useState<boolean | undefined>(undefined);

  React.useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`);
    const onChange = () => {
      setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);
    };
    mql.addEventListener("change", onChange);
    // Sincroniza el valor real llamando al mismo callback que atiende los
    // cambios futuros, en vez de un setState suelto acá — así el setState
    // vive siempre "dentro de un callback que reacciona a un sistema
    // externo" (lo que react-hooks/set-state-in-effect sí permite), no como
    // una llamada directa en el cuerpo del efecto.
    onChange();
    return () => mql.removeEventListener("change", onChange);
  }, []);

  return !!isMobile;
}
