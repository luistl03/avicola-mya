import Image from "next/image";
import { redirect } from "next/navigation";

import { LoginForm } from "@/components/domain/auth/login-form";
import { auth } from "@/server/auth";

function rutaDeRetorno(callbackUrl: string | undefined): string {
  // callbackUrl llega como URL absoluta desde el guard de src/proxy.ts.
  // Solo se usa el pathname: nunca se le pasa el origin tal cual a signIn(),
  // así una manipulación del query param no puede convertirse en un
  // open-redirect a otro dominio.
  if (!callbackUrl) return "/";
  try {
    return new URL(callbackUrl).pathname || "/";
  } catch {
    return callbackUrl.startsWith("/") ? callbackUrl : "/";
  }
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string }>;
}) {
  // Si ya hay sesión activa, /login no tiene nada que hacer por vos — sin
  // esto, el layout raíz igual monta el Sidebar por encima del
  // formulario (decide solo por session, no por ruta), lo que se ve roto.
  const session = await auth();
  if (session?.user) {
    redirect("/");
  }

  const { callbackUrl } = await searchParams;

  return (
    <main className="flex min-h-dvh items-center justify-center bg-background p-4">
      {/* Grid en vez de <Card>: Card asume un solo bloque vertical
          (header/content apilados), no dos paneles lado a lado con un color
          a sangre completa. Se replica a mano el mismo lenguaje visual
          (rounded-2xl, ring, shadow) para que siga viéndose parte del
          mismo sistema. En mobile, sin md:grid-cols-2, el grid cae a una
          sola columna y el panel de marca queda arriba del formulario. */}
      <div className="grid w-full max-w-4xl overflow-hidden rounded-2xl bg-card shadow-lg ring-1 ring-foreground/10 md:grid-cols-2">
        <div className="flex items-center justify-center bg-primary p-10 md:min-h-[520px]">
          {/* El PNG no tiene canal alfa (fondo blanco horneado en la
              imagen) — va dentro de una placa clara propia en vez de
              directo sobre bg-primary, para que el recuadro se vea
              intencional (insignia) y no como un borde blanco suelto. */}
          <div className="rounded-2xl bg-card p-3 shadow-sm">
            {/* width/height=250 son el tamaño intrínseco (desktop); el
                className recorta el tamaño real mostrado en mobile — sin
                esto, el <Image> se renderiza a 250x250 siempre, sin importar
                el viewport (por eso el cambio anterior en el Sidebar no
                afectaba a esta pantalla: eran archivos distintos). */}
            <Image
              src="/avicolamya-imagotipo.png"
              alt="Avícola M&A"
              width={250}
              height={250}
              priority
              className="size-32 md:size-[250px]"
            />
          </div>
        </div>

        <div className="flex flex-col justify-center gap-6 p-8 md:p-12">
          <div className="flex flex-col items-center gap-1 text-center">
            <p className="text-sm font-semibold tracking-widest text-primary uppercase">
              Sistema ERP
            </p>
            <h1 className="text-2xl font-bold uppercase md:text-3xl">Avícola M&A</h1>
          </div>
          <LoginForm callbackUrl={rutaDeRetorno(callbackUrl)} />
        </div>
      </div>
    </main>
  );
}
