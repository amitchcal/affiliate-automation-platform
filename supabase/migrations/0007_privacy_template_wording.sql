-- =============================================================================
-- 0007: Privacy Policy template wording (C-04, S-07)
--
-- The click line now names everything record_click() stores: the link, the
-- page, the host name of the referring website, and the time. A new line says
-- that hosting and database providers keep standard server logs, which can
-- include IP addresses. Nothing else in the template changes.
--
-- Only the template changes. Brands' existing Privacy Policy pages keep their
-- text: they are copies, and public legal text is changed by a person through
-- the page editor. supabase/verify_privacy.sql counts the pages still on the
-- old wording.
--
-- Safe to run more than once: each change is made only if it is still missing.
-- The line endings already in the template (\n or \r\n) are kept.
-- =============================================================================

-- 1. The click line names the referring website's host name.
update compliance_templates
set body = replace(
  body,
  'When you click a link to a seller, we record which link was clicked, the page it was on, and the time. We do not record your name, email address, or IP address with the click.',
  'When you click a link to a seller, we record which link was clicked, the page it was on, the host name of the website you came from, and the time. We do not record your name, email address, or IP address with the click.'
)
where key = 'privacy'
  and position('the host name of the website you came from' in body) = 0;

-- 2. Server logs, as the last item under "What we collect".
update compliance_templates
set body = regexp_replace(
  body,
  '(Only when you write to us or sign up for updates\.)(\r?\n)',
  '\1\2- **Server logs kept by our providers.** Our hosting and database providers may keep standard server logs, which can include IP addresses, to run and secure the service.\2'
)
where key = 'privacy'
  and position('may keep standard server logs' in body) = 0;

-- 3. Stop if either line is missing, for example because the template had
--    been edited by hand and the old wording was not found.
do $$
declare
  privacy text;
begin
  select body into privacy from compliance_templates where key = 'privacy';
  if privacy is null then
    raise exception 'Stopped: the Privacy Policy template (key privacy) was not found.';
  end if;
  if position('When you click a link to a seller, we record which link was clicked, the page it was on, the host name of the website you came from, and the time. We do not record your name, email address, or IP address with the click.' in privacy) = 0 then
    raise exception 'Stopped: the click line in the Privacy Policy template was not updated. Its current wording differs from 0003; update it by hand, then run this file again.';
  end if;
  if position('- **Server logs kept by our providers.** Our hosting and database providers may keep standard server logs, which can include IP addresses, to run and secure the service.' in privacy) = 0 then
    raise exception 'Stopped: the server-logs line was not added. The line ending "sign up for updates." was not found; update the template by hand, then run this file again.';
  end if;
end $$;
