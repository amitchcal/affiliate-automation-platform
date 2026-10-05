import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Two jobs:
 *
 * 1. Routing by domain (S-01). A request for a brand's own domain is served
 *    that brand's public site. A request for an admin host is served the
 *    application. Admin hosts are localhost, any *.vercel.app address, and
 *    anything listed in ADMIN_HOSTS.
 *
 * 2. Sessions. On admin hosts, the session is refreshed and signed-out
 *    visitors are sent to sign-in. Data protection does not rely on this:
 *    the database's row-level security is the real barrier (T-02).
 */

const ADMIN_HOSTS = (process.env.ADMIN_HOSTS ?? "localhost,127.0.0.1")
  .split(",")
  .map((host) => host.trim().toLowerCase())
  .filter(Boolean);

function isAdminHost(host: string): boolean {
  return ADMIN_HOSTS.includes(host) || host.endsWith(".vercel.app");
}

function withSiteBase(request: NextRequest, base: string): Headers {
  const headers = new Headers(request.headers);
  headers.set("x-site-base", base);
  return headers;
}

export async function middleware(request: NextRequest) {
  const host = (request.headers.get("host") ?? "").split(":")[0].toLowerCase();
  const { pathname } = request.nextUrl;

  // A brand's own domain: serve its public site from the root.
  if (!isAdminHost(host)) {
    const url = request.nextUrl.clone();
    url.pathname = `/site/${host}${pathname === "/" ? "" : pathname}`;
    return NextResponse.rewrite(url, { request: { headers: withSiteBase(request, "root") } });
  }

  // Public preview of a brand's site on the admin host: /site/<domain>/...
  if (pathname.startsWith("/site/")) {
    const domain = pathname.split("/")[2] ?? "";
    return NextResponse.next({ request: { headers: withSiteBase(request, `/site/${domain}`) } });
  }

  let response = NextResponse.next({ request });
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isLogin = pathname.startsWith("/login");
  if (!user && !isLogin) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }
  if (user && isLogin) {
    const url = request.nextUrl.clone();
    url.pathname = "/clients";
    return NextResponse.redirect(url);
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
