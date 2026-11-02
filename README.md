# Endure Dialer — developer starter v0.1

A provider-neutral, locally runnable dashboard starter. It includes contact CSV import, consent/DNC flags, campaign draft creation, agent-script settings, and an API scaffold. **Live dialing is deliberately disabled.** The app does not place calls or play voicemail in this version.

## Requirements
- Node.js 20 or newer

## Run locally
```bash
cd endure-dialer
cp .env.example .env
npm start
```
Open http://localhost:3000.

## CSV format
Recommended columns: `name,phone,consent,do_not_call`
- Phone numbers must be E.164, e.g. `+12125550123`.
- `consent` is true only for `yes`, `true`, `1`, or `granted`.
- `do_not_call` is true for `yes`, `true`, or `1`.
- Missing consent defaults to false. Keep the evidence, timestamp, source, purpose and scope of consent in your production database; this starter only stores the basic flag.

## Provider integration plan
Choose a carrier/SIP trunk that supports the required signaling, media, caller-ID and authentication capabilities. For direct OpenAI SIP calling, current OpenAI documentation describes TLS signaling, SRTP media, Opus, a `sips:` provider URL, SIP Digest credentials, and E.164 destinations. Check whether outbound SIP is enabled for your OpenAI organization before implementation.

1. Add provider credentials to server-side environment variables or a secrets manager. Never put credentials in browser JavaScript or commit `.env`.
2. Implement a dedicated `src/providers/<carrier>.js` adapter based on the carrier's official API/SIP documentation.
3. Implement authenticated call creation, status webhooks, hangup/transfer, idempotency, event deduplication, and call logging.
4. Implement OpenAI Live session creation and sideband event handling on the server.
5. Keep `LIVE_CALLING_ENABLED=false` until test calls, consent checks, disclosures, opt-out handling, DNC screening, quiet hours, caller ID authorization, emergency handling, and applicable legal/carrier requirements are reviewed.
6. Enable live calling only after a controlled test and independent compliance review.

## Current API
- `GET /api/health`
- `GET /api/dashboard`
- `GET /api/provider/status`
- `GET /api/contacts`
- `POST /api/contacts/import`
- `PATCH /api/contacts/:id`
- `GET /api/campaigns`
- `POST /api/campaigns`
- `GET /api/calls`
- `GET /api/settings`, `PUT /api/settings`
- `POST /api/calls/start` returns HTTP 501 intentionally until the provider adapter is implemented.

## Important production gaps
This is a development starter, not production-ready SaaS. Before internet deployment add real authentication, authorization, tenant isolation, persistent production database, CSRF/rate limiting, audit logs, encryption, secure secret storage, retention/deletion controls, validated consent evidence, DNC list synchronization, and monitoring. Do not expose this development server to the public internet as-is.
