import "./site.css";

/**
 * What a visitor sees on a host that is not a live brand site, or for a page
 * that is not published (S01-6, addition 3): nothing that names a brand, a
 * page, or a link, so nothing is revealed. Served with status 404.
 */
export default function NotAvailable() {
  return (
    <div className="site">
      <main>
        <div className="wrap">
          <h1>This site is not available.</h1>
        </div>
      </main>
    </div>
  );
}
