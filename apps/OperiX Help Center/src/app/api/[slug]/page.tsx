import { redirect } from "next/navigation";

export default async function ApiSectionAlias({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  redirect(`/en/api/${slug}`);
}
