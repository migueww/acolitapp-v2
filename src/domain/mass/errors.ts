export class DomainError extends Error {
  readonly statusCode: number;

  constructor(message: string, statusCode: number) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
  }
}

export class ValidationError extends DomainError {
  constructor(message: string) {
    super(message, 400);
  }
}

export class ForbiddenError extends DomainError {
  constructor(message: string) {
    super(message, 403);
  }
}

export class NotFoundError extends DomainError {
  constructor(message: string) {
    super(message, 404);
  }
}

export class ConflictError extends DomainError {
  constructor(message: string) {
    super(message, 409);
  }
}

export const toErrorResponse = (error: unknown): { status: number; message: string } | null => {
  if (error instanceof DomainError) {
    return { status: error.statusCode, message: error.message };
  }

  if (error instanceof Error && error.message === "Não autorizado") {
    return { status: 401, message: error.message };
  }

  return null;
};
