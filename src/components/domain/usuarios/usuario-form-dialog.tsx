"use client";

import { useActionState, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Lock, Mail, Pencil, Phone, Plus, Shield, UserPlus, UserRound } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toastManager } from "@/components/ui/toast";
import { crearUsuario, editarUsuario } from "@/server/actions/usuario";
import type { ActionResult } from "@/server/auth/with-auth";

type UsuarioEditable = {
  id: string;
  usuario: string;
  nombre: string;
  celular: string | null;
  email: string | null;
};

type Props = { modo: "crear" } | { modo: "editar"; usuario: UsuarioEditable };

type Estado = ActionResult<{ id: string }> | undefined;

// Inputs y labels más compactos solo acá (h-10 + text-sm, no el h-12 +
// text-base global) — este formulario lo llena el Gerente desde un dialog
// de escritorio/gestión, no un Operario leyendo la pantalla al sol en
// campo, que es el caso que justifica el tamaño táctil grande por defecto
// (ver comentario en ui/button.tsx). Sin esto, el label ("Nombre"), el
// input y el título del modal terminan todos al mismo tamaño de texto (18px
// root) — sin jerarquía visual entre "título de la ventana" e "indicación
// de un campo".
const INPUT_COMPACTO = "h-10 text-sm";
// text-muted-foreground: las indicaciones de campo van en gris medio, no en
// el mismo color que el valor real que escribe el Gerente — así resalta el
// dato, no la etiqueta.
const LABEL_COMPACTO = "text-sm text-muted-foreground";

export function UsuarioFormDialog(props: Props) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          props.modo === "crear" ? (
            <Button variant="default" size="md">
              <Plus data-icon="inline-start" />
              Nuevo usuario
            </Button>
          ) : (
            // outline, no secondary: acción de fila en una tabla densa —
            // el ámbar queda reservado para la única CTA principal de la
            // pantalla (ver regla 60-30-10). El hover de outline rellena el
            // fondo (hover:bg-muted), así el cambio se nota al superponer
            // el cursor, a diferencia del hover sutil de secondary.
            <Button variant="outline" size="sm">
              <Pencil data-icon="inline-start" />
              Editar
            </Button>
          )
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {props.modo === "crear" ? (
              <UserPlus className="size-4 text-primary" />
            ) : (
              <Pencil className="size-4 text-primary" />
            )}
            {props.modo === "crear" ? "Nuevo usuario" : "Editar usuario"}
          </DialogTitle>
          <DialogDescription>
            {props.modo === "crear"
              ? "El usuario queda ACTIVO de inmediato con la contraseña que definas."
              : "Deja  la contraseña en blanco para no cambiarla."}
          </DialogDescription>
        </DialogHeader>

        {/* El formulario vive en un componente aparte, montado solo
        mientras `open` es true. Dos motivos, los dos por bugs reales
        encontrados: (1) Base UI mantiene el contenido del Popup montado
        durante la animación de cierre — si `open` pasa a false y justo
        después llega un `router.refresh()` con props nuevas, los inputs
        no controlados de abajo reciben un `defaultValue` distinto
        estando ya montados (advertencia de Base UI, Sprint 2); (2) el
        `state` de useActionState vivía antes en este componente de
        afuera, que nunca se desmonta al cerrar el Dialog — un error de
        una tanda anterior ("Datos inválidos.") quedaba pegado al reabrir
        el modal sin que el usuario tocara nada (bug real, encontrado en
        Sprint 3 en los dialogs de Galpón/Lote, mismo patrón acá).
        Desmontar todo el subcomponente al cerrar resuelve ambos de una. */}
        {open ? <UsuarioForm {...props} onExito={() => setOpen(false)} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function UsuarioForm(props: Props & { onExito: () => void }) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const accion = props.modo === "crear" ? crearUsuario : editarUsuario;

  // El cierre/reset en éxito se hace acá adentro (no en un useEffect que
  // reaccione a `state`) — llamar setState dentro de un efecto dispara
  // renders en cascada; como ya estamos en el callback async de la action,
  // no hace falta ese paso intermedio.
  const [state, formAction, pending] = useActionState<Estado, FormData>(async (_prev, formData) => {
    const resultado = await accion(formData);
    if (resultado.ok) {
      router.refresh();
      toastManager.add({
        type: "success",
        title: props.modo === "crear" ? "Usuario creado" : "Usuario actualizado",
        description: `${formData.get("nombre")}`,
      });
      props.onExito();
    }
    return resultado;
  }, undefined);

  const erroresDe = (campo: string): string[] | undefined =>
    state && !state.ok ? state.campos?.[campo] : undefined;

  return (
    <form ref={formRef} action={formAction} className="flex flex-col gap-4">
      {props.modo === "editar" ? (
        <input type="hidden" name="usuarioId" value={props.usuario.id} />
      ) : null}

      {state && !state.ok ? (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      ) : null}

      <div className="flex flex-col gap-2">
        <Label htmlFor="usuario" className={LABEL_COMPACTO}>
          <UserRound className="size-4 text-muted-foreground" />
          Usuario
        </Label>
        <Input
          id="usuario"
          name="usuario"
          required
          autoFocus
          defaultValue={props.modo === "editar" ? props.usuario.usuario : undefined}
          className={INPUT_COMPACTO}
        />
        {erroresDe("usuario")?.map((error) => (
          <p key={error} role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ))}
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="nombre" className={LABEL_COMPACTO}>
          <UserRound className="size-4 text-muted-foreground" />
          Nombre
        </Label>
        <Input
          id="nombre"
          name="nombre"
          required
          defaultValue={props.modo === "editar" ? props.usuario.nombre : undefined}
          className={INPUT_COMPACTO}
        />
        {erroresDe("nombre")?.map((error) => (
          <p key={error} role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ))}
      </div>

      {props.modo === "crear" ? (
        <div className="flex flex-col gap-2">
          <Label htmlFor="rol" className={LABEL_COMPACTO}>
            <Shield className="size-4 text-muted-foreground" />
            Rol
          </Label>
          <Select name="rol" defaultValue="OPERARIO">
            <SelectTrigger id="rol" className="h-10 w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="OPERARIO">Operario</SelectItem>
              <SelectItem value="GERENTE">Gerente</SelectItem>
            </SelectContent>
          </Select>
        </div>
      ) : null}

      <div className="flex flex-col gap-2">
        <Label htmlFor="password" className={LABEL_COMPACTO}>
          <Lock className="size-4 text-muted-foreground" />
          {props.modo === "crear" ? "Contraseña" : "Nueva contraseña (opcional)"}
        </Label>
        <Input
          id="password"
          name="password"
          type="password"
          required={props.modo === "crear"}
          autoComplete="new-password"
          className={INPUT_COMPACTO}
        />
        {erroresDe("password")?.map((error) => (
          <p key={error} role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ))}
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="celular" className={LABEL_COMPACTO}>
          <Phone className="size-4 text-muted-foreground" />
          Celular (opcional)
        </Label>
        <Input
          id="celular"
          name="celular"
          defaultValue={props.modo === "editar" ? (props.usuario.celular ?? "") : undefined}
          className={INPUT_COMPACTO}
        />
        {erroresDe("celular")?.map((error) => (
          <p key={error} role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ))}
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="email" className={LABEL_COMPACTO}>
          <Mail className="size-4 text-muted-foreground" />
          Email (opcional)
        </Label>
        <Input
          id="email"
          name="email"
          type="email"
          defaultValue={props.modo === "editar" ? (props.usuario.email ?? "") : undefined}
          className={INPUT_COMPACTO}
        />
        {erroresDe("email")?.map((error) => (
          <p key={error} role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ))}
      </div>

      <DialogFooter>
        <Button type="submit" variant="default" size="md" disabled={pending}>
          <Check data-icon="inline-start" />
          {pending ? "Guardando..." : "Guardar"}
        </Button>
      </DialogFooter>
    </form>
  );
}
