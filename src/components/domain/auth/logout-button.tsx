import { LogOut } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { logout } from "@/server/actions/auth";

export function LogoutButton({ iconOnly = false }: { iconOnly?: boolean }) {
  if (iconOnly) {
    return (
      <form action={logout}>
        {/* Mismo patrón que SidebarMenuButton con `tooltip`: acá el ícono
            solo no alcanza para explicar la acción, así que se agrega a
            mano en vez de depender de un `title` nativo. */}
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                type="submit"
                variant="outline-destructive"
                size="icon-sm"
                aria-label="Cerrar sesión"
              />
            }
          >
            <LogOut />
          </TooltipTrigger>
          <TooltipContent side="right">Cerrar sesión</TooltipContent>
        </Tooltip>
      </form>
    );
  }

  return (
    <form action={logout}>
      <Button type="submit" variant="outline-destructive" size="sm" className="w-full">
        Cerrar sesión
      </Button>
    </form>
  );
}
