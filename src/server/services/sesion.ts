import { SESION_IDLE_AVISO_MIN, SESION_IDLE_LIMITE_MIN } from "@/lib/constants";

function minutosTranscurridos(desde: Date, hasta: Date): number {
  return (hasta.getTime() - desde.getTime()) / 60_000;
}

export function estaExpiradaPorInactividad(ultimaActividad: Date, ahora: Date): boolean {
  return minutosTranscurridos(ultimaActividad, ahora) >= SESION_IDLE_LIMITE_MIN;
}

export function debeMostrarAvisoIdle(ultimaActividad: Date, ahora: Date): boolean {
  return minutosTranscurridos(ultimaActividad, ahora) >= SESION_IDLE_AVISO_MIN;
}
