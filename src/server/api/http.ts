import "server-only";
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { Prisma } from "@prisma/client";

// =============================================================================
// Error classes
// =============================================================================

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly code?: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

export class BadRequestError extends HttpError {
  constructor(message = "Bad request", details?: unknown) {
    super(400, message, "bad_request", details);
  }
}

export class UnauthorizedError extends HttpError {
  constructor(message = "Authentication required") {
    super(401, message, "unauthorized");
  }
}

export class ForbiddenError extends HttpError {
  constructor(message = "Forbidden") {
    super(403, message, "forbidden");
  }
}

export class NotFoundError extends HttpError {
  constructor(entity = "Resource") {
    super(404, `${entity} not found`, "not_found");
  }
}

export class ConflictError extends HttpError {
  constructor(message = "Conflict", details?: unknown) {
    super(409, message, "conflict", details);
  }
}

export class UnprocessableEntityError extends HttpError {
  constructor(message = "Unprocessable entity", details?: unknown) {
    super(422, message, "unprocessable_entity", details);
  }
}

// =============================================================================
// Response helpers
// =============================================================================

export function ok<T>(data: T, init?: ResponseInit): NextResponse<T> {
  return NextResponse.json(data, init);
}

export function created<T>(data: T): NextResponse<T> {
  return NextResponse.json(data, { status: 201 });
}

export function noContent(): NextResponse {
  return new NextResponse(null, { status: 204 });
}

// =============================================================================
// Error → Response translation
// =============================================================================

export type ErrorBody = {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
};

export function errorResponse(err: unknown): NextResponse<ErrorBody> {
  // Zod validation errors
  if (err instanceof ZodError) {
    return NextResponse.json(
      {
        error: {
          code: "validation_failed",
          message: "Request validation failed",
          details: err.issues.map((i) => ({
            path: i.path.join("."),
            code: i.code,
            message: i.message,
          })),
        },
      },
      { status: 400 },
    );
  }

  // Our typed HttpError
  if (err instanceof HttpError) {
    return NextResponse.json(
      {
        error: {
          code: err.code ?? "error",
          message: err.message,
          details: err.details,
        },
      },
      { status: err.status },
    );
  }

  // Prisma errors
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    // P2025: record not found (e.g. update on non-existent row)
    if (err.code === "P2025") {
      return NextResponse.json(
        { error: { code: "not_found", message: "Record not found" } },
        { status: 404 },
      );
    }
    // P2002: unique constraint violation
    if (err.code === "P2002") {
      return NextResponse.json(
        {
          error: {
            code: "conflict",
            message: "Unique constraint violation",
            details: { target: err.meta?.target },
          },
        },
        { status: 409 },
      );
    }
    // P2003: foreign key violation
    if (err.code === "P2003") {
      return NextResponse.json(
        {
          error: {
            code: "bad_request",
            message: "Related record does not exist",
            details: { field: err.meta?.field_name },
          },
        },
        { status: 400 },
      );
    }
  }

  if (err instanceof Prisma.PrismaClientValidationError) {
    return NextResponse.json(
      {
        error: {
          code: "bad_request",
          message: "Database query validation failed",
        },
      },
      { status: 400 },
    );
  }

  // Unknown — log + 500
  // eslint-disable-next-line no-console
  console.error("[api] unhandled error:", err);
  return NextResponse.json(
    { error: { code: "internal_error", message: "Internal server error" } },
    { status: 500 },
  );
}
