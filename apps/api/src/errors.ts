export class BusinessError extends Error {
  readonly code = 'BUSINESS_RULE_VIOLATION';
  readonly status = 400;
  constructor(message: string) {
    super(message);
    this.name = 'BusinessError';
  }
}

export class ValidationError extends Error {
  readonly code = 'VALIDATION_FAILED';
  readonly status = 400;
  readonly details: { field?: string; code: string; message: string }[];
  constructor(message: string, details: { field?: string; code: string; message: string }[] = []) {
    super(message);
    this.name = 'ValidationError';
    this.details = details;
  }
}

export class ConflictError extends Error {
  readonly code = 'CONFLICT';
  readonly status = 409;
  constructor(message: string) {
    super(message);
    this.name = 'ConflictError';
  }
}

export class NotFoundError extends Error {
  readonly code = 'NOT_FOUND';
  readonly status = 404;
  constructor(entity: string, id?: string) {
    super(id ? `${entity} not found: ${id}` : `${entity} not found`);
    this.name = 'NotFoundError';
  }
}

export class PermissionError extends Error {
  readonly code = 'FORBIDDEN';
  readonly status = 403;
  constructor(message = 'Forbidden') {
    super(message);
    this.name = 'PermissionError';
  }
}

export class PeriodLockedError extends Error {
  readonly code = 'PERIOD_LOCKED';
  readonly status = 423;
  constructor(message = 'This period is locked') {
    super(message);
    this.name = 'PeriodLockedError';
  }
}

export class UnauthenticatedError extends Error {
  readonly code = 'UNAUTHENTICATED';
  readonly status = 401;
  constructor(message = 'Unauthenticated') {
    super(message);
    this.name = 'UnauthenticatedError';
  }
}

export class DuplicateError extends Error {
  readonly code = 'CONFLICT';
  readonly status = 409;
  constructor(message: string) {
    super(message);
    this.name = 'DuplicateError';
  }
}
