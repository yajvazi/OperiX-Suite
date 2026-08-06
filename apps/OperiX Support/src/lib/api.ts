import { z } from "zod";
import { errorResponse } from "./errors";

export async function readJson<T>(request: Request, schema: z.ZodType<T>): Promise<T> {
  const body: unknown = await request.json();
  return schema.parse(body);
}

export function routeError(error: unknown): Response { return errorResponse(error); }
