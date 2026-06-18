# bwrecycling

## Secure SMTP Contact Form Setup

The backend sends contact form submissions using SMTP with hardened defaults:

- TLS required (`requireTLS: true`)
- Minimum TLS version set to `TLSv1.2`
- Certificate validation enabled by default
- File and URL access disabled in Nodemailer transport
- Basic request rate limiting on the contact endpoint
- Honeypot trap support (`website` field)
- CSRF token protection using a cookie + request header match
- Origin/referrer allowlist checks for form submissions
- Additional response hardening headers (`X-Frame-Options`, `X-Content-Type-Options`, etc.)

### Required Environment Variables

Configure these values in your `.env` file:

- `PORT`
- `SMTP_HOST`
- `SMTP_PORT` (usually `465` for SMTPS or `587` for STARTTLS)
- `SMTP_SECURE` (`true` for SMTPS on port 465)
- `SMTP_USER`
- `SMTP_PASS`
- `SMTP_FROM`
- `CONTACT_FORM_TO`
- `SMTP_REJECT_UNAUTHORIZED` (optional, defaults to `true`)
- `SMTP_TLS_SERVERNAME` (optional)
- `ALLOWED_ORIGINS` (optional, comma-separated list; defaults include production + localhost)
- `REQUIRE_ORIGIN_CHECK` (optional, defaults to `true`)
- `CSRF_COOKIE_SECURE` (optional, force `Secure` cookie flag)
- `TRUST_PROXY` (optional, set to `true` when running behind a reverse proxy)

If SMTP variables are missing, the server will still run but the form endpoint will return `503` until SMTP is configured.

### CSRF Handshake

1. Frontend requests `GET /api/csrf-token`
2. Server returns JSON token and sets a matching HTTP-only cookie
3. Frontend sends token in `X-CSRF-Token` header on `POST /submit-form`
4. Server validates header token against cookie token with timing-safe comparison
