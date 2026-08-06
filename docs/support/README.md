# OperiX Support v1

OperiX Support is a standalone, multi-tenant help desk for `helpdesk.operixsuite.com`.

Implementation scope is Phase A ticketing and Phase B email. The product reuses the existing Supabase Auth, `profiles`, `companies`, `memberships`, and RBAC tables. It does not create `support_agents`, `support_customers`, or any synchronization layer.

- [Architecture](./ARCHITECTURE.md)
- [Database and migration summary](./DATABASE.md)
- [API reference](./API.md)
- [ER diagram and sequences](./DIAGRAMS.md)
- [Deployment guide](./DEPLOYMENT.md)
- [Administrator guide](./ADMINISTRATOR.md)
- [User guide](./USER.md)
- [Test report](./TEST_REPORT.md)
- [Production readiness checklist and known limitations](./PRODUCTION_READINESS.md)
