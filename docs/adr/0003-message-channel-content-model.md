# ADR 0003 — In-app vs email content model for the Message Center

- **Status**: Accepted
- **Date**: 2026-06-23
- **Decision-makers**: rettX maintainers
- **Relates to**: [`specs/032-message-center/`](../../specs/032-message-center/spec.md)
  (rendering & content-snapshot requirements), [ADR 0001](0001-control-plane-repo.md)

## Context

The Message Center (spec 032) introduces **persistent in-app messages** alongside
the pre-existing **transactional email** channel. The same logical message (e.g.
"welcome") must now be presented in two very different surfaces: a caregiver's
in-app Message Center *and* an email inbox.

Email content is authored as per-locale templates in the **`templates`** content
repo, one folder per message type:

```
emails/welcome/
  en.html           ← rich, branded HTML email (has <style>, header, footer,
  en.subject.txt       unsubscribe, CTA buttons) — one per locale
  de.html
  de.subject.txt
  …                 ← ~24 locales
```

Under the new model, sending a message captures an **immutable content snapshot**
at send time (SC-008) with per-channel fields on the message record:

| Snapshot field | Feeds | Channel |
|---|---|---|
| `subject` | email subject | email |
| `email_html_body` | the styled HTML | **email** |
| `in_app_body` | the Message Center detail body | **in-app** |
| `preview` | a truncation of `in_app_body` | in-app list snippet |

The backend renderer (`rettxapi` `MessageRenderingServices.render`) resolves
`in_app_body` by precedence:

```
<locale>.inapp.txt   (dedicated in-app template)
   └─ else <locale>.text.txt   (plaintext email template)
        └─ else  html_to_text(<locale>.html)   (derive from the email HTML)
```

**Today, templates ship only `<locale>.html` + `<locale>.subject.txt`.** No
in-app or plaintext file exists, so `in_app_body` *always* falls through to the
HTML→text fallback. That converter strips `<tags>` but historically left the
inner text of `<style>`/`<script>` blocks behind, so the email stylesheet leaked
into the in-app body and list preview. Observed on the live welcome message:

> "Welcome to rettX, the European Rett Syndrome patient registry body {
> font-family: 'Chillax', 'Helvetica Neue', Helvetica, Arial, sans-serif; … }"

This exposed two separate questions: (1) a rendering **bug**, and (2) a
**strategic** question — should in-app and email content be the same copy in two
renderings, or intentionally diverge?

## Decision

Adopt a **hybrid channel-content model**:

1. **Default = auto-derive clean in-app text.** When a template has no dedicated
   in-app file, `in_app_body` is derived from the email template as **clean
   plaintext**. The HTML→text conversion MUST remove entire `<style>…</style>`
   and `<script>…</script>` blocks (including inner content) *before* stripping
   remaining tags. This is the v1 floor and requires no template authoring.

2. **Per-channel authoring on demand.** A template MAY add a dedicated in-app
   body file **`<locale>.inapp.txt`** (plaintext; markdown is a possible future
   enhancement). When present, the renderer uses it **verbatim** instead of
   deriving from the email HTML — letting in-app and email content **intentionally
   diverge** (in-app: short, no email chrome, app deep-links; email: full branded
   HTML).

3. **Authoring policy (the "hybrid" rule).** Author `<locale>.inapp.txt` **only
   where the email is a poor in-app fit** — heavy chrome, CTA buttons, or
   email-specific framing (e.g. `welcome`, `invitation_email`). Everything else
   relies on the clean auto-derived text. Adopt incrementally and revisit once
   the feature is live in production.

4. **Defense in depth on the leak.** Because content snapshots are immutable, the
   already-sent welcome message keeps its polluted `in_app_body`. The fix is
   therefore applied at **three** layers:
   - **Source** — the renderer strips `<style>`/`<script>` before tag-stripping
     (fixes all *new* messages).
   - **Read-time guard** — the API model sanitises `preview`/`body` on read
     (fixes *existing* snapshots without a data migration).
   - **Frontend** — `rettxweb` keeps its `cleanPreview`/`cleanBody` utilities as
     a belt-and-suspenders third layer.

5. **No API contract change.** Caregiver `body`/`preview` remain plaintext; the
   email channel is unchanged. The snapshot stays the single immutable record of
   what was actually sent.

### Channel content matrix

| Channel | Source (in precedence order) | Format | Authored where |
|---|---|---|---|
| Email | `<locale>.html` + `<locale>.subject.txt` | rich HTML | `templates` repo |
| In-app body | `<locale>.inapp.txt` → `<locale>.text.txt` → cleaned `html_to_text(<locale>.html)` | plaintext | `templates` repo / derived |
| In-app preview | truncation of `in_app_body` | plaintext | derived |

## Alternatives considered

### A. Auto-derive only — never author in-app templates

Rejected as the *sole* long-term answer. Email copy (unsubscribe footers, CTA
buttons, "view in browser") reads poorly in-app and cannot be tailored. Retained,
however, as the **default fallback** for templates that extract cleanly.

### B. Always author a dedicated in-app template for every type × locale

Rejected. ~11 message types × ~24 locales is a large, ongoing authoring burden
for low marginal value on simple messages whose email already extracts to fine
plaintext. Forcing it would slow every new message type.

### C. Hybrid — clean auto-derivation by default, dedicated in-app copy where it matters

**Chosen.** Gives a clean in-app experience immediately with zero authoring, and
an opt-in path to tailored in-app copy exactly where the email is a poor fit,
adopted incrementally.

## Consequences

### Positive

- In-app messages render clean plaintext immediately — the CSS leak is closed at
  three layers, covering both new and already-stored messages.
- In-app copy can be tailored per template/locale without touching the email
  channel or the API contract.
- The immutable snapshot (SC-008) remains the single source of truth for what was
  sent; audit/reproducibility is preserved.

### Negative

- For templates where `inapp.*` is authored, there are now **two** content
  sources to keep in sync (email vs in-app).
- Authors must understand the rendering precedence to predict which source wins.

### Neutral

- Existing templates need **no** change to benefit from the clean fallback.
- In-app divergence is strictly **opt-in** per template and per locale.

## Follow-ups

- **`rettxapi`** — ship the renderer source-clean + read-time guard bugfix PR
  (in flight): strip `<style>`/`<script>` before tag-stripping; cover new and
  existing snapshots; tests at both layers.
- **`rettxweb`** — retain the defensive `cleanPreview`/`cleanBody` utilities.
- **`templates`** — add `<locale>.inapp.txt` for `welcome` and `invitation_email`
  first (highest email chrome); document the `inapp.*` convention in the repo
  README and `deploy.ps1` packaging.
- **`patterns.md`** — channel-content convention + `inapp.*` naming recorded in §5.
- **`specs/032-message-center/`** — cross-link the rendering requirements to this
  ADR.
- Consider adding the `templates` content repo to `patterns.md` §1 (currently
  undocumented there).
