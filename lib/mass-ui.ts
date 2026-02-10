export const statusLabel: Record<string, string> = {
  SCHEDULED: "Agendada",
  OPEN: "Aberta",
  PREPARATION: "Preparação",
  FINISHED: "Finalizada",
  CANCELED: "Cancelada",
};

export const formatDateTime = (value: string | Date) =>
  new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
