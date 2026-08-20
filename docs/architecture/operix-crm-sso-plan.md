# OperiX CRM SSO preparation

## Current state

OperiX applications use Supabase Auth sessions and company memberships. Twenty
has its own login/session model in the self-hosted deployment. The initial
release keeps those sessions separate and does not share cookies or inject
tokens.

## Future design

Use a supported OIDC or SAML identity provider as the common authority. Map the
IdP subject to an OperiX `auth.users` user and a Twenty workspace member using
an explicit organization mapping. Roles must be mapped deliberately:

| OperiX role | CRM role intent |
| --- | --- |
| OperiX Owner | Workspace owner/admin |
| OperiX Administrator | CRM administrator |
| CRM Manager | CRM manager |
| Sales Representative | CRM standard sales access |
| Finance User | Invoice actions plus CRM read/link access |
| Read-only User | CRM read-only |

Provisioning must be idempotent. Suspension must disable both application
access paths; offboarding must revoke sessions and remove/deactivate workspace
membership without deleting owned CRM records. Session expiration follows the
IdP and each product's secure session policy. User/org mapping must be checked
before every privileged integration action.

## Migration path

1. Establish stable IdP organization and user identifiers.
2. Add a mapping table and dry-run reconciliation against Supabase memberships
   and Twenty members.
3. Enable SSO for staging with separate-login break-glass administrators.
4. Validate role, suspension, offboarding, and session expiry behavior.
5. Roll out by organization; retain separate login only as a documented,
   time-bounded recovery path.

Twenty's supported SSO/OIDC/SAML capabilities and licensing must be confirmed
against the selected pinned release before implementation.
