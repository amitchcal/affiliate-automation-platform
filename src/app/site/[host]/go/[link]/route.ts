import { NextResponse, type NextRequest } from "next/server";
import { createPublicClient } from "@/lib/supabase/public";

/**
 * S-07: every outbound click is recorded with its brand, offer, page, and
 * source, and only then is the visitor sent to the seller. No personal data
 * is stored: only the referring site's host name, never an IP address.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ host: string; link: string }> }) {
  const { host: rawHost, link } = await params;
  const host = decodeURIComponent(rawHost);

  let referrerHost: string | null = null;
  try {
    const referrer = request.headers.get("referer");
    if (referrer) referrerHost = new URL(referrer).hostname;
  } catch {
    referrerHost = null;
  }

  const { data: destination } = await createPublicClient().rpc("record_click", {
    p_host: host,
    p_link: link,
    p_page: request.nextUrl.searchParams.get("from"),
    p_referrer_host: referrerHost,
  });

  const robots = { "X-Robots-Tag": "noindex, nofollow" };
  if (typeof destination === "string" && /^https?:\/\//i.test(destination)) {
    return NextResponse.redirect(destination, { status: 302, headers: robots });
  }
  return new NextResponse("This link is no longer available.", { status: 404, headers: robots });
}
