import { notFound } from "next/navigation";
import { redirect } from "next/navigation";
import { ResourcePage } from "@/components/resource-page";
import { resourceConfigs } from "@/lib/resource-config";
export default async function SectionPage({params}:{params:Promise<{section:string}>}) { const {section}=await params; if(section === "tax-reports") redirect("/reports#tax-reports"); if(!resourceConfigs[section])notFound(); return <ResourcePage resourceKey={section}/>; }
