/**
 * The Sparkler announcement email: a branded, table-based layout with inline
 * styles, because Gmail, Outlook and Apple Mail each drop a different subset of
 * modern CSS. The <style> block only adds progressive extras (dark mode, phone
 * padding) for clients that honour it — the email reads fine without it.
 *
 * Colours are the web app's tokens converted from OKLCH: --primary
 * oklch(0.65 0.22 35) and --accent oklch(0.9 0.08 55).
 */

const BRAND = "#F84713";
const BRAND_SOFT = "#FFD1AC";
const INK = "#11161F";
const MUTED = "#6B7280";
const PAGE = "#FFF7F2";
const SITE = "https://sparkler.co.ke/";
const DEFAULT_FOOTNOTE =
  "You're receiving this because you have a Sparkler account.";
const FONT =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

export interface MailCta {
  label: string;
  /** Must be https — enforced by the mails route before rendering. */
  url: string;
}

export interface AnnouncementContent {
  message: string;
  heading?: string;
  cta?: MailCta;
  /** Inbox preview text. Defaults to the start of the message. */
  preheader?: string;
  /** Why the recipient got this email, shown in the footer. */
  footnote?: string;
}

export interface RenderedMail {
  html: string;
  text: string;
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Blank lines separate paragraphs; single newlines are kept as line breaks. */
function paragraphs(message: string): string[] {
  return message
    .replace(/\r\n/g, "\n")
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
}

function previewText(content: AnnouncementContent): string {
  const source = content.preheader ?? paragraphs(content.message).join(" ");
  const flat = source.replace(/\s+/g, " ").trim();
  return flat.length > 110 ? `${flat.slice(0, 107)}...` : flat;
}

function renderButton({ label, url }: MailCta): string {
  return `
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 4px;">
                <tr>
                  <td class="btn" bgcolor="${BRAND}" style="border-radius:999px;">
                    <a href="${escapeHtml(url)}" target="_blank" style="display:inline-block;padding:14px 28px;font-family:${FONT};font-size:16px;font-weight:600;line-height:1;color:#FFFFFF;text-decoration:none;border-radius:999px;">${escapeHtml(label)}&nbsp;&rarr;</a>
                  </td>
                </tr>
              </table>`;
}

export function renderAnnouncement(content: AnnouncementContent): RenderedMail {
  const { message, heading, cta, footnote = DEFAULT_FOOTNOTE } = content;
  const year = new Date().getFullYear();

  const body = paragraphs(message)
    .map(
      (p) =>
        `<p style="margin:0 0 16px;font-family:${FONT};font-size:16px;line-height:1.65;color:${INK};" class="ink">${escapeHtml(p).replace(/\n/g, "<br>")}</p>`,
    )
    .join("\n              ");

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light dark">
  <meta name="supported-color-schemes" content="light dark">
  <title>${escapeHtml(heading ?? "Sparkler")}</title>
  <style>
    @media (max-width: 620px) {
      .card-pad { padding: 28px 22px !important; }
      .heading { font-size: 24px !important; }
    }
    @media (prefers-color-scheme: dark) {
      .page { background-color: #0B0E14 !important; }
      .card { background-color: #161B24 !important; }
      .ink { color: #F3F4F6 !important; }
      .muted { color: #9CA3AF !important; }
    }
  </style>
</head>
<body class="page" style="margin:0;padding:0;background-color:${PAGE};">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all;">${escapeHtml(previewText(content))}</div>
  <table role="presentation" class="page" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${PAGE};">
    <tr>
      <td align="center" style="padding:32px 12px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;">
          <tr>
            <td style="padding:0 4px 20px;">
              <a href="${SITE}" target="_blank" style="font-family:${FONT};font-size:22px;font-weight:800;letter-spacing:-0.02em;color:${BRAND};text-decoration:none;">&#10022; Sparkler</a>
            </td>
          </tr>
          <tr>
            <td class="card" style="background-color:#FFFFFF;border-radius:20px;overflow:hidden;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td height="6" style="height:6px;line-height:6px;font-size:0;background-color:${BRAND};background-image:linear-gradient(90deg, ${BRAND}, ${BRAND_SOFT});">&nbsp;</td>
                </tr>
                <tr>
                  <td class="card-pad" style="padding:40px 40px 32px;">
              ${heading ? `<h1 class="heading ink" style="margin:0 0 20px;font-family:${FONT};font-size:28px;line-height:1.25;font-weight:800;letter-spacing:-0.02em;color:${INK};">${escapeHtml(heading)}</h1>` : ""}
              ${body}
              ${cta ? renderButton(cta) : ""}
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding:24px 16px 0;">
              <p class="muted" style="margin:0 0 6px;font-family:${FONT};font-size:13px;line-height:1.5;color:${MUTED};">${escapeHtml(footnote)}</p>
              <p class="muted" style="margin:0;font-family:${FONT};font-size:13px;line-height:1.5;color:${MUTED};">&copy; ${year} Sparkler &middot; <a href="${SITE}" target="_blank" style="color:${BRAND};text-decoration:none;">sparkler.website</a></p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const text = [
    heading ? `${heading}\n${"=".repeat(heading.length)}` : "",
    paragraphs(message).join("\n\n"),
    cta ? `${cta.label}: ${cta.url}` : "",
    `--\n${footnote}\nSparkler - ${SITE}`,
  ]
    .filter(Boolean)
    .join("\n\n");

  return { html, text };
}
