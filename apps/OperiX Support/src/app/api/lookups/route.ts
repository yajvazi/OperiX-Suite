import { getSupportContext, SUPPORT_PERMISSIONS } from "@/lib/auth";
import { routeError } from "@/lib/api";
import { getSupportLookups } from "@/lib/support-data";

export async function GET() {
  try { return Response.json({ data: await getSupportLookups(await getSupportContext(SUPPORT_PERMISSIONS.ticketView)) }); }
  catch (error) { return routeError(error); }
}
