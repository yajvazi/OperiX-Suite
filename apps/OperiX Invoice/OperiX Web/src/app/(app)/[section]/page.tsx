import { notFound } from "next/navigation";
import { ResourcePage } from "@/components/resource-page";
import { resourceConfigs } from "@/lib/resource-config";
export default async function SectionPage({params}:{params:Promise<{section:string}>}) { const {section}=await params; if(!resourceConfigs[section])notFound(); return <ResourcePage resourceKey={section}/>; }
