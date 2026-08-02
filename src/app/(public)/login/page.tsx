import Image from "next/image";

import { LoginForm } from "@/components/domain/auth/login-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

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
  const { callbackUrl } = await searchParams;

  return (
    <main className="flex min-h-dvh items-center justify-center bg-muted p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="flex flex-col items-center gap-2 text-center">
          <Image src="/avicola-logo.png" alt="Avícola M&A" width={96} height={96} priority />
          <CardTitle className="text-2xl">Avícola M&A</CardTitle>
          <CardDescription>Ingresa con tu usuario y contraseña</CardDescription>
        </CardHeader>
        <CardContent>
          <LoginForm callbackUrl={rutaDeRetorno(callbackUrl)} />
        </CardContent>
      </Card>
    </main>
  );
}
