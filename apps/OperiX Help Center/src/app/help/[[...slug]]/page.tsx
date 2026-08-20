import { redirect } from "next/navigation";

export default async function LegacyHelpRoute({ params }: { params: Promise<{ slug?: string[] }> }) {
  const { slug } = await params;
  redirect(`/en/help${slug?.length ? `/${slug.join("/")}` : ""}`);
}
