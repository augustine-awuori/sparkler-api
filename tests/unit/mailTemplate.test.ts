import { describe, expect, it } from "vitest";

import { renderAnnouncement } from "../../src/services/mailTemplate.js";

describe("renderAnnouncement", () => {
  it("escapes HTML in the heading and message", () => {
    const { html } = renderAnnouncement({
      heading: "<script>x</script>",
      message: `Tom & "Jerry" <img src=x>`,
    });

    expect(html).not.toContain("<script>x</script>");
    expect(html).not.toContain("<img src=x>");
    expect(html).toContain("&lt;script&gt;x&lt;/script&gt;");
    expect(html).toContain("Tom &amp; &quot;Jerry&quot; &lt;img src=x&gt;");
  });

  it("splits paragraphs on blank lines and keeps single line breaks", () => {
    const { html } = renderAnnouncement({ message: "First line\nsame paragraph\n\nSecond" });

    expect(html).toContain("First line<br>same paragraph</p>");
    expect(html).toMatch(/>Second<\/p>/);
  });

  it("renders the call-to-action only when given", () => {
    expect(renderAnnouncement({ message: "m" }).html).not.toContain("&rarr;");

    const { html } = renderAnnouncement({
      message: "m",
      cta: { label: "Update now", url: "https://sparkler.website/?a=1&b=2" },
    });
    expect(html).toContain('href="https://sparkler.website/?a=1&amp;b=2"');
    expect(html).toContain("Update now&nbsp;&rarr;");
  });

  it("uses the preheader, or the start of the message, as inbox preview text", () => {
    expect(renderAnnouncement({ message: "m", preheader: "Sneak peek" }).html).toContain(
      ">Sneak peek</div>",
    );
    expect(renderAnnouncement({ message: "Hello\n\nthere" }).html).toContain(">Hello there</div>");
  });

  it("uses the footnote, when given, as the footer's reason line", () => {
    const { html, text } = renderAnnouncement({ message: "m", footnote: "Because <you> asked." });

    expect(html).toContain("Because &lt;you&gt; asked.");
    expect(html).not.toContain("because you have a Sparkler account");
    expect(text).toContain("Because <you> asked.");
  });

  it("produces a plain-text part with the heading, message and CTA URL", () => {
    const { text } = renderAnnouncement({
      heading: "What's new",
      message: "Para one\n\nPara two",
      cta: { label: "Open Sparkler", url: "https://sparkler.website/" },
    });

    expect(text).toContain("What's new\n==========");
    expect(text).toContain("Para one\n\nPara two");
    expect(text).toContain("Open Sparkler: https://sparkler.website/");
    expect(text).not.toMatch(/<[a-z]/i);
  });
});
