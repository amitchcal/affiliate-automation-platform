import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

/** T-04: the owner sees every client; other users see only their own (T-02). */
export default async function ClientsPage() {
  const supabase = await createClient();
  const { data: clients, error } = await supabase
    .from("clients")
    .select("id, name, brands(id)")
    .order("name");

  return (
    <main className="stack">
      <div>
        <h1>Clients</h1>
        <p className="lede">Each client's brands, offers, and results are kept separate.</p>
      </div>
      {error ? <p className="error" role="alert">Clients could not be loaded: {error.message}</p> : null}
      {clients && clients.length > 0 ? (
        <ul className="rows">
          {clients.map((client) => (
            <li key={client.id}>
              <Link href={`/clients/${client.id}`} className="rowlink">
                <strong>{client.name}</strong>
                <span>
                  {client.brands.length} {client.brands.length === 1 ? "brand" : "brands"}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="panel empty">
          No clients are visible to this account. If you expected to see some, check that the seed
          file ran and that this account has a membership.
        </p>
      )}
    </main>
  );
}
