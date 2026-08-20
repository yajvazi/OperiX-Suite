---
title: API, RPC, and integration calls
description: Inventory of the Supabase table, RPC, Edge Function, and external calls used by mobile source.
category: developer
language: en
keywords:
  - Supabase RPC
  - API
  - Edge Function
  - PostgREST
  - integrations
---

# API, RPC, and integration calls

The app uses the Supabase JS client from `packages/api/src/supabase.ts`. Direct table calls use PostgREST query builders. Financial mutations use RPCs where the repository provides centralized posting/idempotency/permission behavior.

## Important RPCs used by mobile

| RPC | Calling area | Purpose |
|---|---|---|
| `verify_invite_token` | Join team | Validate an invitation token |
| `set_active_company` | Manage companies | Change active company |
| `create_company_and_owner` | Manage companies | Create main company |
| `create_company_subdivision` | Manage companies | Create subdivision |
| `set_company_parent` | Manage companies | Change hierarchy |
| `update_company_profile` | Manage companies | Update managed company |
| `create_company_invitation` | Manage companies | Invite member |
| `list_company_members` | Manage companies | Read members |
| `list_company_invitations` | Manage companies | Read pending invitations |
| `set_company_member_role` | Manage companies | Change role |
| `remove_company_member` | Manage companies | Remove member |
| `revoke_company_invitation` | Manage companies | Revoke invitation |
| `archive_company` | Manage companies | Archive company |
| `reserve_invoice_number` | Invoice form | Allocate a document number |
| `ensure_walk_in_customer` | Invoice form | Resolve/create walk-in customer |
| `create_stock_tracked_invoice_with_signature` | POS invoice save | Idempotent stock-aware invoice creation |
| `post_pos_invoice` | Invoice save | Post an invoice/POS financial event |
| `apply_delivery_fulfillment` | Delivery conversion/save | Apply delivery fulfillment |
| `transition_commercial_document` | Invoice detail | Change an allowed document status |
| `convert_commercial_document` | Invoice detail | Create a linked target document |
| `record_customer_payment` | Payment form | Post a customer payment |
| `allocate_customer_payment` | Payment form | Apply payment to invoice |
| `post_expense` | Expense form | Post an expense |
| `verify_invite_token` | Join team | Validate invite before sign-up |
| `stripe-sync` Edge Function | Stripe | Server-side Stripe synchronization |

Function names and parameter contracts are defined by the screen calls and migrations. Change the migration and client together; do not add a second posting engine in the mobile layer.

## Fiscalization

The mobile tax screen reads `kosovo_efs_status`; the audited mobile code does not call a live TAK/EFS acceptance provider. Shared fiscalization packages/migrations are backend contracts, not proof of mobile production enablement.

## Error behavior

Screens generally show an Alert or an ErrorState and log a developer-facing message. Some flows intentionally retain a posted payment when allocation fails. Preserve that distinction in support and tests.

## External calls

- Supabase Auth, PostgREST, RPC, and Edge Functions;
- Google OAuth through browser auth session;
- Stripe Connect/Stripe API in `stripeService.ts`;
- PayPal payment-link storage;
- ATK registry browser link from customer/vendor forms;
- OperiX website/help/contact external links;
- Expo Mail Composer, Print, Sharing, Image Picker, Camera/QR, Local Authentication, and File System.
