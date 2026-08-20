# OperiX CRM branding boundary

The repository does not vendor Twenty frontend source, so branding is kept as
an explicit, reviewable manifest for the upstream-backed Twenty customization
layer. The fork/overlay should consume this manifest for application title,
metadata, favicon, login/navigation surfaces, controls, focus states, empty
states, error/loading screens, workspace defaults, and supported email
templates.

Keep the customization under `operix/main` and merge upstream releases through
an upgrade branch. Do not scatter hex values or product-name changes through
Twenty core files. Use the existing OperiX assets referenced by the manifest;
do not create a second CRM visual identity.

The manifest is not a secret and is safe to commit. API keys, SMTP credentials,
encryption keys, and session material remain in deployment secret storage.
