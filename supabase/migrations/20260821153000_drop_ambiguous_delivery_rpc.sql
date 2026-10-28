-- Keep one canonical delivery-details RPC signature. PostgreSQL/PostgREST
-- cannot resolve the legacy four-argument overload when both overloads have
-- default parameters.
drop function if exists public.set_invoice_delivery_details(uuid, text, uuid, text);

-- The five-argument function remains callable by older clients because its
-- Post COD parameter has a default value.
