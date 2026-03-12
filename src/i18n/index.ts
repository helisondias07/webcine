import ptBR from "./pt-BR";

type Dictionary = typeof ptBR;
type Key = keyof Dictionary;

export function t(key: Key) {
  return ptBR[key] ?? key;
}

