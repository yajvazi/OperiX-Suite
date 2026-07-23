"use client";

import { Search } from "lucide-react";
import { useMemo, useState } from "react";
import { resources } from "@/content/site";

export function ResourceDirectory() {
  const [query, setQuery] = useState("");
  const results = useMemo(
    () =>
      resources.filter((resource) =>
        `${resource.title} ${resource.description}`.toLowerCase().includes(query.toLowerCase()),
      ),
    [query],
  );

  return (
    <>
      <label className="resource-search">
        <Search aria-hidden="true" />
        <span className="sr-only">Search resources</span>
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search resources" />
      </label>
      <div className="resource-grid">
        {results.map((resource) => {
          const Icon = resource.icon;
          return (
            <article className="resource-card" key={resource.title}>
              <div className="icon-box"><Icon aria-hidden="true" /></div>
              <div>
                <h2>{resource.title}</h2>
                <p>{resource.description}</p>
                <span>{resource.status}</span>
              </div>
            </article>
          );
        })}
      </div>
      {!results.length && <p className="empty-state">No resources match “{query}”.</p>}
    </>
  );
}
