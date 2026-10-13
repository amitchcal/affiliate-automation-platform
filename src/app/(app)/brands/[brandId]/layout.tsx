import Link from "next/link";
import { notFound } from "next/navigation";
import { BrandNav } from "@/core/components/BrandNav";
import { businessTypeLabel, tabsFor } from "@/core/modules";
import { createClient } from "@/core/supabase/server";
import { MODULES } from "@/modules";

/**
 * The header every brand screen shares: where you are, the brand, its business
 * type, and the tabs of the modules it has (T-07).
 */
export default async function BrandLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ brandId: string }>;
}) {
  const { brandId } = await params;
  const supabase = await createClient();
  const { data: brand } = await supabase
    .from("brands")
    .select("id, client_id, name, domain, target_country, business_type, clients(name)")
    .eq("id", brandId)
    .maybeSingle();
  if (!brand) notFound();

  const clientName = (brand.clients as unknown as { name: string } | null)?.name ?? "Client";

  return (
    <div className="stack">
      <div>
        <p className="crumbs">
          <Link href="/clients">Clients</Link> / <Link href={`/clients/${brand.client_id}`}>{clientName}</Link>
        </p>
        <h1>{brand.name}</h1>
        <p className="lede">
          {brand.domain}, {businessTypeLabel(brand.business_type as string).toLowerCase()}
          {brand.target_country ? `, audience in ${brand.target_country}` : ""}
        </p>
        <BrandNav brandId={brand.id} tabs={tabsFor(brand.business_type as string, MODULES)} />
      </div>
      {children}
    </div>
  );
}
