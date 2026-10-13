import Link from "next/link";
import { checkModule } from "@/core/brand-access";
import { createClient } from "@/core/supabase/server";

/**
 * T-07: one guard for every affiliate screen. A brand without the affiliate
 * module sees a plain explanation instead of the screen. Server actions check
 * again, and the database refuses the writes in any case (0005).
 */
export default async function AffiliateGuard({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ brandId: string }>;
}) {
  const { brandId } = await params;
  const access = await checkModule(await createClient(), brandId, "affiliate");
  if (access.allowed) return children;
  return (
    <main className="stack">
      <p className="error" role="alert">{access.message}</p>
      <p>
        <Link href={`/brands/${brandId}`}>Go to the brand's Overview</Link>
      </p>
    </main>
  );
}
