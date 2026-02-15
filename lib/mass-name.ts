const capitalize = (value: string): string => (value ? `${value.charAt(0).toUpperCase()}${value.slice(1)}` : value);

export const formatMassFallbackName = (scheduledAt: string | Date): string => {
  const date = new Date(scheduledAt);
  const weekday = capitalize(
    new Intl.DateTimeFormat("pt-BR", {
      weekday: "long",
    }).format(date)
  );
  const time = new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);

  return `${weekday}, ${time}`;
};

export const resolveMassName = (name: string | null | undefined, scheduledAt: string | Date): string => {
  const trimmed = typeof name === "string" ? name.trim() : "";
  if (trimmed) return trimmed;
  return formatMassFallbackName(scheduledAt);
};
