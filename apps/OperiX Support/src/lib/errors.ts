import { ZodError } from "zod";

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

export function errorResponse(error: unknown): Response {
  if (error instanceof ApiError) {
    return Response.json({ error: { code: error.code, message: error.message } }, { status: error.status });
  }
  if (error instanceof ZodError) {
    return Response.json({ error: { code: "validation_error", message: "The request could not be validated", details: error.flatten() } }, { status: 400 });
  }
  console.error(JSON.stringify({ level: "error", event: "api_error", error: error instanceof Error ? error.message : String(error) }));
  return Response.json({ error: { code: "internal_error", message: "An unexpected error occurred" } }, { status: 500 });
}
