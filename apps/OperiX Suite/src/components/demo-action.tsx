"use client";

import Link from "next/link";
import { ArrowRight, ExternalLink } from "lucide-react";
import { getProduct, type ProductKey } from "@/content/products";

export function DemoAction({ product: productKey, secondary = false }: { product: ProductKey; secondary?: boolean }) {
  const product = getProduct(productKey);
  if (product.demoEnabled && product.demoUrl) {
    return <a href={product.demoUrl} className={`button ${secondary ? "button-ghost" : ""}`} data-analytics="demo_clicked" data-analytics-payload={JSON.stringify({ product: product.key })}>Try {product.shortName} demo <ExternalLink size={15} /></a>;
  }

  return <Link href={`/demo?product=${product.key}`} className={`button ${secondary ? "button-ghost" : ""}`} data-analytics="demo_clicked" data-analytics-payload={JSON.stringify({ product: product.key })}>View demo status <ArrowRight size={15} /></Link>;
}
