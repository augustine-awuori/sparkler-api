---
paths:
  - "src/routes/mails.ts"
  - "src/services/mail.ts"
  - "src/services/mailTemplate.ts"
  - "src/services/accountMail.ts"
  - "tests/contract/**/*.ts"
---

# Mail

- Announcement `message` content is plain text; blank lines separate paragraphs and the HTML template must escape it.
- Send bulk mail as one message per recipient through Resend's batch API. Never place multiple users in one `to` field.
- Use `POST /mails/preview` to inspect announcement mail before sending it.
- Automatic account mail goes through `sendInBackground`; it must not delay or fail the request. Add new account-mail builders in `src/services/accountMail.ts` and cover them with the mocked Resend outbox in the contract tests.
