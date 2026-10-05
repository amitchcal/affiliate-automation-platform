/**
 * A deliberately small Markdown renderer for site pages (S-02, S-06).
 *
 * Page bodies are written by people and, later, by agents, so the renderer
 * escapes all HTML first and then adds back only the handful of elements a
 * page needs. Nothing in a page body can inject script or markup.
 *
 * Supported: "## " and "### " headings, "- " lists, "1. " lists, paragraphs,
 * **bold**, [text](url), and a call-to-action line: [[cta:Button label]]
 */

export interface RenderOptions {
  /** Where the page's call-to-action button points, e.g. "/go/offer-slug". */
  ctaHref?: string;
}

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Only web, mail, and same-site links are allowed. */
export function safeUrl(url: string): string | undefined {
  const trimmed = url.trim();
  if (/^(https?:\/\/|mailto:)/i.test(trimmed)) return trimmed;
  if (/^\/(?!\/)/.test(trimmed)) return trimmed;
  return undefined;
}

function inline(escaped: string): string {
  return escaped
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (whole, label: string, url: string) => {
      const href = safeUrl(url.replace(/&amp;/g, "&"));
      if (!href) return label;
      const external = /^https?:/i.test(href);
      return `<a href="${escapeHtml(href)}"${external ? ' target="_blank" rel="noopener nofollow"' : ""}>${label}</a>`;
    })
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
}

const CTA = /^\[\[cta:(.+)\]\]$/;

export function renderMarkdown(source: string, options: RenderOptions = {}): string {
  const lines = source.replace(/\r\n?/g, "\n").split("\n");
  const html: string[] = [];
  let paragraph: string[] = [];
  let list: { tag: "ul" | "ol"; items: string[] } | undefined;

  const flushParagraph = () => {
    if (paragraph.length) html.push(`<p>${paragraph.join("<br>")}</p>`);
    paragraph = [];
  };
  const flushList = () => {
    if (list) html.push(`<${list.tag}>${list.items.map((item) => `<li>${item}</li>`).join("")}</${list.tag}>`);
    list = undefined;
  };
  const flush = () => {
    flushParagraph();
    flushList();
  };

  for (const raw of lines) {
    const line = raw.trim();

    if (line === "") {
      flush();
      continue;
    }

    const cta = line.match(CTA);
    if (cta) {
      flush();
      if (options.ctaHref) {
        html.push(
          `<p class="cta"><a class="button" href="${escapeHtml(options.ctaHref)}" target="_blank" rel="sponsored nofollow noopener">${escapeHtml(cta[1].trim())}</a>` +
            `<span class="cta-note">Affiliate link. Opens the seller's website in a new tab.</span></p>`,
        );
      }
      continue;
    }

    const heading = line.match(/^(#{2,3})\s+(.+)$/);
    if (heading) {
      flush();
      const tag = heading[1].length === 2 ? "h2" : "h3";
      html.push(`<${tag}>${inline(escapeHtml(heading[2]))}</${tag}>`);
      continue;
    }

    const bullet = line.match(/^[-*]\s+(.+)$/);
    const numbered = line.match(/^\d+[.)]\s+(.+)$/);
    if (bullet || numbered) {
      flushParagraph();
      const tag = bullet ? "ul" : "ol";
      if (list && list.tag !== tag) flushList();
      list ??= { tag, items: [] };
      list.items.push(inline(escapeHtml((bullet ?? numbered)![1])));
      continue;
    }

    flushList();
    paragraph.push(inline(escapeHtml(line)));
  }
  flush();
  return html.join("\n");
}
