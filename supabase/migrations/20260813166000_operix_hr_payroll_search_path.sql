-- The legacy payroll generation function is still present for compatibility;
-- lock its SECURITY DEFINER name resolution to trusted schemas.
begin;

alter function public.generate_company_payroll(uuid, date, date)
  set search_path = public, pg_temp;

commit;
