import Link from "next/link";
import { notFound } from "next/navigation";
import { BrandNav } from "@/components/BrandNav";
import { createClient } from "@/lib/supabase/server";
import { BusinessDetails, missingDetails } from "@/lib/site";
import { createArticle, createLink, createOfferPage, createStandardPages, saveDetails } from "./actions";

interface PageRow {
  id: string;
  kind: "standard" | "offer" | "article";
  slug: string;
  title: string;
  summary: string;
  draft_body: string;
  status: "draft" | "published";
  published_title: string | null;
  published_summary: string | null;
  published_body: string | null;
  offer_id: string | null;
}

interface LinkRow {
  id: string;
  slug: string;
  channel: string;
  campaign: string | null;
  creative: string | null;
  offer_id: string;
  click_events: { count: number }[];
}

function pageStatus(page: PageRow): { label: string; className: string } {
  if (page.status !== "published") return { label: "Draft", className: "draft" };
  const changed =
    page.title !== page.published_title ||
    page.summary !== (page.published_summary ?? "") ||
    page.draft_body !== page.published_body;
  return changed
    ? { label: "Published, with unpublished changes", className: "changed" }
    : { label: "Published", className: "published" };
}

const CHANNELS = ["pinterest", "instagram", "youtube", "meta", "email"];

export default async function BrandSitePage({
  params,
  searchParams,
}: {
  params: Promise<{ brandId: string }>;
  searchParams: Promise<{ notice?: string; error?: string }>;
}) {
  const { brandId } = await params;
  const { notice, error } = await searchParams;
  const supabase = await createClient();

  const { data: brand } = await supabase
    .from("brands")
    .select("id, client_id, name, domain, profile, clients(name)")
    .eq("id", brandId)
    .maybeSingle();
  if (!brand) notFound();

  const [{ data: pageRows }, { data: offerRows }, { data: linkRows }] = await Promise.all([
    supabase.from("site_pages").select("*").eq("brand_id", brandId).order("created_at"),
    supabase.from("offers").select("id, name, status, affiliate_link").eq("brand_id", brandId).eq("status", "approved"),
    supabase
      .from("tracked_links")
      .select("id, slug, channel, campaign, creative, offer_id, click_events(count)")
      .eq("brand_id", brandId)
      .order("created_at"),
  ]);

  const pages = (pageRows ?? []) as PageRow[];
  const offers = offerRows ?? [];
  const links = (linkRows ?? []) as unknown as LinkRow[];
  const profile = (brand.profile ?? {}) as BusinessDetails;
  const missing = missingDetails(profile);

  const standardOrder = ["affiliate-disclosure", "privacy", "terms", "contact"];
  const standard = pages
    .filter((page) => page.kind === "standard")
    .sort((a, b) => standardOrder.indexOf(a.slug) - standardOrder.indexOf(b.slug));
  const content = pages.filter((page) => page.kind !== "standard");
  const offersWithoutPage = offers.filter((offer) => !pages.some((page) => page.offer_id === offer.id));
  const offerName = (id: string) => offers.find((offer) => offer.id === id)?.name ?? "Offer";
  const clientName = (brand.clients as unknown as { name: string } | null)?.name ?? "Client";
  const previewBase = `/site/${brand.domain}`;

  return (
    <main className="stack">
      <div>
        <p className="crumbs">
          <Link href="/clients">Clients</Link> / <Link href={`/clients/${brand.client_id}`}>{clientName}</Link>
        </p>
        <div className="split">
          <h1>{brand.name}</h1>
          <a href={previewBase} target="_blank" rel="noopener">
            View the public site
          </a>
        </div>
        <BrandNav brandId={brand.id} current="site" />
      </div>

      {notice ? <p className="notice" role="status">{notice}</p> : null}
      {error ? <p className="error" role="alert">{error}</p> : null}

      <section className="stack" aria-labelledby="details">
        <div>
          <h2 id="details">Business details</h2>
          <p className="lede">These fill the disclosure, privacy, terms, and contact pages.</p>
        </div>
        <form action={saveDetails} className="panel grid">
          <input type="hidden" name="brand_id" value={brand.id} />
          <label>
            Operator name <span className="hint">The business that runs this site.</span>
            <input type="text" name="operator" defaultValue={profile.operator ?? ""} />
          </label>
          <label>
            Contact email
            <input type="email" name="email" defaultValue={profile.email ?? ""} />
          </label>
          <label className="wide">
            Address
            <input type="text" name="address" defaultValue={profile.address ?? ""} />
          </label>
          <label className="wide">
            Home page headline <span className="hint">One line saying what the site offers.</span>
            <input type="text" name="tagline" defaultValue={profile.tagline ?? ""} />
          </label>
          <div className="wide">
            <button type="submit">Save business details</button>
          </div>
        </form>
      </section>

      <section className="stack" aria-labelledby="standard">
        <div>
          <h2 id="standard">Standard pages</h2>
          <p className="lede">
            All four must be published before any offer page or article can be. Each starts from the platform's
            template with this brand's details filled in.
          </p>
        </div>
        {standard.length < 4 ? (
          <form action={createStandardPages} className="panel">
            <input type="hidden" name="brand_id" value={brand.id} />
            {missing.length > 0 ? (
              <p>Add the {missing.join(", ")} above, then create the pages.</p>
            ) : (
              <p>Creates the pages as drafts for you to review.</p>
            )}
            <div className="actions">
              <button type="submit">Create standard pages</button>
            </div>
          </form>
        ) : null}
        {standard.length > 0 ? <PageList brandId={brand.id} pages={standard} previewBase={previewBase} /> : null}
      </section>

      <section className="stack" aria-labelledby="content">
        <div>
          <h2 id="content">Offer pages and articles</h2>
          <p className="lede">Every page starts as a draft. Its wording is checked when you publish.</p>
        </div>

        {content.length > 0 ? (
          <PageList brandId={brand.id} pages={content} previewBase={previewBase} />
        ) : (
          <p className="panel empty">No offer pages or articles yet.</p>
        )}

        {offersWithoutPage.map((offer) => (
          <form key={offer.id} action={createOfferPage} className="panel inline">
            <input type="hidden" name="brand_id" value={brand.id} />
            <input type="hidden" name="offer_id" value={offer.id} />
            <label>
              {offer.name} <span className="hint">Approved, no page yet. Your affiliate link:</span>
              <input type="url" name="affiliate_link" defaultValue={offer.affiliate_link ?? ""} placeholder="https://" required />
            </label>
            <button type="submit">Create offer page</button>
          </form>
        ))}

        <form action={createArticle} className="panel inline">
          <input type="hidden" name="brand_id" value={brand.id} />
          <label>
            New article title
            <input type="text" name="title" required />
          </label>
          <button type="submit" className="quiet">Create article</button>
        </form>
      </section>

      <section className="stack" aria-labelledby="links">
        <div>
          <h2 id="links">Tracked links</h2>
          <p className="lede">
            Use a separate link for each channel and each ad variant, so every click and sale can be traced to its
            source.
          </p>
        </div>
        {links.length > 0 ? (
          <div className="panel" style={{ overflowX: "auto" }}>
            <table className="links">
              <thead>
                <tr>
                  <th>Offer</th>
                  <th>Channel</th>
                  <th>Campaign and creative</th>
                  <th>Link to share</th>
                  <th style={{ textAlign: "right" }}>Clicks</th>
                </tr>
              </thead>
              <tbody>
                {links.map((link) => (
                  <tr key={link.id}>
                    <td>{offerName(link.offer_id)}</td>
                    <td>{link.channel}</td>
                    <td>{[link.campaign, link.creative].filter(Boolean).join(", ") || "None"}</td>
                    <td className="mono">
                      https://{brand.domain}/go/{link.slug}
                    </td>
                    <td className="num">{link.click_events?.[0]?.count ?? 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="panel empty">No links yet. A site link is created with each offer page.</p>
        )}

        {offers.some((offer) => offer.affiliate_link) ? (
          <form action={createLink} className="panel grid">
            <input type="hidden" name="brand_id" value={brand.id} />
            <label>
              Offer
              <select name="offer_id">
                {offers
                  .filter((offer) => offer.affiliate_link)
                  .map((offer) => (
                    <option key={offer.id} value={offer.id}>
                      {offer.name}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              Channel
              <select name="channel">
                {CHANNELS.map((channel) => (
                  <option key={channel} value={channel}>
                    {channel}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Campaign <span className="hint">Optional.</span>
              <input type="text" name="campaign" />
            </label>
            <label>
              Creative <span className="hint">Optional. For example: headline-a</span>
              <input type="text" name="creative" />
            </label>
            <div className="wide">
              <button type="submit" className="quiet">Create link</button>
            </div>
          </form>
        ) : null}
      </section>
    </main>
  );
}

function PageList({ brandId, pages, previewBase }: { brandId: string; pages: PageRow[]; previewBase: string }) {
  return (
    <ul className="rows">
      {pages.map((page) => {
        const status = pageStatus(page);
        return (
          <li key={page.id}>
            <div className="split">
              <div>
                <Link href={`/brands/${brandId}/pages/${page.id}`}>
                  <strong>{page.title}</strong>
                </Link>
                <div className="mono" style={{ color: "var(--muted)" }}>/{page.slug}</div>
              </div>
              <div className="inline" style={{ alignItems: "center" }}>
                <span className={`status ${status.className}`}>{status.label}</span>
                {page.status === "published" ? (
                  <a href={`${previewBase}/${page.slug}`} target="_blank" rel="noopener">
                    View
                  </a>
                ) : null}
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
