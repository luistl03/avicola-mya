"use client";

import { useRef, useState } from "react";
import { ChevronDown, ChevronUp, FileText, Search } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RegistrarAbonoDialog } from "@/components/domain/creditos/registrar-abono-dialog";
import { buscarClientesAutocompleteAction, obtenerEstadoCuentaAction } from "@/server/actions/cliente";

const DEBOUNCE_MS = 300;

const ETIQUETA_METODO_PAGO: Record<string, string> = {
  EFECTIVO: "Efectivo",
  YAPE: "Yape",
  PLIN: "Plin",
  TRANSFERENCIA: "Transferencia",
};

type ClienteSeleccionado = { id: string; nombre: string };

type Abono = { id: string; fecha: string; monto: number; metodoPago: string };
type CreditoCuenta = {
  id: string;
  montoTotal: number;
  montoPagado: number;
  fechaLimite: string;
  estado: "PENDIENTE" | "LIQUIDADO";
  abonos: Abono[];
};

// Buscador con debounce (mismo patrón que ClienteAutocomplete, Sprint 9,
// reusando buscarClientesAutocompleteAction sin cambios) + detalle
// expandible de créditos y su historial de abonos completo por cliente
// (H6, spec.md — "Estado de cuenta por cliente").
export function EstadoCuentaCliente() {
  const [busqueda, setBusqueda] = useState("");
  const [sugerencias, setSugerencias] = useState<ClienteSeleccionado[]>([]);
  const [buscandoCliente, setBuscandoCliente] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [clienteSeleccionado, setClienteSeleccionado] = useState<ClienteSeleccionado | null>(null);
  const [creditos, setCreditos] = useState<CreditoCuenta[] | null>(null);
  const [cargandoCuenta, setCargandoCuenta] = useState(false);
  const [expandidoId, setExpandidoId] = useState<string | null>(null);

  function actualizarBusqueda(valor: string) {
    setBusqueda(valor);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    const texto = valor.trim();
    if (!texto) {
      setSugerencias([]);
      setBuscandoCliente(false);
      return;
    }
    setBuscandoCliente(true);
    timeoutRef.current = setTimeout(async () => {
      const resultado = await buscarClientesAutocompleteAction(texto);
      setSugerencias(resultado.ok ? resultado.data : []);
      setBuscandoCliente(false);
    }, DEBOUNCE_MS);
  }

  async function cargarEstadoCuenta(clienteId: string) {
    setCargandoCuenta(true);
    const resultado = await obtenerEstadoCuentaAction(clienteId);
    setCreditos(resultado.ok ? resultado.data : []);
    setCargandoCuenta(false);
  }

  async function seleccionarCliente(cliente: ClienteSeleccionado) {
    setClienteSeleccionado(cliente);
    setBusqueda("");
    setSugerencias([]);
    setExpandidoId(null);
    await cargarEstadoCuenta(cliente.id);
  }

  return (
    <div className="flex flex-col gap-4 rounded-lg border border-border p-4">
      <div className="flex items-center gap-2">
        <FileText className="size-4 text-primary" />
        <p className="text-sm font-medium text-foreground">Estado de cuenta por cliente</p>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="estado-cuenta-busqueda" className="text-sm text-muted-foreground">
          Buscar cliente
        </Label>
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            id="estado-cuenta-busqueda"
            value={busqueda}
            onChange={(evento) => actualizarBusqueda(evento.target.value)}
            placeholder="Buscar por nombre o celular..."
            className="h-10 pl-9"
          />
        </div>
        {busqueda.trim() ? (
          <ul className="flex flex-col gap-1">
            {buscandoCliente ? <li className="px-1 py-1 text-sm text-muted-foreground">Buscando...</li> : null}
            {!buscandoCliente && sugerencias.length === 0 ? (
              <li className="px-1 py-1 text-sm text-muted-foreground">Sin coincidencias.</li>
            ) : null}
            {sugerencias.map((sugerencia) => (
              <li key={sugerencia.id}>
                <button
                  type="button"
                  onClick={() => seleccionarCliente(sugerencia)}
                  className="w-full rounded-md px-2 py-1.5 text-left text-sm text-foreground outline-none hover:bg-muted focus-visible:bg-muted"
                >
                  {sugerencia.nombre}
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      {clienteSeleccionado ? (
        <div className="flex flex-col gap-3 border-t border-border pt-3">
          <p className="text-sm font-medium text-foreground">{clienteSeleccionado.nombre}</p>

          {cargandoCuenta ? (
            <p className="text-sm text-muted-foreground">Cargando...</p>
          ) : !creditos || creditos.length === 0 ? (
            <p className="text-sm text-muted-foreground">Este cliente no tiene créditos registrados.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {creditos.map((credito) => {
                const saldo = credito.montoTotal - credito.montoPagado;
                const expandido = expandidoId === credito.id;
                return (
                  <li key={credito.id} className="flex flex-col gap-2 rounded-md border border-border p-3">
                    <button
                      type="button"
                      onClick={() => setExpandidoId(expandido ? null : credito.id)}
                      className="flex w-full items-center justify-between gap-2 text-left"
                    >
                      <span className="flex items-center gap-2 text-sm text-foreground">
                        <Badge
                          variant="outline"
                          className={credito.estado === "PENDIENTE" ? "badge-estado-activo" : "badge-estado-inactivo"}
                        >
                          {credito.estado === "PENDIENTE" ? "Pendiente" : "Liquidado"}
                        </Badge>
                        S/ {credito.montoTotal.toFixed(2)} - pagado S/ {credito.montoPagado.toFixed(2)}
                        {credito.estado === "PENDIENTE" ? ` - saldo S/ ${saldo.toFixed(2)}` : ""}
                      </span>
                      {expandido ? (
                        <ChevronUp className="size-4 text-muted-foreground" />
                      ) : (
                        <ChevronDown className="size-4 text-muted-foreground" />
                      )}
                    </button>
                    <p className="text-xs text-muted-foreground">
                      {/* fechaLimite es una fecha-calendario pura
                      (medianoche UTC, mismo criterio que hoyEnLima()/D5),
                      no un instante real como abono.fecha (abajo, sí
                      formateada en America/Lima) — formatearla en
                      America/Lima le restaría un día. Se formatea en UTC
                      para recuperar el día calendario exacto que se
                      guardó. Bug real encontrado en la verificación clic a
                      clic de S11-20, ver tasks.md. */}
                      Vence: {new Date(credito.fechaLimite).toLocaleDateString("es-PE", { timeZone: "UTC" })}
                    </p>

                    {/* Un Credito PENDIENTE con más de 3 días de margen no
                    aparece en ningún nivel de PanelAlertas — este es el
                    único lugar de la UI donde puede recibir un abono si
                    todavía no está vencido/por vencer. */}
                    {credito.estado === "PENDIENTE" ? (
                      <div>
                        <RegistrarAbonoDialog
                          creditoId={credito.id}
                          saldoPendiente={saldo}
                          onRegistrado={() => cargarEstadoCuenta(clienteSeleccionado!.id)}
                        />
                      </div>
                    ) : null}

                    {expandido ? (
                      <ul className="flex flex-col gap-1 border-t border-border pt-2">
                        {credito.abonos.length === 0 ? (
                          <li className="text-sm text-muted-foreground">Sin abonos registrados todavía.</li>
                        ) : (
                          credito.abonos.map((abono) => (
                            <li
                              key={abono.id}
                              className="flex justify-between text-sm text-muted-foreground"
                            >
                              <span>
                                {new Date(abono.fecha).toLocaleDateString("es-PE", { timeZone: "America/Lima" })} -{" "}
                                {ETIQUETA_METODO_PAGO[abono.metodoPago] ?? abono.metodoPago}
                              </span>
                              <span>S/ {abono.monto.toFixed(2)}</span>
                            </li>
                          ))
                        )}
                      </ul>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
