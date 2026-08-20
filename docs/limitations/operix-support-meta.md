# Phase C Known Limitations

- Meta does not provide a general refresh-token flow equivalent to OAuth providers such as Google. OperiX stores encrypted page tokens and the reauthorization metadata needed to support reconnect; permission removal or expiry moves the account to `needs_reauthorization`.
- The Meta Login for Business configuration controls Meta's Business/asset selector. OperiX additionally presents returned candidate Pages and Instagram Business accounts in Settings so a workspace can choose its own connected subset.
- Historical conversation backfill is not implemented. Phase C starts receiving messages after the Page/Instagram webhook subscription is activated.
- Inbound attachment media is copied only when the remote Meta URL is allowed, reachable, and within `SUPPORT_MAX_ATTACHMENT_BYTES`; metadata is retained when download is unavailable.
- Instagram and Messenger policies can restrict reply windows, message types, and attachments. The adapter sends response messages and surfaces provider errors; it does not bypass Meta policy windows.
- Page/Instagram deletion is detected when webhook routing or Graph calls fail. There is no separate daily asset-discovery job; operators use Settings → Reconnect after the asset is restored.
- Department acknowledgement automation uses the existing Support automation foundation but no new Meta-specific automatic acknowledgement rule is enabled by default.
- Browser tests in the repository cover the public health/login surface. Authenticated Meta flows require staging credentials and are listed as an external acceptance smoke test rather than being faked in CI.
