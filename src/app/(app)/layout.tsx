import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "./actions";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return (
    <div className="shell">
      <header className="topbar">
        <Link href="/clients" className="brandmark">
          Marketing Automation Platform
        </Link>
        <div className="who">
          <span>{user.email}</span>
          <form action={signOut}>
            <button type="submit" className="quiet">
              Sign out
            </button>
          </form>
        </div>
      </header>
      {children}
    </div>
  );
}
