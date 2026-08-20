# System description

OperiX Invoice is a multi-tenant invoicing, POS, accounting, VAT, inventory, and reporting product. EFS is a separate provider layer over completed commercial transactions. Accounting continues when EFS is unavailable, but an eligible fiscal receipt is never represented as accepted without a documented provider response.

The software boundary is implemented in `packages/fiscalization`. Supabase/PostgreSQL stores tenant-isolated installation metadata and append-only evidence. Mobile and web clients call authenticated backend workflows; private signing material is not shipped to clients.

This is a software-side draft for the TAK application. It is not an official certification document or a claim of authorization.
