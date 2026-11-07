// The HTML frame shared by the emails the accounts packages send: the site
// name or logo on top, a card with the content, a footer. Tables and inline
// styles are what mail clients render reliably; dark mode comes from a single
// prefers-color-scheme block.

const FONT =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

export const DEFAULT_EMAIL_ACCENT_COLOR = '#de4f4f';

const HTML_ESCAPES = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

export const escapeHtml = value =>
  String(value ?? '').replace(/[&<>"']/g, char => HTML_ESCAPES[char]);

export const emailGreeting = user => {
  const name = user?.profile?.name || user?.username;
  return name ? `Hello ${name},` : 'Hello,';
};

const DURATION_UNITS = [
  ['day', 86400000],
  ['hour', 3600000],
  ['minute', 60000],
];

// "3 days", "1 hour", "90 minutes": the largest unit that divides the duration.
export const formatDuration = milliseconds => {
  const [unit, size] =
    DURATION_UNITS.find(
      ([, unitSize]) => milliseconds >= unitSize && milliseconds % unitSize === 0
    ) || DURATION_UNITS[DURATION_UNITS.length - 1];
  const count = Math.max(1, Math.round(milliseconds / size));
  return `${count} ${unit}${count === 1 ? '' : 's'}`;
};

const DARK_MODE_STYLE = `
  @media (prefers-color-scheme: dark) {
    .mc-body { background: #0f1115 !important; }
    .mc-card { background: #181b22 !important; border-color: #2a2f3a !important; }
    .mc-brand, .mc-heading, .mc-text { color: #e6e8ee !important; }
    .mc-muted, .mc-url a { color: #9aa3b2 !important; }
    .mc-code { background: #0f1115 !important; border-color: #2a2f3a !important; color: #e6e8ee !important; }
  }`;

const paragraph = (content, className, style) =>
  content
    ? `<p class="${className}" style="margin:0 0 12px;font-family:${FONT};${style}">${content}</p>`
    : '';

const TEXT_STYLE = 'font-size:16px;line-height:1.55;color:#374151;';
const MUTED_STYLE = 'font-size:13px;line-height:1.5;color:#6b7280;';

/**
 * @summary Renders the frame used by the default Accounts emails around the given content. Every option is optional; strings are HTML-escaped, except `body`.
 * @locus Server
 * @param {Object} options
 * @param {Object} options.user Greets the user by `profile.name`, then `username`.
 * @param {String} options.greeting Replaces the greeting computed from `user`.
 * @param {String} options.heading Title of the card.
 * @param {String} options.intro Paragraph under the greeting.
 * @param {String} options.code A one-time code, shown in a monospace box.
 * @param {String} options.buttonLabel With `url`, renders a button in the accent color.
 * @param {String} options.url Also printed in clear so it can be copied.
 * @param {Number} options.expiresIn Lifetime of the link or code in milliseconds, written as "This link expires in 3 days."
 * @param {String} options.outro Closing paragraph, for the "ignore this email" note.
 * @param {String} options.footer Text under the card. Defaults to "Sent by siteName".
 * @param {String} options.body Raw HTML that replaces everything inside the card.
 * @returns {String} A complete HTML document.
 * @importFromPackage accounts-base
 */
export function renderEmailLayout(options = {}, templates = {}) {
  const {
    user,
    greeting = emailGreeting(user),
    heading,
    intro,
    code,
    buttonLabel,
    url,
    expiresIn,
    outro,
    footer = templates.siteName ? `Sent by ${templates.siteName}` : '',
    body,
  } = options;
  const siteName = escapeHtml(templates.siteName);
  const accentColor = templates.accentColor || DEFAULT_EMAIL_ACCENT_COLOR;
  const brand = templates.logoUrl
    ? `<img src="${escapeHtml(templates.logoUrl)}" alt="${siteName}" height="28" style="display:block;height:28px;border:0;">`
    : siteName;
  const safeUrl = escapeHtml(url);
  const expiry = expiresIn
    ? `This ${code ? 'code' : 'link'} expires in ${formatDuration(expiresIn)}.`
    : '';

  const content =
    body ??
    [
      heading
        ? `<h1 class="mc-heading" style="margin:0 0 18px;font-family:${FONT};font-size:22px;line-height:1.3;font-weight:700;color:#111827;">${escapeHtml(heading)}</h1>`
        : '',
      paragraph(escapeHtml(greeting), 'mc-text', TEXT_STYLE),
      paragraph(escapeHtml(intro), 'mc-text', TEXT_STYLE),
      code
        ? `<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:8px 0 20px;"><tr><td class="mc-code" style="font-family:SFMono-Regular,Menlo,Consolas,monospace;font-size:28px;letter-spacing:6px;font-weight:600;color:#111827;background:#f3f4f6;border:1px solid #e5e7eb;border-radius:8px;padding:14px 20px;">${escapeHtml(code)}</td></tr></table>`
        : '',
      url && buttonLabel
        ? `<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:20px 0 24px;"><tr><td style="border-radius:8px;background:${escapeHtml(accentColor)};"><a href="${safeUrl}" style="display:inline-block;padding:12px 24px;font-family:${FONT};font-size:16px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:8px;">${escapeHtml(buttonLabel)}</a></td></tr></table>`
        : '',
      url
        ? paragraph(
            buttonLabel
              ? 'If the button does not work, copy this link into your browser:'
              : 'Open this link in your browser:',
            'mc-muted',
            `${MUTED_STYLE}margin-bottom:6px;`
          ) +
          `<p class="mc-url" style="margin:0 0 20px;font-family:${FONT};font-size:13px;line-height:1.5;word-break:break-all;"><a href="${safeUrl}" style="color:#6b7280;">${safeUrl}</a></p>`
        : '',
      paragraph(escapeHtml(expiry), 'mc-muted', MUTED_STYLE),
      paragraph(escapeHtml(outro), 'mc-muted', `${MUTED_STYLE}margin-bottom:0;`),
    ].join('\n');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<title>${escapeHtml(heading || templates.siteName)}</title>
<style>${DARK_MODE_STYLE}
</style>
</head>
<body class="mc-body" style="margin:0;padding:0;background:#f3f4f6;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" class="mc-body" style="background:#f3f4f6;">
<tr><td align="center" style="padding:32px 16px;">
  <table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" style="max-width:600px;width:100%;">
    <tr><td class="mc-brand" style="padding:0 4px 14px;font-family:${FONT};font-size:17px;font-weight:700;color:#111827;">${brand}</td></tr>
    <tr><td class="mc-card" style="background:#ffffff;border:1px solid #e5e7eb;border-radius:12px;padding:32px;">
${content}
    </td></tr>
    <tr><td class="mc-muted" style="padding:16px 8px 0;font-family:${FONT};font-size:12px;line-height:1.5;color:#9ca3af;text-align:center;">${escapeHtml(footer)}</td></tr>
  </table>
</td></tr>
</table>
</body>
</html>
`;
}
