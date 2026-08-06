import { getSupportContext, SUPPORT_PERMISSIONS } from "@/lib/auth";
import { routeError } from "@/lib/api";
import { listTickets } from "@/lib/support-data";
import { searchSchema } from "@/lib/validation";

export async function GET(request: Request) {
  try {
    const params = Object.fromEntries(new URL(request.url).searchParams.entries());
    const filters = searchSchema.parse(params);
    return Response.json(await listTickets(await getSupportContext(SUPPORT_PERMISSIONS.ticketView), filters));
  } catch (error) { return routeError(error); }
}
