-- OperiX Invoice RBAC completion.
--
-- This migration is additive.  It reuses the existing app_permissions,
-- app_roles, membership_role_assignments, and control_platform_admins model.
-- Tenant ownership is deliberately treated as tenant-admin authority only;
-- platform authority comes exclusively from control_platform_admins.

begin;

create schema if not exists private;

-- ---------------------------------------------------------------------------
-- Canonical Invoice permission vocabulary
-- ---------------------------------------------------------------------------

insert into public.app_permissions (code, name, category, description, is_sensitive)
values
  ('invoice.view', 'View invoices', 'invoices', 'View invoices allowed by the member data scope.', false),
  ('invoice.view_all', 'View all invoices', 'invoices', 'View every invoice in the tenant.', false),
  ('invoice.create', 'Create invoices', 'invoices', 'Create draft invoices and commercial documents.', false),
  ('invoice.edit', 'Edit invoice drafts', 'invoices', 'Edit documents while they remain in an editable lifecycle state.', false),
  ('invoice.issue', 'Issue/finalize invoices', 'invoices', 'Issue or finalize an invoice through the supported workflow.', true),
  ('invoice.delete_draft', 'Delete invoice drafts', 'invoices', 'Delete draft invoices only.', true),
  ('invoice.void', 'Void invoices', 'invoices', 'Void or reverse an invoice through the supported workflow.', true),
  ('invoice.credit', 'Create credit notes', 'invoices', 'Create and post credit notes against an eligible source invoice.', true),
  ('invoice.debit', 'Create debit notes', 'invoices', 'Create and post debit notes through the supported workflow.', true),
  ('offer.create', 'Create offers', 'documents', 'Create offer drafts.', false),
  ('offer.manage', 'Manage offers', 'documents', 'Edit and manage offer drafts.', false),
  ('proforma.create', 'Create pro-formas', 'documents', 'Create pro-forma drafts.', false),
  ('proforma.manage', 'Manage pro-formas', 'documents', 'Edit and manage pro-forma drafts.', false),
  ('order.create', 'Create orders', 'documents', 'Create order drafts.', false),
  ('order.manage', 'Manage orders', 'documents', 'Edit and manage order drafts.', false),
  ('delivery_note.create', 'Create delivery notes', 'documents', 'Create delivery-note drafts.', false),
  ('delivery_note.manage', 'Manage delivery notes', 'documents', 'Edit and manage delivery-note drafts.', false),
  ('contracts.manage', 'Manage contracts', 'documents', 'Create, view, edit, and remove company contracts and contract templates.', true),
  ('payment.view', 'View payments', 'payments', 'View payments allowed by the member data scope.', false),
  ('payment.create', 'Record payments', 'payments', 'Record and allocate ordinary customer payments.', true),
  ('payment.refund', 'Refund/reverse payments', 'payments', 'Reverse or refund a posted payment.', true),
  ('expense.view_own', 'View own expenses', 'expenses', 'View expenses in the member own scope.', false),
  ('expense.view_all', 'View all expenses', 'expenses', 'View every expense in the tenant.', false),
  ('expense.create', 'Submit expenses', 'expenses', 'Create an expense and upload its receipt.', false),
  ('expense.edit', 'Edit submitted expenses', 'expenses', 'Edit an expense before it is approved or posted.', false),
  ('expense.approve', 'Approve expenses', 'expenses', 'Approve or reject employee expenses.', true),
  ('expense.manage', 'Manage expenses', 'expenses', 'Edit, archive, or delete company expenses.', true),
  ('customer.view', 'View customers', 'customers', 'View customers allowed by the member data scope.', false),
  ('customer.view_all', 'View all customers', 'customers', 'View every customer in the tenant.', false),
  ('customer.create', 'Create customers', 'customers', 'Create customers.', false),
  ('customer.edit', 'Edit customers', 'customers', 'Edit customer records.', false),
  ('customer.delete', 'Delete customers', 'customers', 'Delete customers.', true),
  ('product.view', 'View products', 'products', 'View products and product information.', false),
  ('product.create', 'Create products', 'products', 'Create products.', false),
  ('product.edit', 'Edit products', 'products', 'Edit product information without changing price.', false),
  ('product.change_price', 'Change product prices', 'products', 'Change selling prices and price-driving fields.', true),
  ('product.delete', 'Delete products', 'products', 'Delete products while preserving legal history.', true),
  ('inventory.view', 'View inventory', 'inventory', 'View available stock and inventory history.', false),
  ('inventory.adjust', 'Adjust inventory', 'inventory', 'Create manual inventory adjustments or transfers.', true),
  ('reports.sales', 'View sales reports', 'reports', 'View sales and revenue reports.', false),
  ('reports.operational', 'View operational reports', 'reports', 'View operational reports.', false),
  ('reports.profit', 'View profit and margin reports', 'reports', 'View profit, margin, and cost-sensitive reports.', true),
  ('reports.tax', 'View VAT/tax reports', 'reports', 'View VAT and tax reporting.', true),
  ('sales_book.view', 'View Sales Book', 'accounting', 'View the Kosovo Sales Book.', true),
  ('sales_book.manage', 'Manage Sales Book', 'accounting', 'Declare and amend Sales Book periods.', true),
  ('accounting_period.view', 'View accounting periods', 'accounting', 'View accounting periods.', false),
  ('accounting_period.close', 'Close accounting periods', 'accounting', 'Close an accounting period.', true),
  ('accounting_period.reopen', 'Reopen accounting periods', 'accounting', 'Reopen an accounting period with a reason.', true),
  ('users.view', 'View company users', 'users', 'View users in the tenant.', false),
  ('users.manage', 'Manage company users', 'users', 'Invite, deactivate, or remove tenant users.', true),
  ('permissions.manage', 'Manage roles and permissions', 'users', 'Assign only Admin, Manager, or Employee and configure tenant permissions.', true),
  ('audit.view', 'View audit history', 'security', 'View relevant tenant audit history.', true),
  ('financial.export', 'Export financial information', 'reports', 'Export company financial information.', true),
  ('settings.company', 'Manage company settings', 'settings', 'Manage ordinary company settings.', true),
  ('settings.tax', 'Manage tax identity', 'settings', 'Manage company tax and VAT identity.', true),
  ('settings.invoice', 'Manage invoice settings', 'settings', 'Manage invoice templates, numbering, and document settings.', true),
  ('settings.bank', 'Manage bank information', 'settings', 'Manage company bank and payment information.', true),
  ('settings.integrations', 'Manage integrations', 'settings', 'Connect or configure company integrations.', true),
  ('settings.api', 'Manage company API keys', 'settings', 'Manage company API keys.', true),
  ('settings.security', 'Manage security settings', 'settings', 'Manage company security settings.', true),
  ('subscription.manage', 'Manage subscription', 'settings', 'Manage the company subscription where supported.', true)
on conflict (code) do update
set name = excluded.name,
    category = excluded.category,
    description = excluded.description,
    is_sensitive = excluded.is_sensitive;

create table if not exists public.app_role_data_scopes (
  role_id uuid not null references public.app_roles(id) on delete cascade,
  resource text not null,
  scope text not null check (scope in ('OWN', 'ASSIGNED', 'ALL')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (role_id, resource)
);

create table if not exists public.membership_permission_overrides (
  membership_id uuid not null references public.memberships(id) on delete cascade,
  permission_code text not null references public.app_permissions(code) on delete cascade,
  enabled boolean not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  primary key (membership_id, permission_code)
);

create table if not exists public.membership_data_scopes (
  membership_id uuid not null references public.memberships(id) on delete cascade,
  resource text not null,
  scope text not null check (scope in ('OWN', 'ASSIGNED', 'ALL')),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  primary key (membership_id, resource)
);

create index if not exists app_role_data_scopes_resource_idx
  on public.app_role_data_scopes(resource, scope);
create index if not exists membership_permission_overrides_code_idx
  on public.membership_permission_overrides(permission_code, enabled);
create index if not exists membership_data_scopes_resource_idx
  on public.membership_data_scopes(resource, scope);

comment on table public.membership_permission_overrides is
  'Tenant-admin-managed permission overrides. Platform permissions are never valid here.';
comment on table public.membership_data_scopes is
  'Tenant-admin-managed OWN/ASSIGNED/ALL scopes for Invoice resources.';

-- Preserve existing records and make creator ownership explicit for scoped reads.
alter table public.invoices add column if not exists assigned_user_id uuid;
alter table public.clients add column if not exists assigned_user_id uuid;
alter table public.expenses add column if not exists assigned_user_id uuid;
alter table public.payments add column if not exists assigned_user_id uuid;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'invoices_assigned_user_id_fkey') then
    alter table public.invoices add constraint invoices_assigned_user_id_fkey
      foreign key (assigned_user_id) references auth.users(id) on delete set null;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'clients_assigned_user_id_fkey') then
    alter table public.clients add constraint clients_assigned_user_id_fkey
      foreign key (assigned_user_id) references auth.users(id) on delete set null;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'expenses_assigned_user_id_fkey') then
    alter table public.expenses add constraint expenses_assigned_user_id_fkey
      foreign key (assigned_user_id) references auth.users(id) on delete set null;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'payments_assigned_user_id_fkey') then
    alter table public.payments add constraint payments_assigned_user_id_fkey
      foreign key (assigned_user_id) references auth.users(id) on delete set null;
  end if;
end
$$;

select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select set_config('app.invoice_auxiliary_workflow', 'authorized', true);
select set_config('app.financial_workflow', 'authorized', true);
select set_config('app.sales_book_workflow', 'migration', true);
update public.invoices
set assigned_user_id = user_id
where assigned_user_id is null
  and (company_id is null or exists (select 1 from public.companies company where company.id = invoices.company_id));
select set_config('app.sales_book_workflow', '', true);
select set_config('app.invoice_auxiliary_workflow', '', true);
update public.clients set assigned_user_id = user_id where assigned_user_id is null;
update public.expenses set assigned_user_id = user_id where assigned_user_id is null;
update public.payments set assigned_user_id = user_id where assigned_user_id is null;
select set_config('app.financial_workflow', '', true);
select set_config('request.jwt.claims', '', true);

create index if not exists invoices_company_assigned_scope_idx
  on public.invoices(company_id, assigned_user_id, user_id);
create index if not exists clients_company_assigned_scope_idx
  on public.clients(company_id, assigned_user_id, user_id);
create index if not exists expenses_company_assigned_scope_idx
  on public.expenses(company_id, assigned_user_id, user_id);
create index if not exists payments_company_assigned_scope_idx
  on public.payments(company_id, assigned_user_id, user_id);

-- ---------------------------------------------------------------------------
-- Canonical permission evaluation
-- ---------------------------------------------------------------------------

create or replace function private.rbac_is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.control_platform_admins admin
    where admin.user_id = (select auth.uid())
      and admin.revoked_at is null
  );
$$;

revoke all on function private.rbac_is_platform_admin() from public;
grant execute on function private.rbac_is_platform_admin() to authenticated, service_role;

create or replace function private.rbac_is_platform_permission(p_permission text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select lower(coalesce(trim(p_permission), '')) like 'control.%'
      or lower(coalesce(trim(p_permission), '')) like 'platform.%'
      or lower(coalesce(trim(p_permission), '')) like 'organization.%'
      or lower(coalesce(trim(p_permission), '')) like 'apps.%'
      or lower(coalesce(trim(p_permission), '')) like 'usage.%'
      or lower(coalesce(trim(p_permission), '')) like 'developer.%'
      or lower(coalesce(trim(p_permission), '')) in ('data.read', 'status.read');
$$;

create or replace function private.rbac_canonical_permission(p_permission text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case lower(trim(coalesce(p_permission, '')))
    when 'sales_invoice.view' then 'invoice.view'
    when 'sales_invoice.create' then 'invoice.create'
    when 'invoice.create' then 'invoice.create'
    when 'sales_invoice.edit' then 'invoice.edit'
    when 'sales_invoice.post' then 'invoice.issue'
    when 'invoice.post' then 'invoice.issue'
    when 'invoice.approve' then 'invoice.issue'
    when 'sales_invoice.approve' then 'invoice.issue'
    when 'sales_invoice.delete' then 'invoice.delete_draft'
    when 'sales_invoice.cancel' then 'invoice.void'
    when 'invoice.cancel' then 'invoice.void'
    when 'sales_invoice.reverse' then 'invoice.void'
    when 'credit_note.issue' then 'invoice.credit'
    when 'debit_note.issue' then 'invoice.debit'
    when 'payments.manage' then 'payment.create'
    when 'payment.manage' then 'payment.create'
    when 'payment.read' then 'payment.view'
    when 'customer_payment.view' then 'payment.view'
    when 'customer_payment.record' then 'payment.create'
    when 'customer_payment.allocate' then 'payment.create'
    when 'customer_payment.reverse' then 'payment.refund'
    when 'expense.post' then 'expense.create'
    when 'expense.create' then 'expense.create'
    when 'expense.edit' then 'expense.edit'
    when 'products.view' then 'product.view'
    when 'products.manage' then 'product.edit'
    when 'inventory.manage' then 'inventory.adjust'
    when 'sales_customer.manage' then 'customer.edit'
    when 'customer.manage' then 'customer.edit'
    when 'customer.read' then 'customer.view'
    when 'reports.view' then 'reports.operational'
    when 'report.read' then 'reports.operational'
    when 'financial_reports.view' then 'reports.profit'
    when 'financial_reports.export' then 'financial.export'
    when 'financial_data.export' then 'financial.export'
    when 'accounting.read' then 'accounting_period.view'
    when 'accounting_period.manage' then 'accounting_period.close'
    when 'accounting_period.reopen' then 'accounting_period.reopen'
    when 'tax.book.view' then 'sales_book.view'
    when 'tax_report.submit' then 'reports.tax'
    when 'roles.manage' then 'permissions.manage'
    when 'roles.read' then 'users.view'
    when 'teams.manage' then 'users.manage'
    when 'teams.read' then 'users.view'
    when 'users.read' then 'users.view'
    when 'users.manage' then 'users.manage'
    when 'company.manage' then 'settings.company'
    else lower(trim(coalesce(p_permission, '')))
  end;
$$;

create or replace function private.rbac_permission_candidates(p_permission text)
returns text[]
language sql
immutable
set search_path = ''
as $$
  with key_value as (
    select private.rbac_canonical_permission(p_permission) as key
  ), candidates as (
    select key from key_value
    union
    select case key
      when 'invoice.view' then 'invoice.view_all'
      when 'customer.view' then 'customer.view_all'
      when 'expense.view_own' then 'expense.view_all'
      when 'payment.view' then 'payment.view_all'
      else null
    end
    from key_value
  )
  select coalesce(array_agg(key order by key), '{}'::text[])
  from candidates
  where key is not null and key <> '';
$$;

create or replace function private.rbac_actor_membership(p_company_id uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  with recursive ancestors(id, depth) as (
    select p_company_id, 0
    union all
    select company.parent_company_id, ancestors.depth + 1
    from public.companies company
    join ancestors on ancestors.id = company.id
    where company.parent_company_id is not null
  )
  select membership.id
  from ancestors
  join public.memberships membership on membership.company_id = ancestors.id
  where membership.user_id = (select auth.uid())
    and coalesce(membership.status, 'active') = 'active'
  order by ancestors.depth, membership.created_at, membership.id
  limit 1;
$$;

create or replace function private.rbac_member_role_code(p_membership_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (
      select role.code
      from public.membership_role_assignments assignment
      join public.app_roles role on role.id = assignment.role_id
      join public.memberships membership on membership.id = assignment.membership_id
      where assignment.membership_id = p_membership_id
        and role.company_id is null
        and role.code in ('company_administrator', 'manager', 'employee')
      order by case role.code
        when 'company_administrator' then 1
        when 'manager' then 2
        else 3
      end
      limit 1
    ),
    case lower(coalesce((select membership.role from public.memberships membership where membership.id = p_membership_id), 'employee'))
      when 'owner' then 'company_administrator'
      when 'admin' then 'company_administrator'
      when 'company_administrator' then 'company_administrator'
      when 'manager' then 'manager'
      else 'employee'
    end
  );
$$;

create or replace function private.rbac_role_code(p_company_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  with recursive ancestors(id, depth) as (
    select p_company_id, 0
    union all
    select company.parent_company_id, ancestors.depth + 1
    from public.companies company
    join ancestors on ancestors.id = company.id
    where company.parent_company_id is not null
  )
  select case
    when exists (
      select 1
      from ancestors
      join public.companies company on company.id = ancestors.id
      where company.owner_id = (select auth.uid())
    ) then 'company_administrator'
    else private.rbac_member_role_code(private.rbac_actor_membership(p_company_id))
  end;
$$;

create or replace function private.rbac_member_has_permission(
  p_membership_id uuid,
  p_permission text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  with target as (
    select membership.id, membership.company_id,
      private.rbac_member_role_code(membership.id) as role_code
    from public.memberships membership
    where membership.id = p_membership_id
      and coalesce(membership.status, 'active') = 'active'
  ), requested as (
    select unnest(private.rbac_permission_candidates(p_permission)) as permission_code
  )
  select exists (
    select 1 from target
    where target.role_code = 'company_administrator'
       or (
         not exists (
           select 1
           from public.membership_permission_overrides override
           join requested on requested.permission_code = override.permission_code
           where override.membership_id = target.id
             and override.enabled = false
         )
         and (
           exists (
             select 1
             from public.membership_permission_overrides override
             join requested on requested.permission_code = override.permission_code
             where override.membership_id = target.id
               and override.enabled = true
           )
           or exists (
             select 1
             from public.membership_role_assignments assignment
             join public.app_role_permissions role_permission on role_permission.role_id = assignment.role_id
             join requested on requested.permission_code = role_permission.permission_code
             where assignment.membership_id = target.id
           )
         )
       )
  );
$$;

create or replace function private.rbac_member_scope(
  p_membership_id uuid,
  p_resource text
)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (
      select scope.scope
      from public.membership_data_scopes scope
      where scope.membership_id = p_membership_id
        and scope.resource = p_resource
    ),
    (
      select role_scope.scope
      from public.membership_role_assignments assignment
      join public.app_role_data_scopes role_scope on role_scope.role_id = assignment.role_id
      where assignment.membership_id = p_membership_id
        and role_scope.resource = p_resource
      order by case role_scope.scope when 'ALL' then 1 when 'ASSIGNED' then 2 else 3 end
      limit 1
    ),
    'OWN'
  );
$$;

create or replace function private.rbac_scope_for(
  p_company_id uuid,
  p_resource text
)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when private.rbac_is_platform_admin() then 'ALL'
    when private.rbac_role_code(p_company_id) = 'company_administrator' then 'ALL'
    else coalesce(private.rbac_member_scope(private.rbac_actor_membership(p_company_id), p_resource), 'OWN')
  end;
$$;

create or replace function private.rbac_scope_allows(
  p_company_id uuid,
  p_resource text,
  p_owner_user_id uuid,
  p_assigned_user_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_company_id is not null
    and private.rbac_role_code(p_company_id) is not null
    and case private.rbac_scope_for(p_company_id, p_resource)
      when 'ALL' then true
      when 'ASSIGNED' then p_owner_user_id = (select auth.uid())
        or p_assigned_user_id = (select auth.uid())
      else p_owner_user_id = (select auth.uid())
    end;
$$;

create or replace function private.rbac_can_read_resource(
  p_company_id uuid,
  p_resource text,
  p_owner_user_id uuid,
  p_assigned_user_id uuid,
  p_permission text default null
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when private.rbac_is_platform_admin() then true
    when p_company_id is null then p_owner_user_id = (select auth.uid())
    when not private.company_is_active(p_company_id) then false
    when p_permission is not null and not private.has_company_permission(p_company_id, p_permission) then false
    else private.rbac_scope_allows(p_company_id, p_resource, p_owner_user_id, p_assigned_user_id)
  end;
$$;

-- The public helper is still the tenant-isolation predicate used throughout
-- the suite, but it no longer trusts mutable profile.company_id fields.
create or replace function public.can_access_company(target_company_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select target_company_id is not null
    and private.company_is_active(target_company_id)
    and (
      private.rbac_is_platform_admin()
      or exists (
        select 1 from public.companies company
        where company.id = target_company_id
          and company.owner_id = (select auth.uid())
      )
      or exists (
        with recursive ancestors(id) as (
          select target_company_id
          union
          select company.parent_company_id
          from public.companies company
          join ancestors on ancestors.id = company.id
          where company.parent_company_id is not null
        )
        select 1
        from public.memberships membership
        join ancestors on ancestors.id = membership.company_id
        where membership.user_id = (select auth.uid())
          and coalesce(membership.status, 'active') = 'active'
      )
    );
$$;

create or replace function private.has_company_permission(
  p_company_id uuid,
  p_permission text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  with requested as (
    select lower(trim(coalesce(p_permission, ''))) as permission_code,
      private.rbac_canonical_permission(p_permission) as canonical_code
  ),
  access as (
    select private.company_is_active(p_company_id) as company_active,
      private.rbac_is_platform_admin() as platform_admin,
      private.rbac_role_code(p_company_id) as actor_role,
      private.rbac_actor_membership(p_company_id) as membership_id
  ),
  role_access as (
    select access.*,
      exists (
        select 1
        from public.membership_permission_overrides override
        where override.membership_id = access.membership_id
          and override.permission_code = requested.canonical_code
          and override.enabled = false
      ) as explicitly_denied,
      exists (
        select 1
        from public.membership_permission_overrides override
        where override.membership_id = access.membership_id
          and override.permission_code = requested.canonical_code
          and override.enabled = true
      ) as explicitly_enabled,
      exists (
        select 1
        from public.membership_role_assignments assignment
        join public.app_role_permissions role_permission on role_permission.role_id = assignment.role_id
        where assignment.membership_id = access.membership_id
          and role_permission.permission_code = requested.canonical_code
      ) as role_grant
    from access cross join requested
  ),
  app_gate as (
    select private.control_permission_app_key(p_permission) as app_key
  )
  select coalesce(role_access.company_active, false)
    and (
      role_access.platform_admin
      or (
        not private.rbac_is_platform_permission(requested.permission_code)
        and (
          role_access.actor_role = 'company_administrator'
          or (
            not role_access.explicitly_denied
            and (role_access.explicitly_enabled or role_access.role_grant)
          )
        )
      )
    )
    and (
      app_gate.app_key is null
      or role_access.platform_admin
      or (
        exists (
          select 1 from public.company_app_entitlements entitlement
          where entitlement.company_id = p_company_id
            and entitlement.app_key = app_gate.app_key
            and entitlement.enabled
        )
        and (
          role_access.actor_role = 'company_administrator'
          or exists (
            select 1 from public.memberships membership
            where membership.id = role_access.membership_id
              and coalesce(membership.status, 'active') = 'active'
              and not exists (
                select 1 from public.membership_app_access access
                where access.membership_id = membership.id
                  and access.app_key = app_gate.app_key
                  and access.enabled = false
              )
          )
        )
      )
    )
  from role_access cross join requested cross join app_gate;
$$;

revoke all on function private.has_company_permission(uuid, text) from public;
grant execute on function private.has_company_permission(uuid, text) to authenticated, service_role;

create or replace function private.has_unscoped_permission(p_permission text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.companies company
    where private.company_is_active(company.id)
      and private.has_company_permission(company.id, p_permission)
  );
$$;

-- ---------------------------------------------------------------------------
-- Role presets and existing-membership normalization
-- ---------------------------------------------------------------------------

delete from public.app_role_permissions role_permission
using public.app_roles role
where role.id = role_permission.role_id
  and role.company_id is null
  and role.code in ('manager', 'employee')
  and role_permission.permission_code in (
    'invoice.view','invoice.create','invoice.post','invoice.approve','invoice.cancel',
    'sales_invoice.view','sales_invoice.create','sales_invoice.edit','sales_invoice.delete',
    'sales_invoice.post','sales_invoice.approve','sales_invoice.reverse',
    'credit_note.issue','debit_note.issue','payments.manage','payment.manage','payment.read',
    'payment.refund','customer_payment.view','customer_payment.record','customer_payment.allocate',
    'customer_payment.reverse','expense.post','expense.create','expense.edit','expense.view',
    'expense.approve','expense.archive','products.manage','products.view','inventory.manage',
    'inventory.view','reports.view','report.read','financial_reports.view','financial_reports.export',
    'financial_data.export','accounting.read','accounting_period.manage','accounting_period.reopen',
    'tax.book.view','tax_report.submit','sales_customer.manage','customer.manage','customer.read',
    'roles.manage','roles.read','teams.manage','teams.read','users.manage','users.read',
    'company.manage','settings.manage','settings.read','integrations.manage','integrations.read',
    'api.manage','api.read','billing.manage','billing.read'
  );

-- Managers receive operational defaults.  Sensitive actions are intentionally
-- absent and can only be enabled by the tenant Admin through the access RPC.
insert into public.app_role_permissions(role_id, permission_code)
select role.id, permission.code
from public.app_roles role
join public.app_permissions permission on permission.code = any(array[
  'company.read','invoice.view','invoice.create','invoice.edit','invoice.issue',
  'offer.create','offer.manage','proforma.create','proforma.manage','order.create','order.manage',
  'delivery_note.create','delivery_note.manage','contracts.manage','payment.view','payment.create',
  'expense.view_own','expense.view_all','expense.create','expense.approve',
  'customer.view','customer.view_all','customer.create','customer.edit',
  'product.view','product.create','product.edit','inventory.view',
  'reports.sales','reports.operational','reports.tax','sales_book.view',
  'accounting_period.view','users.view','audit.view'
]::text[])
where role.company_id is null and role.code = 'manager'
on conflict do nothing;

-- Employees can create normal documents and submit expenses, but cannot issue
-- invoices or record payments until an Admin explicitly enables those keys.
insert into public.app_role_permissions(role_id, permission_code)
select role.id, permission.code
from public.app_roles role
join public.app_permissions permission on permission.code = any(array[
  'company.read','invoice.view','invoice.create','invoice.edit',
  'offer.create','proforma.create','order.create','delivery_note.create',
  'customer.view','customer.create','product.view','inventory.view',
  'expense.view_own','expense.create'
]::text[])
where role.company_id is null and role.code = 'employee'
on conflict do nothing;

-- Admin scopes are always ALL in the evaluator.  The rows document the preset
-- and are also used by tools that inspect role defaults.
insert into public.app_role_data_scopes(role_id, resource, scope)
select role.id, preset.resource, 'ALL'
from public.app_roles role
cross join (values
  ('invoice'),('offer'),('proforma'),('order'),('delivery_note'),('customer'),
  ('expense'),('payment'),('product'),('inventory')
) as preset(resource)
where role.company_id is null and role.code = 'company_administrator'
on conflict (role_id, resource) do update set scope = excluded.scope, updated_at = now();

insert into public.app_role_data_scopes(role_id, resource, scope)
select role.id, preset.resource, preset.scope
from public.app_roles role
cross join (values
  ('invoice','ALL'),('offer','ALL'),('proforma','ALL'),('order','ALL'),
  ('delivery_note','ALL'),('customer','ALL'),('expense','ALL'),('payment','ALL'),
  ('product','ALL'),('inventory','ALL')
) as preset(resource, scope)
where role.company_id is null and role.code = 'manager'
on conflict (role_id, resource) do update set scope = excluded.scope, updated_at = now();

insert into public.app_role_data_scopes(role_id, resource, scope)
select role.id, preset.resource, preset.scope
from public.app_roles role
cross join (values
  ('invoice','OWN'),('offer','OWN'),('proforma','OWN'),('order','OWN'),
  ('delivery_note','OWN'),('customer','ASSIGNED'),('expense','OWN'),('payment','OWN'),
  ('product','ALL'),('inventory','ALL')
) as preset(resource, scope)
where role.company_id is null and role.code = 'employee'
on conflict (role_id, resource) do update set scope = excluded.scope, updated_at = now();

-- Existing owner records remain owners in the data model, but evaluate exactly
-- as tenant Admins; no tenant owner is inserted into control_platform_admins.
update public.memberships membership
set role = case
  when exists (
    select 1 from public.companies company
    where company.id = membership.company_id and company.owner_id = membership.user_id
  ) then 'owner'
  when lower(coalesce(membership.role, 'employee')) = 'admin' then 'admin'
  when lower(coalesce(membership.role, 'employee')) = 'manager' then 'manager'
  else 'employee'
end
where coalesce(membership.status, 'active') <> 'revoked';

-- ---------------------------------------------------------------------------
-- Platform boundary and workspace access RPCs
-- ---------------------------------------------------------------------------

create or replace function public.control_is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.rbac_is_platform_admin();
$$;

revoke all on function public.control_is_platform_admin() from public, anon;
grant execute on function public.control_is_platform_admin() to authenticated;

create or replace function public.control_has_permission(p_company_id uuid, p_permission text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.control_is_platform_admin()
    and p_permission is not null
    and (p_company_id is null or private.company_is_active(p_company_id));
$$;

revoke all on function public.control_has_permission(uuid, text) from public, anon;
grant execute on function public.control_has_permission(uuid, text) to authenticated;

create or replace function public.get_my_company_role(p_company_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when public.control_is_platform_admin() then 'super_administrator'
    else private.rbac_role_code(p_company_id)
  end;
$$;

revoke all on function public.get_my_company_role(uuid) from public, anon;
grant execute on function public.get_my_company_role(uuid) to authenticated;

create or replace function public.rbac_get_workspace_access(p_company_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  role_code_value text;
  permission_values jsonb;
  scope_values jsonb;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if not public.can_access_company(p_company_id) then
    raise exception 'Company access denied' using errcode = '42501';
  end if;

  role_code_value := case when public.control_is_platform_admin() then 'super_administrator' else private.rbac_role_code(p_company_id) end;
  select coalesce(jsonb_agg(permission.code order by permission.code), '[]'::jsonb)
    into permission_values
  from public.app_permissions permission
  where permission.code in (
    'invoice.view','invoice.view_all','invoice.create','invoice.edit','invoice.issue','invoice.delete_draft',
    'invoice.void','invoice.credit','invoice.debit','offer.create','offer.manage','proforma.create',
    'proforma.manage','order.create','order.manage','delivery_note.create','delivery_note.manage','contracts.manage',
    'payment.view','payment.create','payment.refund','expense.view_own','expense.view_all','expense.create',
    'expense.edit','expense.approve','expense.manage','customer.view','customer.view_all','customer.create',
    'customer.edit','customer.delete','product.view','product.create','product.edit','product.change_price',
    'product.delete','inventory.view','inventory.adjust','reports.sales','reports.operational','reports.profit',
    'reports.tax','sales_book.view','sales_book.manage','accounting_period.view','accounting_period.close',
    'accounting_period.reopen','users.view','users.manage','permissions.manage','audit.view','financial.export',
    'settings.company','settings.tax','settings.invoice','settings.bank','settings.integrations','settings.api',
    'settings.security','subscription.manage'
  )
    and private.has_company_permission(p_company_id, permission.code);

  select coalesce(jsonb_object_agg(resource, private.rbac_scope_for(p_company_id, resource)), '{}'::jsonb)
    into scope_values
  from (values
    ('invoice'),('offer'),('proforma'),('order'),('delivery_note'),('customer'),
    ('expense'),('payment'),('product'),('inventory')
  ) as resources(resource);

  return jsonb_build_object(
    'company_id', p_company_id,
    'role_code', role_code_value,
    'platform_admin', public.control_is_platform_admin(),
    'permissions', permission_values,
    'scopes', scope_values
  );
end;
$$;

revoke all on function public.rbac_get_workspace_access(uuid) from public, anon;
grant execute on function public.rbac_get_workspace_access(uuid) to authenticated;

create or replace function public.rbac_list_permission_catalog()
returns table(code text, name text, category text, description text, is_sensitive boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select permission.code, permission.name, permission.category,
    permission.description, permission.is_sensitive
  from public.app_permissions permission
  where permission.code in (
    'invoice.view','invoice.view_all','invoice.create','invoice.edit','invoice.issue','invoice.delete_draft',
    'invoice.void','invoice.credit','invoice.debit','offer.create','offer.manage','proforma.create',
    'proforma.manage','order.create','order.manage','delivery_note.create','delivery_note.manage','contracts.manage',
    'payment.view','payment.create','payment.refund','expense.view_own','expense.view_all','expense.create',
    'expense.edit','expense.approve','expense.manage','customer.view','customer.view_all','customer.create',
    'customer.edit','customer.delete','product.view','product.create','product.edit','product.change_price',
    'product.delete','inventory.view','inventory.adjust','reports.sales','reports.operational','reports.profit',
    'reports.tax','sales_book.view','sales_book.manage','accounting_period.view','accounting_period.close',
    'accounting_period.reopen','users.view','users.manage','permissions.manage','audit.view','financial.export',
    'settings.company','settings.tax','settings.invoice','settings.bank','settings.integrations','settings.api',
    'settings.security','subscription.manage'
  )
  order by permission.category, permission.code;
$$;

revoke all on function public.rbac_list_permission_catalog() from public, anon;
grant execute on function public.rbac_list_permission_catalog() to authenticated;

-- ---------------------------------------------------------------------------
-- Tenant user access management and audit logging
-- ---------------------------------------------------------------------------

create or replace function private.rbac_write_audit(
  p_company_id uuid,
  p_action text,
  p_entity_type text,
  p_entity_id uuid,
  p_previous jsonb,
  p_new jsonb,
  p_reason text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.audit_events(
    company_id, actor_user_id, action, entity_type, entity_id,
    previous_values, new_values, reason
  ) values (
    p_company_id, (select auth.uid()), p_action, p_entity_type, p_entity_id,
    p_previous, p_new, p_reason
  );
end;
$$;

revoke all on function private.rbac_write_audit(uuid,text,text,uuid,jsonb,jsonb,text) from public;
grant execute on function private.rbac_write_audit(uuid,text,text,uuid,jsonb,jsonb,text) to authenticated, service_role;

create or replace function private.rbac_member_access_json(p_membership_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with target as (
    select membership.company_id, private.rbac_member_role_code(membership.id) as role_code
    from public.memberships membership
    where membership.id = p_membership_id
  ),
  permissions as (
    select coalesce(jsonb_agg(permission.code order by permission.code), '[]'::jsonb) as value
    from public.app_permissions permission
    cross join target
    where permission.code in (
      'invoice.view','invoice.view_all','invoice.create','invoice.edit','invoice.issue','invoice.delete_draft',
      'invoice.void','invoice.credit','invoice.debit','offer.create','offer.manage','proforma.create',
      'proforma.manage','order.create','order.manage','delivery_note.create','delivery_note.manage','contracts.manage',
      'payment.view','payment.create','payment.refund','expense.view_own','expense.view_all','expense.create',
      'expense.edit','expense.approve','expense.manage','customer.view','customer.view_all','customer.create',
      'customer.edit','customer.delete','product.view','product.create','product.edit','product.change_price',
      'product.delete','inventory.view','inventory.adjust','reports.sales','reports.operational','reports.profit',
      'reports.tax','sales_book.view','sales_book.manage','accounting_period.view','accounting_period.close',
      'accounting_period.reopen','users.view','users.manage','permissions.manage','audit.view','financial.export',
      'settings.company','settings.tax','settings.invoice','settings.bank','settings.integrations','settings.api',
      'settings.security','subscription.manage'
    )
      and private.rbac_member_has_permission(p_membership_id, permission.code)
  ),
  scopes as (
    select coalesce(jsonb_object_agg(resource, private.rbac_member_scope(p_membership_id, resource)), '{}'::jsonb) as value
    from (values
      ('invoice'),('offer'),('proforma'),('order'),('delivery_note'),('customer'),
      ('expense'),('payment'),('product'),('inventory')
    ) as resources(resource)
  ),
  overrides as (
    select coalesce(jsonb_object_agg(permission_code, enabled), '{}'::jsonb) as value
    from public.membership_permission_overrides
    where membership_id = p_membership_id
  )
  select jsonb_build_object(
    'role_code', target.role_code,
    'permissions', permissions.value,
    'scopes', scopes.value,
    'overrides', overrides.value
  )
  from target, permissions, scopes, overrides;
$$;

create or replace function public.rbac_list_company_members(p_company_id uuid)
returns table(
  membership_id uuid,
  user_id uuid,
  email text,
  first_name text,
  last_name text,
  status text,
  role_code text,
  role_name text,
  is_company_owner boolean,
  access jsonb
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if not private.has_company_permission(p_company_id, 'permissions.manage') then
    raise exception 'Only a tenant Admin can manage permissions' using errcode = '42501';
  end if;
  return query
  select membership.id,
    membership.user_id,
    coalesce(auth_user.email, profile.email)::text,
    profile.first_name::text,
    profile.last_name::text,
    coalesce(membership.status, 'active')::text,
    private.rbac_member_role_code(membership.id)::text,
    case private.rbac_member_role_code(membership.id)
      when 'company_administrator' then 'Admin'
      when 'manager' then 'Manager'
      else 'Employee'
    end::text,
    company.owner_id = membership.user_id,
    private.rbac_member_access_json(membership.id)
  from public.memberships membership
  join public.companies company on company.id = membership.company_id
  left join auth.users auth_user on auth_user.id = membership.user_id
  left join public.profiles profile on profile.id = membership.user_id
  where membership.company_id = p_company_id
    and coalesce(membership.status, 'active') <> 'revoked'
  order by lower(coalesce(auth_user.email, profile.email, '')), membership.id;
end;
$$;

revoke all on function public.rbac_list_company_members(uuid) from public, anon;
grant execute on function public.rbac_list_company_members(uuid) to authenticated;

create or replace function public.rbac_update_member_access(
  p_membership_id uuid,
  p_role_code text,
  p_permissions jsonb default '{}'::jsonb,
  p_scopes jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  target_company_id uuid;
  target_user_id uuid;
  company_owner_id uuid;
  role_code_value text := lower(trim(coalesce(p_role_code, '')));
  role_id_value uuid;
  previous_access jsonb;
  permission_entry record;
  scope_entry record;
  allowed_resources constant text[] := array['invoice','offer','proforma','order','delivery_note','customer','expense','payment','product','inventory'];
  allowed_roles constant text[] := array['company_administrator','manager','employee'];
begin
  if actor_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if role_code_value = 'admin' then role_code_value := 'company_administrator'; end if;
  if role_code_value <> all(allowed_roles) then
    raise exception 'Only Admin, Manager, and Employee roles can be assigned' using errcode = '22023';
  end if;
  if jsonb_typeof(coalesce(p_permissions, '{}'::jsonb)) <> 'object'
     or jsonb_typeof(coalesce(p_scopes, '{}'::jsonb)) <> 'object' then
    raise exception 'Permissions and scopes must be JSON objects' using errcode = '22023';
  end if;

  select membership.company_id, membership.user_id, company.owner_id
    into target_company_id, target_user_id, company_owner_id
  from public.memberships membership
  join public.companies company on company.id = membership.company_id
  where membership.id = p_membership_id
  for update;

  if target_company_id is null then
    raise exception 'Membership was not found' using errcode = '22023';
  end if;
  if not private.has_company_permission(target_company_id, 'permissions.manage') then
    raise exception 'Only a tenant Admin can manage permissions' using errcode = '42501';
  end if;
  if target_user_id = actor_id then
    raise exception 'You cannot change your own role or permissions' using errcode = '42501';
  end if;
  if target_user_id = company_owner_id then
    raise exception 'The company owner cannot be edited from team management' using errcode = '42501';
  end if;

  select role.id into role_id_value
  from public.app_roles role
  where role.company_id is null and role.code = role_code_value;
  if role_id_value is null then
    raise exception 'The selected role is not available' using errcode = '22023';
  end if;

  previous_access := private.rbac_member_access_json(p_membership_id);

  if exists (
    select 1
    from jsonb_each(coalesce(p_permissions, '{}'::jsonb)) permission_entry
    where permission_entry.key not in (
      'invoice.view','invoice.view_all','invoice.create','invoice.edit','invoice.issue','invoice.delete_draft',
      'invoice.void','invoice.credit','invoice.debit','offer.create','offer.manage','proforma.create',
      'proforma.manage','order.create','order.manage','delivery_note.create','delivery_note.manage',
      'payment.view','payment.create','payment.refund','expense.view_own','expense.view_all','expense.create',
      'expense.edit','expense.approve','expense.manage','customer.view','customer.view_all','customer.create',
      'customer.edit','customer.delete','product.view','product.create','product.edit','product.change_price',
      'product.delete','inventory.view','inventory.adjust','reports.sales','reports.operational','reports.profit',
      'reports.tax','sales_book.view','sales_book.manage','accounting_period.view','accounting_period.close',
      'accounting_period.reopen','users.view','users.manage','permissions.manage','audit.view','financial.export',
      'settings.company','settings.tax','settings.invoice','settings.bank','settings.integrations','settings.api',
      'settings.security','subscription.manage'
    )
    or permission_entry.value not in ('true'::jsonb, 'false'::jsonb)
  ) then
    raise exception 'A permission is not valid for Invoice or is not boolean' using errcode = '22023';
  end if;

  if exists (
    select 1
    from jsonb_each_text(coalesce(p_scopes, '{}'::jsonb)) scope_entry
    where scope_entry.key <> all(allowed_resources)
       or upper(scope_entry.value) not in ('OWN','ASSIGNED','ALL')
  ) then
    raise exception 'A data scope is not valid' using errcode = '22023';
  end if;

  perform set_config('app.membership_role_workflow', 'authorized', true);
  update public.memberships
  set role = case role_code_value
      when 'company_administrator' then 'admin'
      when 'manager' then 'manager'
      else 'employee'
    end,
    status = 'active'
  where id = p_membership_id;

  delete from public.membership_role_assignments where membership_id = p_membership_id;
  insert into public.membership_role_assignments(membership_id, role_id, created_by)
  values (p_membership_id, role_id_value, actor_id);

  delete from public.membership_permission_overrides where membership_id = p_membership_id;
  for permission_entry in
    select key, value from jsonb_each(coalesce(p_permissions, '{}'::jsonb))
  loop
    insert into public.membership_permission_overrides(
      membership_id, permission_code, enabled, created_by, updated_by
    ) values (
      p_membership_id, permission_entry.key, (permission_entry.value #>> '{}')::boolean,
      actor_id, actor_id
    );
  end loop;

  delete from public.membership_data_scopes where membership_id = p_membership_id;
  for scope_entry in
    select key, value from jsonb_each_text(coalesce(p_scopes, '{}'::jsonb))
  loop
    insert into public.membership_data_scopes(membership_id, resource, scope, updated_by)
    values (p_membership_id, scope_entry.key, upper(scope_entry.value), actor_id);
  end loop;
  perform set_config('app.membership_role_workflow', '', true);

  perform private.rbac_write_audit(
    target_company_id,
    'membership.access_updated',
    'membership_access',
    p_membership_id,
    previous_access,
    jsonb_build_object(
      'role_code', role_code_value,
      'permissions', coalesce(p_permissions, '{}'::jsonb),
      'scopes', coalesce(p_scopes, '{}'::jsonb)
    ),
    'Tenant Admin updated member role, permissions, or data scopes'
  );

  return jsonb_build_object(
    'membership_id', p_membership_id,
    'role_code', role_code_value,
    'access', private.rbac_member_access_json(p_membership_id)
  );
end;
$$;

revoke all on function public.rbac_update_member_access(uuid,text,jsonb,jsonb) from public, anon;
grant execute on function public.rbac_update_member_access(uuid,text,jsonb,jsonb) to authenticated;

-- Existing callers are kept compatible, but the old role RPC now uses the
-- same Admin-only boundary and can never accept a platform role.
create or replace function public.set_company_member_role(
  p_membership_id uuid,
  p_role_code text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  return public.rbac_update_member_access(p_membership_id, p_role_code, '{}'::jsonb, '{}'::jsonb);
end;
$$;

revoke all on function public.set_company_member_role(uuid,text) from public, anon;
grant execute on function public.set_company_member_role(uuid,text) to authenticated;

create or replace function public.list_company_members(p_company_id uuid)
returns table(
  membership_id uuid, user_id uuid, email text, first_name text, last_name text,
  legacy_role text, status text, role_code text, role_name text
)
language sql
security definer
set search_path = ''
as $$
  select member.membership_id, member.user_id, member.email, member.first_name,
    member.last_name, membership.role::text, member.status,
    member.role_code, member.role_name
  from public.rbac_list_company_members(p_company_id) member
  join public.memberships membership on membership.id = member.membership_id;
$$;

revoke all on function public.list_company_members(uuid) from public, anon;
grant execute on function public.list_company_members(uuid) to authenticated;

create or replace function private.can_grant_role(p_membership_id uuid, p_role_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.memberships target
    join public.companies company on company.id = target.company_id
    join public.app_roles role on role.id = p_role_id
    where target.id = p_membership_id
      and target.user_id <> (select auth.uid())
      and target.user_id <> company.owner_id
      and role.company_id is null
      and role.code in ('company_administrator','manager','employee')
      and private.has_company_permission(target.company_id, 'permissions.manage')
  );
$$;

create or replace function private.can_grant_permission(p_role_id uuid, p_permission text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select false;
$$;

revoke all on function private.can_grant_role(uuid,uuid) from public;
grant execute on function private.can_grant_role(uuid,uuid) to authenticated, service_role;
revoke all on function private.can_grant_permission(uuid,text) from public;
grant execute on function private.can_grant_permission(uuid,text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Prevent direct profile, role, owner, and assignment escalation
-- ---------------------------------------------------------------------------

create or replace function private.rbac_profile_authorization_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if coalesce((select auth.jwt() ->> 'role'), '') = 'service_role'
     or coalesce(current_setting('app.company_link_workflow', true), '') = 'authorized'
     or coalesce(current_setting('app.active_company_switch', true), '') = 'authorized' then
    return new;
  end if;
  if new.role is distinct from old.role
     or new.company_id is distinct from old.company_id then
    raise exception 'Role and company membership are managed by protected workflows'
      using errcode = '42501';
  end if;
  if new.active_company_id is not null
     and not public.can_access_company(new.active_company_id) then
    raise exception 'You cannot select a company without an active membership'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists rbac_profile_authorization_guard on public.profiles;
create trigger rbac_profile_authorization_guard
before update on public.profiles
for each row execute function private.rbac_profile_authorization_guard();

create or replace function private.rbac_company_owner_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.owner_id is distinct from old.owner_id
     and coalesce((select auth.jwt() ->> 'role'), '') <> 'service_role'
     and coalesce(current_setting('app.company_owner_transfer', true), '') <> 'authorized'
     and not private.rbac_is_platform_admin() then
    raise exception 'Company ownership can only change through the protected ownership workflow'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists rbac_company_owner_guard on public.companies;
create trigger rbac_company_owner_guard
before update on public.companies
for each row execute function private.rbac_company_owner_guard();

create or replace function private.rbac_assignment_defaults()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.assigned_user_id is null then
    new.assigned_user_id := new.user_id;
  end if;
  if tg_op = 'UPDATE'
     and old.assigned_user_id is distinct from new.assigned_user_id
     and coalesce((select auth.jwt() ->> 'role'), '') <> 'service_role'
     and not private.rbac_is_platform_admin()
     and coalesce(private.rbac_role_code(new.company_id), '') <> 'company_administrator' then
    raise exception 'Only a tenant Admin can reassign a record'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists rbac_invoices_assignment_defaults on public.invoices;
create trigger rbac_invoices_assignment_defaults
before insert or update on public.invoices
for each row execute function private.rbac_assignment_defaults();
drop trigger if exists rbac_clients_assignment_defaults on public.clients;
create trigger rbac_clients_assignment_defaults
before insert or update on public.clients
for each row execute function private.rbac_assignment_defaults();
drop trigger if exists rbac_expenses_assignment_defaults on public.expenses;
create trigger rbac_expenses_assignment_defaults
before insert or update on public.expenses
for each row execute function private.rbac_assignment_defaults();
drop trigger if exists rbac_payments_assignment_defaults on public.payments;
create trigger rbac_payments_assignment_defaults
before insert or update on public.payments
for each row execute function private.rbac_assignment_defaults();

-- ---------------------------------------------------------------------------
-- Sensitive mutation guards.  These run for SECURITY DEFINER workflows too.
-- ---------------------------------------------------------------------------

create or replace function private.rbac_invoice_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  document_type text := upper(coalesce(new.commercial_document_type, new.type, 'INVOICE'));
  old_status text := upper(coalesce(old.commercial_status, old.status::text, 'DRAFT'));
  new_status text := upper(coalesce(new.commercial_status, new.status::text, 'DRAFT'));
  server_request boolean := coalesce((select auth.jwt() ->> 'role'), '') = 'service_role';
begin
  if server_request or private.rbac_is_platform_admin() then return new; end if;
  if new.company_id is null then return new; end if;
  if document_type in ('CREDIT_NOTE','CREDIT')
     and not private.has_company_permission(new.company_id, 'invoice.credit') then
    raise exception 'Credit-note permission is required' using errcode = '42501';
  end if;
  if document_type in ('DEBIT_NOTE','DEBIT')
     and not private.has_company_permission(new.company_id, 'invoice.debit') then
    raise exception 'Debit-note permission is required' using errcode = '42501';
  end if;
  if new_status in ('ISSUED','POSTED','FINALIZED','APPROVED')
     and old_status is distinct from new_status
     and not private.has_company_permission(new.company_id, 'invoice.issue') then
    raise exception 'Invoice issue permission is required' using errcode = '42501';
  end if;
  if new_status in ('CANCELLED','VOID','VOIDED','REVERSED')
     and old_status is distinct from new_status
     and not private.has_company_permission(new.company_id, 'invoice.void') then
    raise exception 'Invoice void permission is required' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists rbac_invoice_guard on public.invoices;
create trigger rbac_invoice_guard
before insert or update on public.invoices
for each row execute function private.rbac_invoice_guard();

create or replace function private.rbac_product_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE'
     and new.company_id is not null
     and (new.unit_price is distinct from old.unit_price
       or new.supplier_unit_price is distinct from old.supplier_unit_price
       or new.supplier_unit_price_after_discount is distinct from old.supplier_unit_price_after_discount)
     and not private.has_company_permission(new.company_id, 'product.change_price') then
    raise exception 'Product price permission is required' using errcode = '42501';
  end if;
  if tg_op = 'DELETE'
     and old.company_id is not null
     and not private.has_company_permission(old.company_id, 'product.delete') then
    raise exception 'Product delete permission is required' using errcode = '42501';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

drop trigger if exists rbac_product_guard on public.products;
create trigger rbac_product_guard
before insert or update or delete on public.products
for each row execute function private.rbac_product_guard();

create or replace function private.rbac_customer_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE'
     and old.company_id is not null
     and not private.has_company_permission(old.company_id, 'customer.delete') then
    raise exception 'Customer delete permission is required' using errcode = '42501';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

drop trigger if exists rbac_customer_guard on public.clients;
create trigger rbac_customer_guard
before delete on public.clients
for each row execute function private.rbac_customer_guard();

create or replace function private.rbac_payment_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE'
     and old.company_id is not null
     and not private.has_company_permission(old.company_id, 'payment.refund') then
    raise exception 'Payment refund permission is required' using errcode = '42501';
  end if;
  if tg_op = 'UPDATE'
     and new.company_id is not null
     and old.reversed_at is null and new.reversed_at is not null
     and not private.has_company_permission(new.company_id, 'payment.refund') then
    raise exception 'Payment refund permission is required' using errcode = '42501';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

drop trigger if exists rbac_payment_guard on public.payments;
create trigger rbac_payment_guard
before update or delete on public.payments
for each row execute function private.rbac_payment_guard();

create or replace function private.rbac_expense_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE'
     and old.company_id is not null
     and not private.has_company_permission(old.company_id, 'expense.manage') then
    raise exception 'Expense management permission is required' using errcode = '42501';
  end if;
  if tg_op = 'UPDATE' and new.company_id is not null then
    if new.approval_status is distinct from old.approval_status
       and not private.has_company_permission(new.company_id, 'expense.approve')
       and not private.has_company_permission(new.company_id, 'expense.manage') then
      raise exception 'Expense approval permission is required' using errcode = '42501';
    end if;
    if (new.amount is distinct from old.amount
      or new.category is distinct from old.category
      or new.description is distinct from old.description
      or new.receipt_url is distinct from old.receipt_url)
      and not private.has_company_permission(new.company_id, 'expense.manage')
      and not private.has_company_permission(new.company_id, 'expense.edit') then
      raise exception 'Expense edit permission is required' using errcode = '42501';
    end if;
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

drop trigger if exists rbac_expense_guard on public.expenses;
create trigger rbac_expense_guard
before update or delete on public.expenses
for each row execute function private.rbac_expense_guard();

-- ---------------------------------------------------------------------------
-- Core tenant/data-scope RLS
-- ---------------------------------------------------------------------------

do $$
declare
  table_name text;
  policy_name text;
begin
  foreach table_name in array array[
    'invoices','invoice_items','clients','products','expenses','payments',
    'accounting_periods','inventory_movements','inventory_stock_movements',
    'inventory_counts','inventory_count_lines','product_branch_stock'
  ] loop
    if to_regclass('public.' || table_name) is not null then
      for policy_name in
        select pg_policies.policyname
        from pg_policies
        where pg_policies.schemaname = 'public'
          and pg_policies.tablename = table_name
      loop
        execute format('drop policy if exists %I on public.%I', policy_name, table_name);
      end loop;
    end if;
  end loop;
end
$$;

alter table public.invoices enable row level security;
create policy rbac_invoices_select on public.invoices for select to authenticated
using (
  private.rbac_can_read_resource(
    company_id,
    case upper(coalesce(commercial_document_type, type, 'INVOICE'))
      when 'QUOTE' then 'offer'
      when 'OFFER' then 'offer'
      when 'PROFORMA' then 'proforma'
      when 'SALES_ORDER' then 'order'
      when 'ORDER' then 'order'
      when 'DELIVERY_NOTE' then 'delivery_note'
      else 'invoice'
    end,
    user_id, assigned_user_id, 'invoice.view'
  )
);
create policy rbac_invoices_insert on public.invoices for insert to authenticated
with check (
  user_id = (select auth.uid())
  and company_id is not null
  and private.has_company_permission(company_id, 'invoice.create')
);
create policy rbac_invoices_update on public.invoices for update to authenticated
using (
  private.rbac_can_read_resource(company_id, 'invoice', user_id, assigned_user_id, 'invoice.edit')
  and upper(coalesce(commercial_status, status::text, 'DRAFT')) in ('DRAFT','SENT','VIEWED')
)
with check (
  company_id is not null
  and private.has_company_permission(company_id, 'invoice.edit')
  and upper(coalesce(commercial_status, status::text, 'DRAFT')) in ('DRAFT','SENT','VIEWED')
);
create policy rbac_invoices_delete on public.invoices for delete to authenticated
using (
  private.rbac_can_read_resource(company_id, 'invoice', user_id, assigned_user_id, 'invoice.delete_draft')
  and upper(coalesce(commercial_status, status::text, 'DRAFT')) = 'DRAFT'
);

alter table public.invoice_items enable row level security;
create policy rbac_invoice_items_select on public.invoice_items for select to authenticated
using (exists (
  select 1 from public.invoices invoice
  where invoice.id = invoice_items.invoice_id
    and private.rbac_can_read_resource(invoice.company_id, 'invoice', invoice.user_id, invoice.assigned_user_id, 'invoice.view')
));
create policy rbac_invoice_items_insert on public.invoice_items for insert to authenticated
with check (exists (
  select 1 from public.invoices invoice
  where invoice.id = invoice_items.invoice_id
    and private.rbac_can_read_resource(invoice.company_id, 'invoice', invoice.user_id, invoice.assigned_user_id, 'invoice.edit')
    and upper(coalesce(invoice.commercial_status, invoice.status::text, 'DRAFT')) in ('DRAFT','SENT','VIEWED')
));
create policy rbac_invoice_items_update on public.invoice_items for update to authenticated
using (exists (
  select 1 from public.invoices invoice
  where invoice.id = invoice_items.invoice_id
    and private.rbac_can_read_resource(invoice.company_id, 'invoice', invoice.user_id, invoice.assigned_user_id, 'invoice.edit')
    and upper(coalesce(invoice.commercial_status, invoice.status::text, 'DRAFT')) in ('DRAFT','SENT','VIEWED')
))
with check (exists (
  select 1 from public.invoices invoice
  where invoice.id = invoice_items.invoice_id
    and private.has_company_permission(invoice.company_id, 'invoice.edit')
));
create policy rbac_invoice_items_delete on public.invoice_items for delete to authenticated
using (exists (
  select 1 from public.invoices invoice
  where invoice.id = invoice_items.invoice_id
    and private.has_company_permission(invoice.company_id, 'invoice.delete_draft')
    and upper(coalesce(invoice.commercial_status, invoice.status::text, 'DRAFT')) = 'DRAFT'
));

alter table public.clients enable row level security;
create policy rbac_clients_select on public.clients for select to authenticated
using (private.rbac_can_read_resource(company_id, 'customer', user_id, assigned_user_id, 'customer.view'));
create policy rbac_clients_insert on public.clients for insert to authenticated
with check (user_id = (select auth.uid()) and company_id is not null and private.has_company_permission(company_id, 'customer.create'));
create policy rbac_clients_update on public.clients for update to authenticated
using (private.rbac_can_read_resource(company_id, 'customer', user_id, assigned_user_id, 'customer.edit'))
with check (company_id is not null and private.has_company_permission(company_id, 'customer.edit'));
create policy rbac_clients_delete on public.clients for delete to authenticated
using (private.rbac_can_read_resource(company_id, 'customer', user_id, assigned_user_id, 'customer.delete'));

alter table public.products enable row level security;
create policy rbac_products_select on public.products for select to authenticated
using (company_id is not null and private.has_company_permission(company_id, 'product.view'));
create policy rbac_products_insert on public.products for insert to authenticated
with check (user_id = (select auth.uid()) and company_id is not null and private.has_company_permission(company_id, 'product.create'));
create policy rbac_products_update on public.products for update to authenticated
using (company_id is not null and private.has_company_permission(company_id, 'product.edit'))
with check (company_id is not null and private.has_company_permission(company_id, 'product.edit'));
create policy rbac_products_delete on public.products for delete to authenticated
using (company_id is not null and private.has_company_permission(company_id, 'product.delete'));

alter table public.expenses enable row level security;
create policy rbac_expenses_select on public.expenses for select to authenticated
using (private.rbac_can_read_resource(company_id, 'expense', user_id, assigned_user_id, 'expense.view_own'));
create policy rbac_expenses_insert on public.expenses for insert to authenticated
with check (user_id = (select auth.uid()) and company_id is not null and private.has_company_permission(company_id, 'expense.create'));
create policy rbac_expenses_update on public.expenses for update to authenticated
using (
  private.rbac_can_read_resource(company_id, 'expense', user_id, assigned_user_id, 'expense.edit')
  or private.rbac_can_read_resource(company_id, 'expense', user_id, assigned_user_id, 'expense.approve')
  or private.rbac_can_read_resource(company_id, 'expense', user_id, assigned_user_id, 'expense.manage')
)
with check (
  company_id is not null
  and (private.has_company_permission(company_id, 'expense.edit')
    or private.has_company_permission(company_id, 'expense.approve')
    or private.has_company_permission(company_id, 'expense.manage'))
);
create policy rbac_expenses_delete on public.expenses for delete to authenticated
using (private.rbac_can_read_resource(company_id, 'expense', user_id, assigned_user_id, 'expense.manage'));

alter table public.payments enable row level security;
create policy rbac_payments_select on public.payments for select to authenticated
using (private.rbac_can_read_resource(company_id, 'payment', user_id, assigned_user_id, 'payment.view'));
create policy rbac_payments_insert on public.payments for insert to authenticated
with check (user_id = (select auth.uid()) and company_id is not null and private.has_company_permission(company_id, 'payment.create'));
create policy rbac_payments_update on public.payments for update to authenticated
using (private.rbac_can_read_resource(company_id, 'payment', user_id, assigned_user_id, 'payment.create'))
with check (company_id is not null and private.has_company_permission(company_id, 'payment.create'));
create policy rbac_payments_delete on public.payments for delete to authenticated
using (private.rbac_can_read_resource(company_id, 'payment', user_id, assigned_user_id, 'payment.refund'));

alter table public.accounting_periods enable row level security;
create policy rbac_accounting_periods_select on public.accounting_periods for select to authenticated
using (private.has_company_permission(company_id, 'accounting_period.view'));
create policy rbac_accounting_periods_insert on public.accounting_periods for insert to authenticated
with check (private.has_company_permission(company_id, 'accounting_period.close'));
create policy rbac_accounting_periods_update on public.accounting_periods for update to authenticated
using (private.has_company_permission(company_id, 'accounting_period.close') or private.has_company_permission(company_id, 'accounting_period.reopen'))
with check (private.has_company_permission(company_id, 'accounting_period.close') or private.has_company_permission(company_id, 'accounting_period.reopen'));
create policy rbac_accounting_periods_delete on public.accounting_periods for delete to authenticated
using (private.has_company_permission(company_id, 'accounting_period.close'));

alter table public.inventory_movements enable row level security;
create policy rbac_inventory_movements_select on public.inventory_movements for select to authenticated
using (private.has_company_permission(company_id, 'inventory.view'));
create policy rbac_inventory_movements_insert on public.inventory_movements for insert to authenticated
with check (private.has_company_permission(company_id, 'inventory.adjust'));
create policy rbac_inventory_movements_update on public.inventory_movements for update to authenticated
using (private.has_company_permission(company_id, 'inventory.adjust'))
with check (private.has_company_permission(company_id, 'inventory.adjust'));
create policy rbac_inventory_movements_delete on public.inventory_movements for delete to authenticated
using (private.has_company_permission(company_id, 'inventory.adjust'));

-- Stock history is readable to Employee because inventory.view is part of the
-- employee preset; writes remain workflow/RPC controlled.
do $$
begin
  if to_regclass('public.inventory_stock_movements') is not null then
    alter table public.inventory_stock_movements enable row level security;
    create policy rbac_inventory_stock_movements_select on public.inventory_stock_movements for select to authenticated
    using (private.has_company_permission(company_id, 'inventory.view'));
  end if;
  if to_regclass('public.inventory_counts') is not null then
    alter table public.inventory_counts enable row level security;
    create policy rbac_inventory_counts_select on public.inventory_counts for select to authenticated
    using (private.has_company_permission(company_id, 'inventory.view'));
    create policy rbac_inventory_counts_write on public.inventory_counts for all to authenticated
    using (private.has_company_permission(company_id, 'inventory.adjust'))
    with check (private.has_company_permission(company_id, 'inventory.adjust'));
  end if;
  if to_regclass('public.inventory_count_lines') is not null then
    alter table public.inventory_count_lines enable row level security;
    create policy rbac_inventory_count_lines_select on public.inventory_count_lines for select to authenticated
    using (private.has_company_permission(company_id, 'inventory.view'));
    create policy rbac_inventory_count_lines_write on public.inventory_count_lines for all to authenticated
    using (private.has_company_permission(company_id, 'inventory.adjust'))
    with check (private.has_company_permission(company_id, 'inventory.adjust'));
  end if;
  if to_regclass('public.product_branch_stock') is not null then
    alter table public.product_branch_stock enable row level security;
    create policy rbac_product_branch_stock_select on public.product_branch_stock for select to authenticated
    using (private.has_company_permission(company_id, 'inventory.view'));
    create policy rbac_product_branch_stock_write on public.product_branch_stock for all to authenticated
    using (private.has_company_permission(company_id, 'inventory.adjust'))
    with check (private.has_company_permission(company_id, 'inventory.adjust'));
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- Report and Sales Book views: keep security_invoker and add report-specific
-- permission predicates so a tax/sales reader cannot read profit views.
-- ---------------------------------------------------------------------------

do $$
declare
  view_name text;
  permission_code text;
  view_sql text;
begin
  for view_name, permission_code in
    select source.view_name, source.permission_code
    from (values
      ('kosovo_sales_book','sales_book.view'),
      ('kosovo_sales_book_period_summary','sales_book.view'),
      ('kosovo_tax_book_reconciliation','reports.tax'),
      ('kosovo_tax_calendar','reports.tax'),
      ('operix_profit_loss','reports.profit'),
      ('operix_financial_drilldown','reports.profit'),
      ('operix_report_summary','reports.profit'),
      ('operix_general_ledger','reports.operational'),
      ('operix_balance_sheet','reports.operational'),
      ('operix_trial_balance','reports.operational'),
      ('operix_cash_flow','reports.operational'),
      ('operix_changes_in_equity','reports.operational'),
      ('operix_asset_register','reports.operational'),
      ('inventory_register','inventory.view'),
      ('operix_ar_aging','reports.operational'),
      ('operix_ap_open_items','reports.operational'),
      ('withholding_transactions','reports.tax')
    ) as source(view_name, permission_code)
  loop
    if exists (
      select 1
      from pg_class relation
      join pg_namespace namespace on namespace.oid = relation.relnamespace
      where namespace.nspname = 'public'
        and relation.relname = view_name
        and relation.relkind = 'v'
    ) then
      view_sql := pg_get_viewdef(('public.' || view_name)::regclass, true);
      view_sql := regexp_replace(view_sql, E';[[:space:]]*$', '');
      execute format(
        'create or replace view public.%I as select * from (%s) as rbac_report where private.has_company_permission(rbac_report.company_id, %L)',
        view_name, view_sql, permission_code
      );
      execute format('alter view public.%I set (security_invoker = true)', view_name);
    end if;
  end loop;
end
$$;

do $$
begin
  if to_regclass('public.sales_book_periods') is not null then
    drop policy if exists sales_book_periods_select on public.sales_book_periods;
    create policy rbac_sales_book_periods_select on public.sales_book_periods for select to authenticated
    using (private.has_company_permission(company_id, 'sales_book.view'));
  end if;
end
$$;

-- Audit data is company-scoped and cannot be read by a member without the
-- explicit audit permission.  Inserts continue to come from protected
-- workflows/triggers or service_role.
drop policy if exists audit_events_permission_select on public.audit_events;
drop policy if exists operix_audit_events_read on public.audit_events;
create policy rbac_audit_events_select on public.audit_events for select to authenticated
using (company_id is not null and private.has_company_permission(company_id, 'audit.view'));

-- ---------------------------------------------------------------------------
-- Protect platform Control tables and every SECURITY DEFINER control RPC.
-- ---------------------------------------------------------------------------

revoke all on public.control_platform_admins from anon, authenticated;

do $$
declare
  table_name text;
  policy_name text;
begin
  for table_name in
    select c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind = 'r'
      and left(c.relname, 8) = 'control_'
  loop
    execute format('alter table public.%I enable row level security', table_name);
    for policy_name in
      select pg_policies.policyname
      from pg_policies
      where pg_policies.schemaname = 'public'
        and pg_policies.tablename = table_name
    loop
      execute format('drop policy if exists %I on public.%I', policy_name, table_name);
    end loop;
    execute format(
      'create policy rbac_platform_only on public.%I for all to authenticated using (public.control_is_platform_admin()) with check (public.control_is_platform_admin())',
      table_name
    );
  end loop;
end
$$;

-- Control membership/app-entitlement tables are platform configuration too.
do $$
declare
  table_name text;
  policy_name text;
begin
  foreach table_name in array array['company_app_entitlements','membership_app_access'] loop
    if to_regclass('public.' || table_name) is not null then
      for policy_name in
        select pg_policies.policyname
        from pg_policies
        where pg_policies.schemaname = 'public'
          and pg_policies.tablename = table_name
      loop
        execute format('drop policy if exists %I on public.%I', policy_name, table_name);
      end loop;
      execute format(
        'create policy rbac_platform_only on public.%I for all to authenticated using (public.control_is_platform_admin()) with check (public.control_is_platform_admin())',
        table_name
      );
    end if;
  end loop;
end
$$;

-- Existing Control RPCs are SECURITY DEFINER.  Inject one common platform
-- guard at the first PL/pgSQL BEGIN so internal permission checks cannot turn
-- a tenant Admin into a Control administrator.  Billing snapshots stay
-- service-role-only under their existing guard.
do $$
declare
  function_sql text;
  function_oid oid;
begin
  for function_oid in
    select p.oid
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    join pg_language language on language.oid = p.prolang
    where n.nspname = 'public'
      and left(p.proname, 8) = 'control_'
      and p.proname not in ('control_is_platform_admin','control_has_permission','control_upsert_billing_snapshot')
      and language.lanname = 'plpgsql'
  loop
    function_sql := pg_get_functiondef(function_oid);
    function_sql := regexp_replace(
      function_sql,
      E'\\mbegin\\M',
      E'begin\n  if coalesce((select auth.jwt() ->> ''role''), '''') <> ''service_role'' and not public.control_is_platform_admin() then\n    raise exception ''Platform administration denied'' using errcode = ''42501'';\n  end if;',
      1, 1, 'i'
    );
    execute function_sql;
  end loop;
end
$$;

-- ---------------------------------------------------------------------------
-- RLS for role metadata and immutable membership authority
-- ---------------------------------------------------------------------------

drop policy if exists app_roles_member_select on public.app_roles;
create policy rbac_app_roles_select on public.app_roles for select to authenticated
using (
  public.control_is_platform_admin()
  or (company_id is null and code in ('company_administrator','manager','employee'))
  or (company_id is not null and private.has_company_permission(company_id, 'permissions.manage'))
);

drop policy if exists app_roles_permission_insert on public.app_roles;
drop policy if exists app_roles_permission_update on public.app_roles;
drop policy if exists app_roles_permission_delete on public.app_roles;
create policy rbac_app_roles_platform_write on public.app_roles for all to authenticated
using (public.control_is_platform_admin())
with check (public.control_is_platform_admin());

drop policy if exists app_role_permissions_member_select on public.app_role_permissions;
create policy rbac_app_role_permissions_select on public.app_role_permissions for select to authenticated
using (
  public.control_is_platform_admin()
  or exists (
    select 1 from public.app_roles role
    where role.id = app_role_permissions.role_id
      and role.company_id is null
      and role.code in ('company_administrator','manager','employee')
  )
);
drop policy if exists app_role_permissions_manage_insert on public.app_role_permissions;
drop policy if exists app_role_permissions_manage_delete on public.app_role_permissions;
create policy rbac_app_role_permissions_platform_write on public.app_role_permissions for all to authenticated
using (public.control_is_platform_admin())
with check (public.control_is_platform_admin());

drop policy if exists membership_role_assignments_manage_insert on public.membership_role_assignments;
drop policy if exists membership_role_assignments_manage_delete on public.membership_role_assignments;
create policy rbac_membership_role_assignments_admin_write
on public.membership_role_assignments for all to authenticated
using (exists (
  select 1 from public.memberships membership
  where membership.id = membership_role_assignments.membership_id
    and private.has_company_permission(membership.company_id, 'permissions.manage')
))
with check (private.can_grant_role(membership_role_assignments.membership_id, membership_role_assignments.role_id));

-- Direct membership writes are intentionally unavailable to authenticated
-- clients; invitation/onboarding/deletion RPCs use SECURITY DEFINER workflows.
drop policy if exists memberships_member_or_manager_select on public.memberships;
create policy rbac_memberships_select on public.memberships for select to authenticated
using (
  user_id = (select auth.uid())
  or private.has_company_permission(company_id, 'users.view')
  or private.has_company_permission(company_id, 'permissions.manage')
);
drop policy if exists memberships_authenticated_write on public.memberships;
create policy rbac_memberships_no_direct_write on public.memberships for all to authenticated
using (false) with check (false);

drop policy if exists "Users can update own profile" on public.profiles;
create policy rbac_profiles_update on public.profiles for update to authenticated
using (auth.uid() = id)
with check (auth.uid() = id);

-- ---------------------------------------------------------------------------
-- Make legacy sensitive RPC predicates resolve to the canonical keys and
-- protect integration mutations that previously checked membership only.
-- ---------------------------------------------------------------------------

-- The trigger guards the SECURITY DEFINER invoice writer/posting workflows.
-- Keep legal-document lifecycle checks in their existing domain functions.

-- Storage policies for expense receipts are tightened when the known bucket
-- exists.  The object path must be a tenant UUID and the caller must have an
-- expense permission; metadata/RPC linkage remains the source of truth.
do $$
declare
  policy_name text;
begin
  if exists (select 1 from storage.buckets where id = 'expense-receipts') then
    for policy_name in
      select policyname from pg_policies where schemaname = 'storage' and tablename = 'objects'
        and policyname ilike '%expense%'
    loop
      execute format('drop policy if exists %I on storage.objects', policy_name);
    end loop;
    create policy rbac_expense_receipts_read on storage.objects for select to authenticated
    using (
      bucket_id = 'expense-receipts'
      and private.has_company_permission((storage.foldername(name))[1]::uuid, 'expense.view_own')
    );
    create policy rbac_expense_receipts_insert on storage.objects for insert to authenticated
    with check (
      bucket_id = 'expense-receipts'
      and private.has_company_permission((storage.foldername(name))[1]::uuid, 'expense.create')
    );
    create policy rbac_expense_receipts_update on storage.objects for update to authenticated
    using (
      bucket_id = 'expense-receipts'
      and private.has_company_permission((storage.foldername(name))[1]::uuid, 'expense.manage')
    )
    with check (
      bucket_id = 'expense-receipts'
      and private.has_company_permission((storage.foldername(name))[1]::uuid, 'expense.manage')
    );
    create policy rbac_expense_receipts_delete on storage.objects for delete to authenticated
    using (
      bucket_id = 'expense-receipts'
      and private.has_company_permission((storage.foldername(name))[1]::uuid, 'expense.manage')
    );
  end if;
end
$$;

commit;
