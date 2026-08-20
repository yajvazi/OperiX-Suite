-- Leave lifecycle writes must go through the security-definer command RPCs so
-- requested days, balances, overlap checks, status and notifications cannot
-- be forged by a client.
begin;

revoke insert on table public.leave_requests from authenticated;

commit;
