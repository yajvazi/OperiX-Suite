import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { Locale, ProductDefinition } from "../content/types";
import { docsPath } from "../lib/paths";
import { Icon } from "./icons";

export function ProductCard({ product, locale }: { product: ProductDefinition; locale: Locale }) {
  return <Link className="product-card" href={docsPath(locale, product.key)}><span className="product-icon"><Icon name={product.icon} size={22} /></span><span className="product-card-copy"><strong>{product.name}</strong><span>{product.description}</span></span><ArrowRight className="product-arrow" size={17} /></Link>;
}
