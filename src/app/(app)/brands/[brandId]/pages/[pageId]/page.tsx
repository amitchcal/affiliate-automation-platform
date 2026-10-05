import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { checkContent } from "@/lib/compliance";
import { renderMarkdown } from "@/lib/markdown";
import { publishPage, saveDraft, unpublishPage } from "../../site/actions";
import "@/app/site/site.css";

export default async function PageEditor({
  params,
  searchParams,
}: {
  params: Promise<{ brandId: string; pageId: string }>;
  searchParams: Promise<{ notice?: string; error?: string }>;
}) {
  const { brandId, pageId } = await params;
  const { notice, error } = await searchParams;
  const supabase = await createClient();

  const { data: page } = await supabase
    .from("site_pages")
    .select("*, brands(name, domain)")
    .eq("id", pageId)
    .eq("brand_id", brandId)
    .maybeSingle();
  if (!page) notFound();

  const brand = page.brands as unknown as { name: string; domain: string };

  let bannedClaims: string[] = [];
  if (page.offer_id) {
    const { data: rules } = await supabase
      .from("offer_rules")
      .select("banned_claims")
      .eq("offer_id", page.offer_id)
      .maybeSingle();
    bannedClaims = (rules?.banned_claims as string[] | null) ?? [];
  }
  const check = checkContent(`${page.title}\n${page.summary}\n${page.draft_body}`, bannedClaims);

  const published = page.status === "published";
  const changed =
    published &&
    (page.title !== page.published_title ||
      page.summary !== (page.published_summary ?? "") ||
      page.draft_body !== page.published_body);
  const kindLabel = page.kind === "standard" ? "Standard page" : page.kind === "offer" ? "Offer page" : "Article";

  return (
    <main className="stack">
      <div>
        <p className="crumbs">
          <Link href={`/brands/${brandId}/site`}>{brand.name}: site and links</Link>
        </p>
        <div className="split">
          <h1>{page.title}</h1>
          <span className={`status ${published ? (changed ? "changed" : "published") : "draft"}`}>
            {published ? (changed ? "Published, with unpublished changes" : "Published") : "Draft"}
          </span>
        </div>
        <p className="lede">
          {kindLabel} at <span className="mono">https://{brand.domain}/{page.slug}</span>
        </p>
      </div>

      {notice ? <p className="notice" role="status">{notice}</p> : null}
      {error ? <p className="error" role="alert">{error}</p> : null}

      <section className="stack" aria-labelledby="edit">
        <h2 id="edit">Edit</h2>
        <form className="panel grid">
          <input type="hidden" name="brand_id" value={brandId} />
          <input type="hidden" name="page_id" value={page.id} />
          <label className="wide">
            Title
            <input type="text" name="title" defaultValue={page.title} required />
          </label>
          <label className="wide">
            Summary <span className="hint">One or two sentences. Shown on the home page and under the title.</span>
            <input type="text" name="summary" defaultValue={page.summary} />
          </label>
          <label className="wide">
            Body{" "}
            <span className="hint">
              Start a line with ## for a heading or - for a list item. Use **bold** and [text](https://address).
              {page.kind === "offer" ? " Write [[cta:Button label]] on its own line for the affiliate button." : ""}
            </span>
            <textarea name="body" defaultValue={page.draft_body} />
          </label>
          <div className="wide actions">
            <button type="submit" formAction={publishPage}>
              {published ? "Publish changes" : "Publish"}
            </button>
            <button type="submit" formAction={saveDraft} className="quiet">
              Save draft
            </button>
            {published ? (
              <button type="submit" formAction={unpublishPage} className="quiet">
                Unpublish
              </button>
            ) : null}
          </div>
        </form>
      </section>

      {page.kind !== "standard" ? (
      <section className="stack" aria-labelledby="check">
        <h2 id="check">Wording check</h2>
        {check.pass ? (
          <p className="notice">The saved draft passes the wording check.</p>
        ) : (
          <div className="error">
            <p>The saved draft cannot be published until this wording is changed:</p>
            <ul className="problems">
              {check.problems.map((problem) => (
                <li key={`${problem.rule}-${problem.match}`}>
                  {problem.rule}: "{problem.match}"
                </li>
              ))}
            </ul>
          </div>
        )}
        <p className="lede">
          The check looks for superlatives, urgency, absolute or health claims, wording that implies you used the
          product, and any claims the seller has banned. It cannot tell whether a factual statement is true.
        </p>
      </section>
      ) : null}

      <section className="stack" aria-labelledby="preview">
        <h2 id="preview">Preview of the saved draft</h2>
        <div className="preview">
          <div className="site">
            <main>
              <div className="wrap">
                <article>
                  <h1>{page.title}</h1>
                  {page.kind === "offer" ? (
                    <p className="disclosure">
                      <strong>Disclosure:</strong> {brand.name} earns a commission if you buy through the links on this
                      page, at no extra cost to you. {brand.name} is an independent affiliate; this is not the
                      seller's official website. Read our full disclosure.
                    </p>
                  ) : null}
                  {page.summary && page.kind !== "standard" ? <p className="standfirst">{page.summary}</p> : null}
                  <div
                    dangerouslySetInnerHTML={{
                      __html: renderMarkdown(page.draft_body, { ctaHref: page.kind === "offer" ? "#preview" : undefined }),
                    }}
                  />
                </article>
              </div>
            </main>
          </div>
        </div>
      </section>
    </main>
  );
}
