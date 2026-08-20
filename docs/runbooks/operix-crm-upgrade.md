# OperiX CRM upgrade runbook

Use the controlled branch model:

```text
upstream/main
operix/main
operix/release/*
```

1. Disable CRM sync and automatic actions; retain event receipt if safe.
2. Back up Twenty Postgres, persistent files, and OperiX integration tables.
3. Fetch the upstream Twenty release and review release notes/migrations.
4. Merge the exact tag into an upgrade branch and resolve OperiX branding
   customizations in the overlay/fork.
5. Build locally and run integration/gateway tests.
6. Deploy the pinned tag to staging.
7. Validate login, CRM objects, API calls, webhooks, storage, and deep links.
8. Confirm migration completion and monitor logs/health for a soak period.
9. Promote to production during a maintenance window.
10. Monitor API latency, webhook failures, worker health, and sync status.

Never deploy `latest` or an untested upstream tag. If health or migration
signals regress, stop the CRM project, restore the pre-upgrade backup, and
reconcile events before resuming processing.
