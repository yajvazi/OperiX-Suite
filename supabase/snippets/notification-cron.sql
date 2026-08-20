-- Run once in the hosted Supabase SQL editor after storing these secrets in Vault:
--   select vault.create_secret('https://YOUR_PROJECT_REF.supabase.co', 'project_url');
--   select vault.create_secret('YOUR_SERVICE_ROLE_KEY', 'service_role_key');
-- The scheduler checks overdue/due-soon invoices, low stock, and daily summaries.

select cron.schedule(
  'operix-scheduled-business-notifications',
  '*/15 * * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/scheduled-business-notifications',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')
    ),
    body := jsonb_build_object('scheduled_at', now())
  ) as request_id;
  $$
);
