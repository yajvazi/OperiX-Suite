import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { Article, Locale } from "../content/types";
import { getProduct } from "../content/products";
import { articlePath } from "../lib/paths";

export function ArticleCard({ article, locale }: { article: Article; locale: Locale }) {
  const product = getProduct(article.product);
  return <Link className="article-card" href={articlePath(locale, article)}><span className="article-card-meta">{product?.name}</span><strong>{article.title}</strong><span>{article.description}</span><span className="article-card-link">Read article <ArrowRight size={14} /></span></Link>;
}
