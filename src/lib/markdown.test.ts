import { describe, expect, it } from "vitest";
import { renderMarkdown, safeUrl } from "./markdown";

describe("renderMarkdown", () => {
  it("renders headings, paragraphs, lists, and bold", () => {
    const html = renderMarkdown("## What it is\n\nAn **online** course.\n\n- One\n- Two\n\n1. First\n2. Second");
    expect(html).toContain("<h2>What it is</h2>");
    expect(html).toContain("<p>An <strong>online</strong> course.</p>");
    expect(html).toContain("<ul><li>One</li><li>Two</li></ul>");
    expect(html).toContain("<ol><li>First</li><li>Second</li></ol>");
  });

  it("escapes HTML so page text cannot inject markup", () => {
    const html = renderMarkdown('<script>alert(1)</script> and <img src=x onerror="x">');
    expect(html).not.toContain("<script");
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;script&gt;");
  });

  it("drops links with unsafe addresses but keeps their text", () => {
    const html = renderMarkdown("[click](javascript:alert(1)) and [ok](https://example.com/a?b=1&c=2)");
    expect(html).not.toContain("javascript:");
    expect(html).toContain('href="https://example.com/a?b=1&amp;c=2"');
    expect(html).toContain('rel="noopener nofollow"');
  });

  it("keeps same-site links without opening a new tab", () => {
    const html = renderMarkdown("[Disclosure](/affiliate-disclosure)");
    expect(html).toBe('<p><a href="/affiliate-disclosure">Disclosure</a></p>');
  });

  it("turns a call-to-action line into a labelled affiliate button", () => {
    const html = renderMarkdown("[[cta:See the course on the official site]]", { ctaHref: "/go/offer-a" });
    expect(html).toContain('href="/go/offer-a"');
    expect(html).toContain('rel="sponsored nofollow noopener"');
    expect(html).toContain("Affiliate link.");
  });

  it("omits the call to action when the page has no link", () => {
    expect(renderMarkdown("[[cta:Buy]]")).toBe("");
  });
});

describe("safeUrl", () => {
  it("allows web, mail, and same-site addresses only", () => {
    expect(safeUrl("https://a.test")).toBe("https://a.test");
    expect(safeUrl("mailto:a@b.test")).toBe("mailto:a@b.test");
    expect(safeUrl("/page")).toBe("/page");
    expect(safeUrl("//evil.test")).toBeUndefined();
    expect(safeUrl("javascript:alert(1)")).toBeUndefined();
    expect(safeUrl("data:text/html,x")).toBeUndefined();
  });
});
