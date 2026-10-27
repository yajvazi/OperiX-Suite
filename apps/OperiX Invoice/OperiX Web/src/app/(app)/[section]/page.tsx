import { notFound } from "next/navigation";
import { redirect } from "next/navigation";
import { ResourcePage } from "@/components/resource-page";
import { resourceConfigs } from "@/lib/resource-config";
import { ExpensesModule } from "@/components/expenses/expenses-module";
export default async function SectionPage({params}:{params:Promise<{section:string}>}) { const {section}=await params; if(section === "tax-reports") redirect("/reports#tax-reports"); if(!resourceConfigs[section])notFound(); if(section === "expenses") return <ExpensesModule/>; return <ResourcePage resourceKey={section}/>; }
