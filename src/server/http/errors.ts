import { NextResponse } from "next/server";

import { DomainError } from "@/src/domain/mass/errors";

export type ApiErrorCode =
  | "VALIDATION_ERROR"
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "RATE_LIMITED"
  | "INTERNAL_ERROR";

type ApiErrorInit = {
  code: ApiErrorCode;
  message: string;
  status: number;
  details?: unknown;
};

export class ApiError extends Error {
  readonly code: ApiErrorCode;
  readonly status: number;
  readonly details?: unknown;

  constructor({ code, message, status, details }: ApiErrorInit) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

const mapDomainErrorCode = (statusCode: number): ApiErrorCode => {
  if (statusCode === 400) return "VALIDATION_ERROR";
  if (statusCode === 403) return "FORBIDDEN";
  if (statusCode === 404) return "NOT_FOUND";
  if (statusCode === 409) return "CONFLICT";
  return "INTERNAL_ERROR";
};

export const asApiError = (error: unknown): ApiError => {
  if (error instanceof ApiError) {
    return error;
  }

  if (error instanceof DomainError) {
    return new ApiError({
      code: mapDomainErrorCode(error.statusCode),
      message: error.message,
      status: error.statusCode,
    });
  }

  if (error instanceof SyntaxError) {
    return new ApiError({
      code: "VALIDATION_ERROR",
      message: "JSON inválido",
      status: 400,
    });
  }

  if (error instanceof Error) {
    if (error.message === "Não autorizado") {
      return new ApiError({
        code: "UNAUTHENTICATED",
        message: error.message,
        status: 401,
      });
    }

    if (error.message === "Acesso negado") {
      return new ApiError({
        code: "FORBIDDEN",
        message: error.message,
        status: 403,
      });
    }
  }

  return new ApiError({
    code: "INTERNAL_ERROR",
    message: "Erro no servidor",
    status: 500,
  });
};

export const toHttpResponse = (error: unknown, requestId: string): NextResponse => {
  const apiError = asApiError(error);

  const errorBody: {
    error: { code: ApiErrorCode; message: string; requestId: string; details?: unknown };
  } = {
    error: {
      code: apiError.code,
      message: apiError.message,
      requestId,
    },
  };

  if (apiError.details !== undefined) {
    errorBody.error.details = apiError.details;
  }

  if (apiError.status === 500 && process.env.NODE_ENV !== "production" && error instanceof Error) {
    errorBody.error.details = {
      ...(typeof errorBody.error.details === "object" && errorBody.error.details !== null
        ? (errorBody.error.details as object)
        : {}),
      reason: error.message,
    };
  }

  return NextResponse.json(errorBody, {
    status: apiError.status,
    headers: { "x-request-id": requestId },
  });
};
