# OperiX mobile QA reports

Start with [OPERIX-MOBILE-QA-SUMMARY.md](./OPERIX-MOBILE-QA-SUMMARY.md), then open the app-specific report and E2E flow document. The HTML dashboard is [OPERIX-MOBILE-QA-DASHBOARD.html](./OPERIX-MOBILE-QA-DASHBOARD.html); machine-readable results are [qa-results.json](./qa-results.json).

The runner is invoked from the monorepo root with `npm run qa:mobile:all` or an app-specific script. History is append-only under `history/`; sanitized logs and build evidence are under `artifacts/`. Reports contain actual outcomes only. `N/A`, `NOT_RUN`, `ENVIRONMENT_FAILURE`, and `VISUAL_REVIEW_REQUIRED` are not passes.
