"use client";

import { useEffect } from "react";
import { trackDocsEvent } from "../lib/analytics";

export function ArticleViewTracker({ articleId }: { articleId: string }) {
  useEffect(() => {
    trackDocsEvent({ type: "article_view", articleId });
  }, [articleId]);
  return null;
}
