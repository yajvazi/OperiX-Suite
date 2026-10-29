import { describe, expect, it } from "vitest";
import { articles, getPublishedArticle } from "../content/articles";
import { allPublishedArticles } from "./content";

describe("content registry", () => {
  it("excludes drafts from public content", () => {
    expect(allPublishedArticles().every((article) => !article.draft)).toBe(true);
    expect(articles.length).toBeGreaterThan(100);
    expect(getPublishedArticle("en", "general", "getting-started", "draft-preview-example").article).toBeUndefined();
  });

  it("serves the Albanian guide, and falls back to English only when one is missing", () => {
    const albanian = getPublishedArticle("sq", "invoice", "invoices", "create-invoice");
    expect(albanian.article?.locale).toBe("sq");
    expect(albanian.isFallback).toBe(false);
    const english = getPublishedArticle("en", "invoice", "invoices", "create-invoice");
    expect(english.article?.title).toBe("Create an Invoice");
  });
});
