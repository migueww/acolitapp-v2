export type ApiErrorShape = {
  error?: {
    code?: string;
    message?: string;
    requestId?: string;
    details?: unknown;
  };
};

export class ApiClientError extends Error {
  status: number;
  code?: string;

  constructor(status: number, message: string, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

const fallbackMessageByStatus: Record<number, string> = {
  401: "Sessão expirou, faça login novamente.",
  403: "Você não tem permissão para essa ação.",
  404: "Missa não encontrada.",
  409: "Ação inválida para o estado atual da missa.",
};

export const toFriendlyMessage = (status: number, fallback: string) => fallbackMessageByStatus[status] ?? fallback;

export async function apiFetch<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  const response = await fetch(input, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });

  const data = (await response.json().catch(() => ({}))) as T & ApiErrorShape;

  if (!response.ok) {
    const message = toFriendlyMessage(response.status, data.error?.message ?? "Erro ao processar requisição");
    throw new ApiClientError(response.status, message, data.error?.code);
  }

  return data;
}
