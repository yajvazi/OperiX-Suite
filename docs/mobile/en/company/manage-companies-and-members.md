---
title: Manage companies and switch workspaces
description: Switch companies, create main companies or subdivisions, invite users, assign roles, and archive a company.
category: company
language: en
keywords:
  - company
  - workspace
  - subdivision
  - invite
  - switch company
  - archive company
---

Language: **English** | [Shqip](../../sq/company/manage-companies-and-members.md)

# Manage companies and switch workspaces

Open **More > Company**. The screen lists companies available to the authenticated user and shows the active selection.

## Switch company

1. Tap a company card.
2. Confirm that it becomes active.
3. Return to Home or another list and refresh the data.

Selecting a main company includes its descendant subdivisions in the workspace scope. Selecting a subdivision includes that subdivision and its descendants, not its parent or sibling subdivisions.

## Create or group companies

Administrators with permission can:

- create a main company;
- create a subdivision under a main company;
- group an existing company under a parent;
- edit company profile details and hierarchy;
- archive a company.

The screen uses company RPCs for these operations. Archive is a destructive administrative action; review the confirmation and company dependencies first.

## Manage members and invitations

From a managed company, an administrator can:

1. View members and their roles.
2. Select a role from the available role list.
3. Invite a person by email and role.
4. Copy an invitation token when the flow provides it.
5. Revoke a pending invitation.
6. Remove a company member.

Role changes and removals are server-authorized. See [Roles and access](../users-and-permissions/roles-and-access.md).

## Data boundary

Every business query uses the profile’s active company and accessible company IDs, with Supabase RLS as the database boundary. If the company list or records look wrong, do not switch by editing a local ID; contact an administrator/support.
