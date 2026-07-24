import { FullHomePage } from "@/components/full-home-page";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { PREVIEW_COOKIE, verifyPreviewSession } from "@/lib/preview-auth";

export default async function PreviewPage() {
  const cookieStore = await cookies();
  if (!verifyPreviewSession(cookieStore.get(PREVIEW_COOKIE)?.value)) {
    redirect("/preview-login?next=/en/preview");
  }
  return <FullHomePage />;
}
