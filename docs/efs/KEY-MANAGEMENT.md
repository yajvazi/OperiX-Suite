# Key management

Database rows contain only certificate metadata and an opaque `secret_reference`. Database triggers reject private-key, certificate PEM, password, token, credential, and secret-looking JSON. Fiscal payload, provider response, and audit detail fields have the same boundary checks.

Private keys are prohibited in:

- Supabase normal tables or plaintext backups;
- AsyncStorage, browser localStorage, or Expo SecureStore as the server signing system;
- mobile/web bundles, Git, `.env` files, logs, analytics, crash reports, or evidence bundles.

Production is blocked until a real server-side KMS/HSM/Vault provider reports an available production-safe key. Certificate rotation is represented by new metadata rows and configuration history; old fiscal evidence remains accessible and is not overwritten.
