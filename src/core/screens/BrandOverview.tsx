import { notFound } from "next/navigation";
import { createClient } from "@/core/supabase/server";
import { savedValuesKey } from "@/core/form-key";
import { StatusMessages } from "@/core/components/StatusMessages";
import { BUSINESS_TYPES, ModuleDefinition, modulesFor } from "@/core/modules";
import { saveBusinessType, saveChoices, saveDetails } from "./brand-actions";

const PLATFORMS: { value: string; label: string; why: string }[] = [
  { value: "articles", label: "Articles on the site", why: "Free. Suits offers that earn little per visitor. Slow to build, lasting once built." },
  { value: "pinterest", label: "Pinterest", why: "Free. Strong for how-to, home, pet, and parenting topics." },
  { value: "instagram", label: "Instagram", why: "Free. Short videos reach new people; one link in the profile." },
  { value: "youtube", label: "YouTube", why: "Free. Best for demonstrations; takes more effort per piece." },
  { value: "meta_ads", label: "Meta and Instagram ads", why: "Paid. Worth it only where the score recommends paid ads." },
];

interface Profile {
  operator?: string;
  address?: string;
  email?: string;
  tagline?: string;
}

/**
 * A brand's overview (core): its business type and the modules it switches on
 * (T-07), its niche and platforms (O-01, O-07), and its business details (C-01).
 * The list of modules is passed in by src/app, so core never imports a module.
 */
export default async function BrandOverview({
  params,
  searchParams,
  modules,
}: {
  params: Promise<{ brandId: string }>;
  searchParams: Promise<{ notice?: string; error?: string }>;
  modules: ModuleDefinition[];
}) {
  const { brandId } = await params;
  const { notice, error } = await searchParams;
  const supabase = await createClient();

  const { data: brand } = await supabase
    .from("brands")
    .select("id, niche, platforms, business_type, profile")
    .eq("id", brandId)
    .maybeSingle();
  if (!brand) notFound();

  const enabled = modulesFor(brand.business_type as string);
  const chosen = new Set<string>(brand.platforms ?? []);
  const profile = (brand.profile ?? {}) as Profile;

  return (
    <main className="stack">
      <StatusMessages notice={notice} error={error} />

      <section className="stack" aria-labelledby="business-type">
        <div>
          <h2 id="business-type">Business type</h2>
          <p className="lede">
            Decides which features this brand uses. Switching a feature off hides its screens and stops changes to it;
            nothing already recorded is deleted.
          </p>
        </div>
        <form key={savedValuesKey(brand.business_type)} action={saveBusinessType} className="panel stack" autoComplete="off">
          <input type="hidden" name="brand_id" value={brand.id} />
          <fieldset>
            <legend>What kind of business is this brand?</legend>
            <div className="stack" style={{ gap: 8 }}>
              {BUSINESS_TYPES.map((type) => (
                <label key={type.value} style={{ fontWeight: 400 }}>
                  <span style={{ display: "flex", gap: 8, alignItems: "center", color: "var(--ink)", fontWeight: 600 }}>
                    <input
                      type="radio"
                      name="business_type"
                      value={type.value}
                      defaultChecked={brand.business_type === type.value}
                      required
                    />
                    {type.label}
                  </span>
                  <span className="hint">{type.description}</span>
                </label>
              ))}
            </div>
          </fieldset>
          <div>
            <button type="submit">Save business type</button>
          </div>
        </form>
        <ul className="rows">
          {modules.map((module) => (
            <li key={module.id}>
              <div className="split">
                <div>
                  <strong>{module.label}</strong>
                  <div className="hint">{module.summary}</div>
                </div>
                <span className={`status ${enabled.includes(module.id) ? "published" : "draft"}`}>
                  {enabled.includes(module.id) ? "On" : "Off"}
                </span>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="stack" aria-labelledby="choices">
        <h2 id="choices">Niche and platforms</h2>
        <form key={savedValuesKey({ niche: brand.niche, platforms: brand.platforms })} action={saveChoices} className="panel grid" autoComplete="off">
          <input type="hidden" name="brand_id" value={brand.id} />
          <label className="wide">
            Niche <span className="hint">What this brand is about, in a few words.</span>
            <input type="text" name="niche" defaultValue={brand.niche ?? ""} placeholder="For example: productivity software" />
          </label>
          <fieldset className="wide">
            <legend>Platforms</legend>
            <div className="stack" style={{ gap: 8 }}>
              {PLATFORMS.map((platform) => (
                <label key={platform.value} style={{ fontWeight: 400 }}>
                  <span style={{ display: "flex", gap: 8, alignItems: "center", color: "var(--ink)", fontWeight: 600 }}>
                    <input type="checkbox" name="platforms" value={platform.value} defaultChecked={chosen.has(platform.value)} />
                    {platform.label}
                  </span>
                  <span className="hint">{platform.why}</span>
                </label>
              ))}
            </div>
          </fieldset>
          <div className="wide">
            <button type="submit">Save choices</button>
          </div>
        </form>
      </section>

      <section className="stack" aria-labelledby="details">
        <div>
          <h2 id="details">Business details</h2>
          <p className="lede">Who runs this brand and how to reach them. An affiliate site uses these on its standard pages.</p>
        </div>
        <form key={savedValuesKey(profile)} action={saveDetails} className="panel grid" autoComplete="off">
          <input type="hidden" name="brand_id" value={brand.id} />
          <label>
            Operator name <span className="hint">The business that runs this brand.</span>
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
            Home page headline <span className="hint">One line saying what the brand offers.</span>
            <input type="text" name="tagline" defaultValue={profile.tagline ?? ""} />
          </label>
          <div className="wide">
            <button type="submit">Save business details</button>
          </div>
        </form>
      </section>
    </main>
  );
}
