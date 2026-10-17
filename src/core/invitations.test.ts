import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  AppRole,
  canInvite,
  formatDate,
  INVITABLE_ROLES,
  invitationSentMessage,
  isValidEmail,
  normaliseEmail,
  REFUSAL_MESSAGES,
  refusalMessage,
  rolesOfferedTo,
} from "./invitations";

const ALL_ROLES: AppRole[] = ["owner", "operator", "client_admin", "client_viewer"];

describe("canInvite (T-03), the same rule as can_invite() in 0008", () => {
  // inviter -> roles allowed into their own client; other client in brackets
  const expected: Record<AppRole, { same: AppRole[]; other: AppRole[] }> = {
    owner: { same: ["operator", "client_admin", "client_viewer"], other: ["operator", "client_admin", "client_viewer"] },
    client_admin: { same: ["client_admin", "client_viewer"], other: [] },
    operator: { same: [], other: [] },
    client_viewer: { same: [], other: [] },
  };

  for (const inviter of ALL_ROLES) {
    for (const target of ALL_ROLES) {
      for (const sameClient of [true, false]) {
        const allowed = expected[inviter][sameClient ? "same" : "other"].includes(target);
        it(`${inviter} inviting ${target} into ${sameClient ? "their own" : "another"} client: ${allowed ? "allowed" : "refused"}`, () => {
          expect(canInvite(inviter, target, sameClient)).toBe(allowed);
        });
      }
    }
  }

  it("nobody can invite an owner, and a person with no role can invite nobody", () => {
    for (const inviter of [...ALL_ROLES, null]) expect(canInvite(inviter, "owner", true)).toBe(false);
    for (const target of ALL_ROLES) expect(canInvite(null, target, true)).toBe(false);
  });

  it("operator invitations are owner-only", () => {
    expect(rolesOfferedTo("owner")).toEqual(INVITABLE_ROLES);
    expect(rolesOfferedTo("client_admin")).toEqual(["client_admin", "client_viewer"]);
    expect(rolesOfferedTo("operator")).toEqual([]);
    expect(rolesOfferedTo("client_viewer")).toEqual([]);
  });
});

describe("email addresses", () => {
  it("are trimmed and lower-cased", () => {
    expect(normaliseEmail("  Pat@Example.COM ")).toBe("pat@example.com");
    expect(normaliseEmail(null)).toBe("");
  });

  it("are checked the same way as the database", () => {
    for (const ok of ["a@b.co", "pat.smith+team@example.com"]) expect(isValidEmail(ok)).toBe(true);
    for (const bad of ["", "pat", "pat@", "@example.com", "pat@example", "pat smith@example.com", "pat@@example.com"]) {
      expect(isValidEmail(bad), bad).toBe(false);
    }
  });
});

describe("messages", () => {
  it("the sent message is the same for new and existing accounts and names only the address and date", () => {
    expect(invitationSentMessage("pat@example.com", "2026-10-24T09:00:00Z")).toBe(
      "Invitation sent to pat@example.com. It expires on October 24, 2026.",
    );
    expect(formatDate("2026-10-24T23:30:00Z")).toBe("October 24, 2026");
  });

  it("every refusal code raised by 0008 has a message", () => {
    const migration = readFileSync(path.join(__dirname, "../../supabase/migrations/0008_invitations.sql"), "utf8");
    const codes = [...migration.matchAll(/raise exception '([a-z_]+)'/g)].map((m) => m[1]);
    expect(codes.length).toBeGreaterThan(15);
    for (const code of new Set(codes)) expect(REFUSAL_MESSAGES[code], code).toBeDefined();
  });

  it("database wording never reaches the screen", () => {
    expect(refusalMessage('new row violates row-level security policy for table "invitations"')).toBe(
      "That did not work. Try again, and if it keeps happening, tell the owner.",
    );
    expect(refusalMessage(undefined)).toMatch(/^That did not work/);
  });

  it("refusals that name a person use the address and client given", () => {
    expect(refusalMessage("invite_already_member", { email: "pat@example.com", client: "Vividha Marketing" })).toBe(
      "pat@example.com already has access to Vividha Marketing. Their role is not changed by an invitation.",
    );
    expect(refusalMessage("invite_role_not_allowed")).toBe(
      "Client admins can invite other client admins and viewers. Only the owner can invite operators.",
    );
  });
});
