# EFS architecture

See [ARCHITECTURE.md](../ARCHITECTURE.md). The architecture separates commercial transaction, VAT, accounting, inventory, fiscal provider, secure signing, TAK transport, acknowledgement, and receipt rendering.

The current Kosovo provider is intentionally disabled at the transport boundary because the exact TAK technical contract is not configured. The local `MockTakServer` is deterministic test infrastructure and is not TAK.
