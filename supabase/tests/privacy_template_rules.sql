-- =============================================================================
-- Privacy Policy template tests (C-04, S-07, migrations 0007 and 0012). Run
-- after every migration against a scratch database.
--
-- The template must say everything record_click() stores, including the
-- referring website's host name, and that providers' server logs can include
-- IP addresses. Nothing else in the template may change.
-- =============================================================================
\set ON_ERROR_STOP on

do $$
declare
  body_now text;
  click_line constant text :=
    'When you click a link to a seller, we record which link was clicked, the page it was on, the host name of the website you came from, and the time. We do not record your name, email address, or IP address with the click.';
  old_click_line constant text :=
    'When you click a link to a seller, we record which link was clicked, the page it was on, and the time. We do not record your name, email address, or IP address with the click.';
  logs_sentence constant text :=
    'Our hosting and database providers may keep standard server logs, which can include IP addresses, to run and secure the service.';
  logs_line constant text :=
    '- **Server logs kept by our providers.** ' || logs_sentence;
  email_line constant text :=
    '- **Your email address, if you give it to us.** Only when you write to us or sign up for updates.';
  -- 0012 replaces the email line with these two (S-08).
  signup_lines constant text :=
    '- **Your email address, if you write to us.** We use it only to reply.' || E'\n' ||
    '- **Your email address, if you sign up for updates.** We keep your email address, the exact wording you agreed to, the page you signed up on, and the time. We use your address only to send the updates you asked for, and we do not sell or share it. Every email will include a way to unsubscribe. You can also unsubscribe, or ask us to delete your address, by writing to {{email}}. When we start sending emails, our email provider will store your address on our behalf.';
  undone text;
begin
  select replace(body, E'\r', '') into body_now from compliance_templates where key = 'privacy';
  if body_now is null then raise exception 'C-04: the Privacy Policy template is missing'; end if;

  -- Both lines are present, once each.
  if (length(body_now) - length(replace(body_now, click_line, ''))) / length(click_line) <> 1 then
    raise exception 'S-07: the Privacy Policy click line does not name the referring host exactly once';
  end if;
  if (length(body_now) - length(replace(body_now, logs_sentence, ''))) / length(logs_sentence) <> 1 then
    raise exception 'S-07: the Privacy Policy does not mention providers'' server logs exactly once';
  end if;
  if (length(body_now) - length(replace(body_now, logs_line, ''))) / length(logs_line) <> 1 then
    raise exception 'S-07: the server-logs item lacks its bold label "Server logs kept by our providers."';
  end if;
  if position(old_click_line in body_now) > 0 then
    raise exception 'S-07: the old click line is still in the Privacy Policy';
  end if;

  -- The server-logs line is the last item under "What we collect", right after the email lines.
  if position(signup_lines || E'\n' || logs_line || E'\n\n## What sellers and networks collect' in body_now) = 0 then
    raise exception 'S-07: the server-logs line is not the last item under "What we collect"';
  end if;

  -- Nothing else changed: undoing the two edits gives back the template from
  -- 0003 exactly (fingerprint of its text with \n line endings).
  undone := replace(replace(replace(body_now, signup_lines, email_line), click_line, old_click_line), E'\n' || logs_line, '');
  if md5(undone) <> 'a1ec06c6e4b5c143fcb06769c7bf02c1' then
    raise exception 'C-04: the Privacy Policy template changed beyond the two lines of 0007 and the email lines of 0012';
  end if;

  -- The other three templates are untouched by 0007.
  if exists (
    select 1 from compliance_templates
    where key <> 'privacy' and (position('server logs' in body) > 0 or position('host name of the website' in body) > 0)
  ) then
    raise exception 'C-04: 0007 changed a template other than the Privacy Policy';
  end if;
end $$;

\echo 'ALL PRIVACY TEMPLATE TESTS PASSED'
