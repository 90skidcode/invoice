import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import {
  BusinessError,
  ConflictError,
  DuplicateError,
  NotFoundError,
  PeriodLockedError,
  PermissionError,
  UnauthenticatedError,
  ValidationError,
} from '../errors.js';

interface AppError {
  code: string;
  status: number;
  details?: { field?: string; code: string; message: string }[];
}

function isAppError(err: unknown): err is Error & AppError {
  return err instanceof Error && 'code' in err && 'status' in err;
}

export function registerErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler((error, request, reply) => {
    const requestId =
      (request.headers['x-request-id'] as string | undefined) ?? crypto.randomUUID();

    // Log error (never log PII)
    if (isAppError(error) && error.status < 500) {
      request.log.warn({
        err: { code: error.code, message: error.message },
        request_id: requestId,
      });
    } else {
      request.log.error({ err: error, request_id: requestId });
    }

    if (isAppError(error)) {
      const body: Record<string, unknown> = {
        ok: false,
        error: {
          code: error.code,
          message: error.message,
          request_id: requestId,
        },
      };

      if (error instanceof ValidationError && error.details.length > 0) {
        (body['error'] as Record<string, unknown>)['details'] = error.details;
      }

      return reply.status(error.status).send(body);
    }

    // ZodError from fastify-type-provider-zod or manual parse
    if (error.name === 'ZodError') {
      return reply.status(400).send({
        ok: false,
        error: {
          code: 'VALIDATION_FAILED',
          message: 'Request validation failed',
          details: (
            error as unknown as { issues: { path: unknown[]; message: string }[] }
          ).issues?.map((i) => ({
            field: i.path.join('.'),
            code: 'INVALID',
            message: i.message,
          })),
          request_id: requestId,
        },
      });
    }

    // Generic 500
    return reply.status(500).send({
      ok: false,
      error: {
        code: 'INTERNAL',
        message: 'An unexpected error occurred',
        request_id: requestId,
      },
    });
  });
}
