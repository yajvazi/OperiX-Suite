-- Keep sensitive employee fields behind the payroll/RBAC services.
-- Directory and self-service clients receive explicit safe columns from the
-- shared HR package; payroll RPCs remain security-definer and can maintain
-- compensation inputs without exposing them to ordinary HR clients.

begin;

revoke select (base_salary, permissions, personal_identification_reference)
  on table public.employees from authenticated, anon, public;
revoke insert (base_salary, permissions, personal_identification_reference, role)
  on table public.employees from authenticated, anon, public;
revoke update (base_salary, permissions, personal_identification_reference, role)
  on table public.employees from authenticated, anon, public;

commit;
