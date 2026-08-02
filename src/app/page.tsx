import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function Home() {
  return (
    <div className="flex flex-1 items-center justify-center bg-background p-6">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Vista previa del tema</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="usuario">Usuario</Label>
            <Input id="usuario" placeholder="operario1" />
          </div>
          <div className="flex flex-col gap-2">
            <Button>Registrar recolección</Button>
            <Button variant="outline">Cancelar</Button>
            <Button variant="destructive">Eliminar</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
