import { describe, expect, it } from "vitest";
import { articles, getPublishedArticle } from "../content/articles";
import { allPublishedArticles } from "./content";

describe("content registry", () => {
  it("excludes drafts from public content", () => {
    expect(allPublishedArticles().every((article) => !article.draft)).toBe(true);
    expect(articles.some((article) => article.draft)).toBe(true);
    expect(getPublishedArticle("en", "suite", "getting-started", "draft-preview-example").article).toBeUndefined();
  });

  it("falls back to English when an Albanian equivalent is unavailable", () => {
    const result = getPublishedArticle("sq", "invoice", "invoices", "create-invoice");
    expect(result.article?.title).toBe("Create an Invoice");
    expect(result.isFallback).toBe(true);
  });
});
