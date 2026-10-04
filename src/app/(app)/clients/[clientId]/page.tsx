import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function ClientPage({ params }: { params: Promise<{ clientId: string }> }) {
  const { clientId } = await params;
  const supabase = await createClient();
  const { data: client } = await supabase
    .from("clients")
    .select("id, name, brands(id, name, domain, niche)")
    .eq("id", clientId)
    .maybeSingle();
  if (!client) notFound();

  return (
    <main className="stack">
      <div>
        <p className="crumbs">
          <Link href="/clients">Clients</Link>
        </p>
        <h1>{client.name}</h1>
        <p className="lede">Choose a brand to set its niche and score its offers.</p>
      </div>
      {client.brands.length > 0 ? (
        <ul className="rows">
          {client.brands.map((brand) => (
            <li key={brand.id}>
              <Link href={`/brands/${brand.id}`} className="rowlink">
                <strong>{brand.name}</strong>
                <span>
                  {brand.domain}
                  {brand.niche ? `, ${brand.niche}` : ", niche not chosen"}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="panel empty">This client has no brands yet.</p>
      )}
    </main>
  );
}
