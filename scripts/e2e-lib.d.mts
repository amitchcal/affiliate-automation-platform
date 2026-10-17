// Types for e2e-lib.mjs, so playwright.config.ts and the tests type-check.
export interface RunUser {
  email: string;
  password: string;
  /** The authenticator's key, for the roles that require two-factor sign-in (T-05). */
  totpKey?: string;
}
export interface Run {
  supabaseUrl: string;
  anonKey: string;
  preparedAt: string;
  users: Record<"owner" | "clientAdmin" | "clientViewer" | "otherAdmin", RunUser>;
}
export const ROOT: string;
export const LOCAL_SUPABASE_URL: "http://127.0.0.1:54421";
export const LOCAL_DB_PORT: number;
export const FORBIDDEN_PORTS: number[];
export const HOSTED_PROJECT_REF: string;
export const E2E_WORKDIR: string;
export const E2E_PROJECT_ID: string;
export const DB_CONTAINER: string;
export const RUN_FILE: string;
export const DNS_FAKE_FILE: string;
export const DNS_TARGETS: { cname: string; a: string };
export const TEST_BRAND_HOSTS: string[];
export const DIST_DIR: string;
export const APP_PORT: number;
export const MAIL_PORT: number;
export const MAIL_URL: string;
export function supabaseUrlRefusal(url: unknown): string | null;
export function dbUrlRefusal(dbUrl: unknown): string | null;
export function configRefusal(configText: string): string | null;
export function assertLocalUrl(url: string): void;
export function assertE2eConfig(): void;
export function readRun(): Run;
export function appEnv(run: Run, serviceKey?: string): Record<string, string>;
export function localServiceKey(): string;
export function docker(args: string[], options?: { capture?: boolean; input?: string }): { status: number | null; stdout: string; stderr: string };
export function fail(message: string): never;
