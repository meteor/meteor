# Mail Preview

- `Who maintains the package` – [Bertrand Dupont](https://github.com/dupontbertrand)

[[toc]]

## What Is It?

A zero-config, dev-mode mail preview UI for Meteor. Every email sent via `Email.sendAsync()` is captured and displayed in a browser UI at `/__meteor_mail__/`.

Inspired by similar features in Rails (Action Mailer Preview), Phoenix (Swoosh), Laravel (Mailtrap), and Django (console backend).

This is a `devOnly` package — it is **automatically excluded from production builds**. Zero overhead in production, no need to remove it before deploying.

## How to Download It?

```bash
meteor add dupontbertrand:mail-preview
```

That's it. No configuration needed.

## How to Use It?

1. Start your Meteor app in development mode (`meteor run`)
2. Trigger any email — password reset, verification, enrollment, or your own `Email.sendAsync()` calls
3. Open `http://localhost:3000/__meteor_mail__/` in your browser

### What You Get

- **Mail list** — live-updating list of all captured emails (polls every 2s, no page reload)
- **Mail detail** — view each email with tabs for **HTML render**, **Plain Text**, and **HTML Source**
- **Clickable links** — verification, password reset, and enrollment links work directly from the preview
- **JSON API** — programmatic access for testing and tooling
- **Clear all** — one-click button to clear captured mails

### Example: Capturing an Accounts Email

```js
// Server — nothing special needed, just use Meteor's built-in accounts
import { Accounts } from 'meteor/accounts-base';

// When a user registers, Meteor sends a verification email.
// mail-preview captures it automatically.
Accounts.sendVerificationEmail(userId);
```

Then open `/__meteor_mail__/` to see the captured email, click the verification link, and it works.

### Example: Custom Emails with MJML

```js
// Server
import { Email } from 'meteor/email';
import mjml2html from 'mjml';

const { html } = mjml2html(`
  <mjml>
    <mj-body>
      <mj-section>
        <mj-column>
          <mj-text font-size="20px" color="#333">Hello from Meteor!</mj-text>
          <mj-button background-color="#0d6efd" href="https://meteor.com">
            Visit Meteor
          </mj-button>
        </mj-column>
      </mj-section>
    </mj-body>
  </mjml>
`);

await Email.sendAsync({
  from: 'noreply@example.com',
  to: 'user@example.com',
  subject: 'Welcome!',
  html,
});
```

The MJML-rendered email is captured and displayed with full HTML rendering in the preview UI.

## JSON API

For programmatic access (useful in tests or tooling):

| Method   | Endpoint                       | Description              |
| -------- | ------------------------------ | ------------------------ |
| `GET`    | `/__meteor_mail__/api/mails`      | List all captured mails  |
| `GET`    | `/__meteor_mail__/api/mails/:id`  | Get a single mail        |
| `DELETE` | `/__meteor_mail__/api/mails`      | Clear all captured mails |

### Example: Using the API in Tests

```js
// In a test, after triggering an email:
const res = await fetch('http://localhost:3000/__meteor_mail__/api/mails');
const { mails } = await res.json();

assert.equal(mails[0].subject, 'Verify your email');
assert.ok(mails[0].text.includes('verify-email'));
```

## How It Works

The package uses `Email.hookSend()` to intercept outgoing emails and store them in memory (up to 50 — oldest are evicted). A middleware mounted via `WebApp.rawConnectHandlers` serves the preview UI.

- **Dev mode only** — guarded by `Meteor.isDevelopment` and `devOnly: true` in `package.js`
- **No SMTP needed** — emails are captured before they reach any transport
- **No external dependencies** — uses only Meteor core packages (`email`, `webapp`, `ecmascript`)
- **Works alongside `MAIL_URL`** — if set, emails are still sent normally; the hook captures a copy

## Compatibility

- Meteor 3.4+
- Works with `accounts-password` emails (verification, reset password, enrollment)
- Works with custom `Email.sendAsync()` / `Email.send()` calls
- Compatible with Rspack bundler

## Sources

- **Atmosphere:** [dupontbertrand:mail-preview](https://atmospherejs.com/dupontbertrand/mail-preview)
- **GitHub:** [dupontbertrand/meteor-mail-preview](https://github.com/dupontbertrand/meteor-mail-preview)
- **Forum Discussion:** [Built-in Mail Preview UI for Dev Mode](https://forums.meteor.com/t/built-in-mail-preview-ui-for-dev-mode/64489)
