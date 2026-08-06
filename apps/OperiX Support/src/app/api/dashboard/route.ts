import { getSupportContext, SUPPORT_PERMISSIONS } from "@/lib/auth";
import { routeError } from "@/lib/api";
import { getDashboard } from "@/lib/support-data";

export async function GET() {
  try { return Response.json(await getDashboard(await getSupportContext(SUPPORT_PERMISSIONS.dashboardView))); }
  catch (error) { return routeError(error); }
}
