# Offline and recovery

Administrative Instruction (MF) No. 01/2026, Article 44, and the technical requirements describe local offline generation/storage and restoration/submission behavior, including a 48-hour restoration/submission requirement in the applicable case. OperiX does not invent a different offline window.

The existing POS offline queue is separate from the new EFS acceptance boundary. Before production use it requires TAK-confirmed rules for offline issuance, a server-verifiable device identity, durable retry handling, deadline/escalation, visible offline status, and no double accounting/inventory posting.

If a transaction type or scenario is not allowed offline, the backend must block it with an actionable message. The mobile app remaining open is never the durability guarantee; server-side queue processing is required where TAK permits deferred submission.
