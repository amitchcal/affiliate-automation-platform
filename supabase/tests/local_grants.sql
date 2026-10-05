-- Supabase grants these to the authenticated role by default.
grant usage on schema public to authenticated, anon;
grant select, insert, update, delete on all tables in schema public to authenticated, anon;
grant usage on all sequences in schema public to authenticated, anon;
-- Function grants are set in the migrations themselves.
grant execute on function is_owner(), has_client_access(uuid), can_manage(uuid), can_approve(uuid), weights_total(jsonb), normalise_host(text) to authenticated, anon;
