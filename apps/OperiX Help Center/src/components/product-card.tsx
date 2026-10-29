import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { Locale, ProductDefinition } from "../content/types";
import { copy } from "../content/ui";
import { productPath } from "../lib/paths";
import { Icon } from "./icons";

export function ProductCard({ product, locale, articleCount }: { product: ProductDefinition; locale: Locale; articleCount?: number }) {
  const descriptionId = `${product.key}-product-description`;
  return <Link className={`product-card ${product.comingSoon ? "product-card-soon" : "product-card-live"}`} href={productPath(locale, product)} aria-describedby={descriptionId}>
    <span className="product-card-top">
      <span className="product-icon"><Icon name={product.icon} size={24} /></span>
      <span className={`status-pill ${product.comingSoon ? "status-soon" : "status-live"}`}>{product.comingSoon ? copy(locale, "comingSoonBadge") : copy(locale, "availableNow")}</span>
    </span>
    <span className="product-card-copy"><strong>{product.name}</strong><span id={descriptionId}>{product.description}</span></span>
    <span className="product-card-foot">{typeof articleCount === "number" ? <span>{articleCount} {copy(locale, "guidesCount")}</span> : <span />}<span className="product-card-link">{copy(locale, "browseProduct")} <ArrowRight size={15} aria-hidden="true" /></span></span>
  </Link>;
}
