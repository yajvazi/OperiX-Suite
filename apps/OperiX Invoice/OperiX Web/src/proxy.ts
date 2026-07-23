import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";

export async function proxy(request: NextRequest) { return updateSession(request); }

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|icons/|sw.js|.*\\.(?:svg|png|jpg|jpeg|gif|webp|otf|woff|woff2|ttf)$).*)"] };
