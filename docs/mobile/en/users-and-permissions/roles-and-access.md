---
title: Roles, members, and permissions
description: Understand Super admin, Admin, Manager, Employee, invitations, and server-enforced company permissions.
category: users-and-permissions
language: en
keywords:
  - roles
  - permissions
  - super admin
  - admin
  - manager
  - employee
  - team members
---

Language: **English** | [Shqip](../../sq/users-and-permissions/roles-and-access.md)

# Roles, members, and permissions

## Roles visible in the mobile app

The workspace role model includes exactly four roles:

- **Super admin** — reserved for the company owner and the only role with access to OperiX Control;
- **Admin** — full tenant administration without OperiX Control access;
- **Manager** — operational administration for the assigned tenant;
- **Employee** — can create invoices and all supported proforma/commercial document types, but cannot edit or delete existing invoices, products, or other business records.

Super admin is never assignable through an invitation or role-change menu. The server derives it from company ownership.

## Employee restrictions visible in mobile

The More menu and global create actions hide non-document creation actions for Employees. These are convenience restrictions only; the database/RPC permission checks are the security boundary.

## Administrative actions

Authorized administrators can manage company hierarchy, profile details, invitations, member roles, member removal, and company archiving. See [Manage companies](../company/manage-companies-and-members.md).

## Permission errors

An action can be visible but fail with a permission error if the server role lacks a required permission such as invoice posting, journal posting, supplier payment, or company role management. Do not work around this by changing request parameters; ask the company owner/admin.

## Tenant separation

The mobile client selects an active company and accessible descendants. Supabase RLS and security-definer RPC permission checks must reject records outside that scope. If access looks wrong, contact an administrator rather than attempting to work around the restriction.
