# Spacious quick-action controls QA

## Source visual truth

- Sources:
  - `/tmp/codex-remote-attachments/019ff6ac-cb5d-7a62-b239-7b182efcc76b/48A21CDA-A591-47BE-B454-20B1BC0816B3/1-Photo-1.jpg` — spacious Business tabs and search field, 1280 × 344 pixels.
  - `/tmp/codex-remote-attachments/019ff6ac-cb5d-7a62-b239-7b182efcc76b/48A21CDA-A591-47BE-B454-20B1BC0816B3/2-Photo-2.jpg` — spacious Sales cards, filters, and search field, 1280 × 653 pixels.
  - `/tmp/codex-remote-attachments/019ff6ac-cb5d-7a62-b239-7b182efcc76b/E88AC46E-D5C4-43AC-B7A9-00C0945E9C08/1-Photo-1.jpg` — New Invoice product grid and cart action bar showing content-under-footer overlap.
  - `/tmp/codex-remote-attachments/019ff6ac-cb5d-7a62-b239-7b182efcc76b/E88AC46E-D5C4-43AC-B7A9-00C0945E9C08/2-Photo-2.jpg` — Sales quick actions, document filters, search, and floating create action.
  - `https://operixsuite.com/brand/operix-xi-white.svg` — official OperiX Invoice `XI` app mark used by the OperiX Suite website.
- Target state: authenticated mobile Sales and Business screens, light theme

## Implementation

- Screens/components:
  - `apps/OperiX Invoice/OperiX Invoice Mobile/src/screens/Sales/SalesScreen.tsx`
  - `apps/OperiX Invoice/OperiX Invoice Mobile/src/screens/Business/BusinessScreen.tsx`
  - `apps/OperiX Invoice/OperiX Invoice Mobile/src/components/mobile/MobileUI.tsx`
- Rendered screenshot: not captured
- Build viewport: Expo web bundle generated successfully

## Review

- Typography: retained Poppins and increased section headings, search text, filter labels, and quick-action labels to match the larger reference scale.
- Spacing/layout: quick-action cards now use responsive 140–164px widths, 140px height, 44px icon wells, 12px gaps between cards, a dedicated 152px quick-action region, and 8px space below it. Shared search fields are 64px high; Sales filters reserve a 60px viewport with a 16px gap before search; Sales documents use an explicit flex list, 10px list breathing room, taller 116px minimum cards, a short 24px list tail, and an in-flow 68px create-button dock. POS products use an explicit flex list above a normal-flow cart bar, so fixed controls no longer overlay content. Business tabs are 62px high.
- Colors/tokens: retained the existing light/dark palette and primary blue.
- Image/assets: the native icon, Android adaptive foreground, and web favicon use the official website `XI` mark; in-screen controls continue to use the existing icon library.
- Copy/content: unchanged.

## Comparison history

- Initial evidence showed quick-action descriptions visually colliding with the Documents section and shared controls feeling undersized.
- Fix applied: larger responsive cards, explicit carousel height, larger shared SearchField, larger section headings, 44px Sales filters, and 62px Business tabs.
- Follow-up evidence showed the quick-action viewport still clipped the lower card content. Fix applied: dedicated quick-action region, 192px card height, 12px card bottom spacing, 16px region bottom spacing, and larger action icons.
- Latest screenshot showed the quick actions were visually too large. Fix applied: reduced card and icon sizes, narrowed the responsive card width, and increased the spacing below the quick-action region before Documents.
- Latest screenshot comparison showed two remaining overlay paths: POS’s cart bar was absolutely positioned over the product FlatList, and Sales’s floating create action lacked enough trailing list space. Fix applied: cart bar moved into normal flow, both screen bodies/list children constrained with `minHeight: 0`, and Sales list trailing space increased.
- Follow-up fix: Sales now docks the create button below the document list instead of painting it over a document card.
- Latest screenshot showed the quick actions still dominated the page and the first trail card sat too close to its heading. Fix applied: compact quick cards/icons, taller document cards, and top padding for the shared document trail.
- Follow-up screenshot showed excess space before Documents and the lower document being cut by the tall trailing reserves. Fix applied: reduced the quick-action region/margin, shortened the list tail, and tightened the in-flow create dock.
- App identity update: replaced the native icon, Android adaptive foreground, and web favicon with the official website `XI` mark on OperiX blue. Android now uses `#004FFE` as its adaptive icon background.
- Post-fix rendered evidence is unavailable because the local Expo web session has no authenticated workspace session and no user-selected browser was available for capture.

## Final result

blocked — authenticated rendered screenshot comparison could not be captured. Typecheck, tests, and Expo web export passed.

## Invoice POS terminal and floating create action QA

### Source visual truth

- Source: `/tmp/codex-remote-attachments/019ffbce-ce52-7593-9f24-d4401127187c/A214ABC0-EE15-49F7-AA0B-527A91A8BF0A/1-Photo-1.jpg`
- Source pixels: 587 × 1269; CSS viewport and device density were not available from the attachment.
- Target state: authenticated mobile Invoice web POS, with the product catalogue visible, cart bar open, and bottom navigation visible.

### Implementation evidence

- Implementation screenshot: not captured; no browser capture tool or authenticated browser session was available.
- Live route: `https://invoice.operixsuite.com/pos` (redirects to authentication without a session).
- Source implementation: `apps/OperiX Invoice/OperiX Web/src/components/pos-view.tsx`, `apps/OperiX Invoice/OperiX Web/src/components/app-shell.tsx`, and `apps/OperiX Invoice/OperiX Web/src/app/globals.css`.
- Build artifact check: corrected `pos_terminals` query is present, stale `terminal_code`/`display_name` references are absent from the POS bundle, and `app-mobile-floating-create` is present in the shell bundle.

### Review

- Fonts and typography: existing Invoice typography and navigation labels were retained; no screenshot comparison was possible.
- Spacing and layout rhythm: the six-slot mobile footer was changed to five navigation slots; the create action is a 54px right-side bubble. On POS it is raised above the cart bar to avoid overlap.
- Colors and visual tokens: the existing primary blue, canvas border, radius, and shadow tokens were retained.
- Image quality and asset fidelity: the existing Lucide `Plus` icon is reused; no new image asset was introduced.
- Copy and content: existing labels were retained.

### Findings

- [P0] Rendered comparison blocked. The attached source and a same-state authenticated implementation screenshot could not be placed in one comparison input in this environment.

### Implementation checklist

- [x] Correct the terminal query to use the live `code`, `name`, and `status` columns.
- [x] Remove the central plus from the mobile footer.
- [x] Add a right-side floating create bubble and raise it above the POS cart bar.
- [x] Run typecheck, rebuild, redeploy, and verify the live health endpoints.
- [ ] Capture an authenticated mobile POS screenshot for final visual comparison.

### Final result

blocked — the implementation is deployed and static/live checks pass, but authenticated rendered screenshot comparison could not be captured.
