// Types for e2e-lib.mjs, so playwright.config.ts and the tests type-check.
export interface RunUser {
  email: string;
  password: string;
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
export const DIST_DIR: string;
export const APP_PORT: number;
export function supabaseUrlRefusal(url: unknown): string | null;
export function dbUrlRefusal(dbUrl: unknown): string | null;
export function configRefusal(configText: string): string | null;
export function assertLocalUrl(url: string): void;
export function assertE2eConfig(): void;
export function readRun(): Run;
export function appEnv(run: Run): Record<string, string>;
export function fail(message: string): never;
