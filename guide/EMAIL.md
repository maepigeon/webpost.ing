# Email — verification, notifications, and password reset

Entirely optional, at two levels: a deployment can leave it switched off, and a
user with it available can decline to give an address. Nothing else in the app
depends on it.

---

## Turning it on

Set these in `deploy.env` (see [CONFIGURATION.md](CONFIGURATION.md)):

```bash
MAIL_ENABLED=true
MAIL_HOST=smtp.example.com
MAIL_PORT=587
MAIL_USERNAME=apikey
MAIL_PASSWORD=<secret>
MAIL_FROM=no-reply@webpost.ing

# Must be the URL a recipient can actually open — links in emails are built
# from it, so localhost here means unusable emails.
APP_BASE_URL=https://webpost.ing
```

Restart. Confirm with `GET /api/users/<you>/settings`, which reports
`mailEnabled`.

### With it off

The default. Nothing is sent and no SMTP connection is attempted — the message
that would have gone out is logged at DEBUG. Addresses can still be saved and
preferences changed; they simply take effect if mail is later switched on. The
settings page says so rather than offering a verification that cannot arrive.

This means the feature is safe to deploy before you have an SMTP provider.

---

## What gets sent

| Trigger | Category | Default |
|---|---|---|
| Someone sends you a direct message | `on_direct_message` | on |
| Someone follows you | `on_new_follower` | on |
| Someone you follow publishes a post | `on_followed_post` | on |
| Your own post goes live | `on_post_published` | **off** |
| You add or change your address | *(transactional)* | always |
| You request a password reset | *(transactional)* | always |

Notifications are gated on **four** conditions, all enforced in one place
(`EmailNotificationService.recipientFor`): mail is on for the deployment, the
user has an address, that address is **confirmed**, and their preferences allow
that category. Transactional mail — verification and reset — ignores
preferences, since suppressing it would break the flow the user just asked for.

Every notification carries a one-click unsubscribe link that works without
signing in. Transactional mail does not.

---

## Flows

### Confirming an address

1. `PUT /api/users/{u}/settings/email` stores the address, clears the verified
   flag, and emails a link.
2. The link opens `/verify-email?token=…`, which posts to `POST /api/email/verify`.
3. On success `email_verified` is set.

Changing the address always clears the flag — the new one has not been proven,
and leaving it set would let an account point at an address it does not control.
Confirmation is matched against the address the token was issued for, so a link
sent to a previous address cannot confirm a new one.

### Password reset

1. `POST /api/password/forgot` with an address. **The response is identical
   whether or not the address is registered** — otherwise this endpoint becomes
   a way to discover who has an account.
2. Only **confirmed** addresses get a link. Without that rule, anyone could put
   your address on their own account and use this to mail you reset links.
3. The link opens `/reset-password?token=…` → `POST /api/password/reset`.
4. On success the password is re-hashed with BCrypt and **every session for that
   account is ended** — whoever reset it may be locking an intruder out.

Reset links last 1 hour; confirmation links last 24.

### Unsubscribing

`POST /api/email/unsubscribe` with the token from the email footer. Public, and
can only ever turn things *off*. An unrecognised category falls back to the
master switch, erring towards sending less.

---

## Security notes

- **Only hashes are stored.** `email_tokens.token_hash` holds SHA-256 of the
  token; the plaintext exists just long enough to be put in an email. A leaked
  database yields no working links. SHA-256 rather than BCrypt is correct here
  because the token is 256 bits of `SecureRandom` output — there is nothing to
  brute-force, and lookups need an index.
- **Single use.** Redeeming marks the row used. Rows are kept afterwards so a
  replayed link reports "already used" rather than "unknown".
- **Purpose-bound.** A verification token cannot reset a password. Confirmation
  links are emailed far more freely, so without this they would be enough to
  take over an account.
- **Issuing supersedes.** A new token for the same user and purpose invalidates
  the previous unused one.
- **Rate limited.** Three verification and three reset requests per IP per 15
  minutes. An unthrottled endpoint that emails an arbitrary address is a spam
  relay.
- **Unsubscribe tokens are separate** — long-lived, because they must work in an
  email opened weeks later, and they only ever disable notifications.

---

## Sending is asynchronous

`EmailService.send` is `@Async` and never throws. An SMTP handshake can take
seconds, and no user action should wait on one: posting still succeeds when the
mail server is down, and the failure is logged rather than shown.

The consequence is that a send failure is invisible to the user. If mail is
important to you, watch the logs for `Could not send`.

---

## Schema

`V015__email_verification_and_preferences.sql`:

- `users.email_verified`, `email_verified_at`, `unsubscribe_token`
- `email_preferences` — one row per user, created lazily with defaults
- `email_tokens` — hashed single-use tokens for verification and reset

---

## Testing without an SMTP server

Leave `MAIL_ENABLED=false` and set `logging.level.com.springbootprojects=DEBUG`
to see what would have been sent. To exercise redemption without an inbox,
insert a token whose plaintext you know:

```bash
TOKEN=my-test-token
HASH=$(python3 -c "import hashlib,sys;print(hashlib.sha256(sys.argv[1].encode()).hexdigest())" "$TOKEN")
psql -c "INSERT INTO email_tokens(user_id,token_hash,purpose,email,expires_at)
         VALUES (1,'$HASH','verify_email','you@example.com',NOW()+INTERVAL '1 hour');"
curl -X POST localhost:8080/api/email/verify -H 'Content-Type: application/json' \
     -d "{\"token\":\"$TOKEN\"}"
```

For a full round trip, [MailHog](https://github.com/mailhog/MailHog) or
[Mailpit](https://github.com/axllent/mailpit) run a local SMTP server with a web
inbox: set `MAIL_ENABLED=true`, `MAIL_HOST=localhost`, `MAIL_PORT=1025`,
`MAIL_SMTP_AUTH=false`, `MAIL_SMTP_STARTTLS=false`.
