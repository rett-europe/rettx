<!--
  Frontmatter below is machine-read by .github/workflows/spec-fanout.yml when
  this spec is merged into main. Fanout only runs when status is `ready` or
  `accepted` — while `draft` nothing fans out, so it is safe to review and
  iterate. Flip `status: ready` when agreed and you want squad issues opened
  on merge.
-->
---
spec_id: "042"
slug: "admin-app-shell"
title: "rettX Admin — gated login screen + config-driven left navigation shell"
status: ready   # draft | ready | accepted | superseded
authored: "2026-07-26"
author: "perocha"
source_issue: ""
relates_to: "specs/043-admin-rbac-mvp/"
fanout:
  - repo: rettxadmin
    summary: |
      OWNER and the ONLY affected repo. This is a UX/shell change to the
      Angular 18 standalone admin app; there is NO rettxapi or rettxid change.
      Keep the identity plane exactly as-is: admin/staff authenticate via
      **Microsoft Entra ID (Azure AD) using MSAL** (`@azure/msal-angular` v3 +
      `@azure/msal-browser`) with the **redirect** flow. Auth0 is the caregiver
      plane and is explicitly OUT OF SCOPE here — do not introduce Auth0 into
      rettxadmin.

      Deliver two things: (A) a dedicated gated login screen, and (B) a
      config-driven left sidenav that replaces the hardcoded top toolbar nav.

      (A) DEDICATED MSAL/ENTRA LOGIN SCREEN.
      Today there is NO login page: the app uses the home page plus login
      buttons in the top `mat-toolbar` (MSAL redirect). Add a real gate:
      - Unauthenticated users see ONLY a dedicated login screen (a clean,
        branded page with a single "Sign in with Microsoft" action that starts
        the existing MSAL redirect). No app chrome, no nav, no feature routes
        are reachable while unauthenticated.
      - Authenticated users see the full app shell (sidenav + routed content).
      - Preserve the current MSAL redirect posture and the existing
        `login-failed` route (`FailedComponent`) as the redirect failure target.
      - Keep `MsalGuard` doing AUTHENTICATION only — do not add authorization
        here (that is spec 043). The gate is: no MSAL account ⇒ login screen;
        MSAL account ⇒ shell.
      - Note the app is localhost-only today (no external exposure yet); this is
        the moment to add the proper gate before it is hosted, not after.

      (B) LEFT SIDENAV, CONFIG-DRIVEN, REPLACING THE TOP TOOLBAR.
      Today `app.component.html` hardcodes 8+ literal `<a mat-button>` links in a
      top `mat-toolbar`, English-only, no grouping, no icons, no
      `MatSidenavModule`. Replace this with a proper shell:
      - Introduce `MatSidenavModule` (+ `MatListModule`, `MatIconModule`): a
        LEFT sidenav for navigation and a slim top bar that keeps the account /
        sign-out control and the mobile hamburger toggle.
      - Drive the menu from a TYPED CONFIG DATA STRUCTURE, not template literals.
        Define a nav model, e.g.:
        `interface AdminNavItem { labelKey: string; icon: string; route?: string;
        children?: AdminNavItem[]; requiredRoles?: string[]; featureFlag?: string; }`
        and an `interface AdminNavGroup { labelKey: string; items: AdminNavItem[]; }`
        Render the sidenav by iterating this config so adding/reordering items is
        a data edit, not a template edit. Put the config in a dedicated file
        (e.g. `src/app/core/navigation/admin-nav.config.ts`) and a presentational
        `SidenavComponent` that consumes it.
      - GROUP the current ~19 routes into logical sections with Material Icons.
        The live route table (src/app/app.routes.ts on main) is the source of
        truth; map the navigable (non-detail, non-redirect, non-login) routes as:
          * Overview     → `data` (DataComponent)                      icon: dashboard
          * Patients     → `patients` (list; `patients/:id` is a detail,
                           reached from the list, not a top nav item)   icon: groups
          * Users & Access → `users` (UserSearchComponent)              icon: manage_accounts
          * Surveys      → `survey-command-center` (primary),
                           `surveys` (list; `surveys/:id` detail),
                           `survey-campaigns/add`, `survey-campaigns/:id`
                           (the bare `survey-campaigns` and `survey-assignments`
                           paths are redirects into the command center — do NOT
                           surface them as separate items);
                           `survey-command-center/assign/:campaignId` is a
                           workspace reached from within, not a top item   icon: assignment
          * Campaigns    → `email-campaigns` (list; `create`, `:campaignId`,
                           `:campaignId/edit` are sub-flows)             icon: campaign
          * Genetics     → `mecp2-distribution` (Mecp2DistributionComponent) icon: biotech
          * Pulse        → `pulse-catalog` (KEEP its existing
                           `pulseCatalogGuard` feature-flag gate; expose the item
                           via the config `featureFlag: 'pulseCatalog'` slot so it
                           only shows when the flag is on)               icon: monitoring
        `home` (`''`) is the shell landing/redirect target, and `login-failed`
        belongs to the login flow — neither is a sidenav item. Confirm the exact
        set against the real route table at implementation time and group
        faithfully; the grouping above is the intended shape, not a literal
        contract. If a route has been added/removed since this spec, fold it into
        the nearest group rather than leaving it un-navigable.
      - RESPONSIVE: persistent/`side` mode sidenav on desktop; `over` mode with a
        hamburger toggle on mobile (use `BreakpointObserver`). The sign-out /
        account control stays reachable in both.
      - I18N-READY: every label is a translation KEY (e.g. `nav.patients`,
        `nav.surveys`), resolved through the existing i18n mechanism. English is
        the only populated locale for now, but reserve the keys and route all nav
        text through translation so a later locale pass needs no structural change.
        (Admin i18n file naming follows patterns.md §5 — ISO 3166-1 country codes.)
      - ROLE-AWARE EXTENSION POINT ONLY: the nav item shape carries an OPTIONAL
        `requiredRoles?: string[]` field. Spec 042 DEFINES this slot but
        implements NO role logic — every item renders for every authenticated
        user for now. Spec 043 (Admin RBAC MVP) consumes `requiredRoles` to gate
        items. Do not read roles, filter items by role, or add a role guard in
        this spec; just make the field exist and be passed through untouched.

      ACCESSIBILITY: the shell must be keyboard-navigable, screen-reader labelled
      (landmark `nav`, `aria-current` on the active item), and honour reduced
      motion (Constitution Principle V, WCAG 2.2 AA). Predictable navigation is a
      first-class requirement, not polish.

      OUT OF SCOPE (do not do here): any Auth0 work; any authorization/role
      enforcement (spec 043); any rettxapi change; renaming routes or changing
      route paths; new features behind the nav.
---

# rettX Admin — gated login screen + config-driven left navigation shell

## Problem

`rettxadmin` is an Angular 18 standalone + Angular Material admin app that has
outgrown its initial shell. Two structural gaps:

1. **No real login gate.** There is no dedicated login page. Unauthenticated
   users land on the home page and sign in via login buttons in the top
   `mat-toolbar` (MSAL redirect). `MsalGuard` protects individual feature routes
   for authentication, but the app has no single, deliberate "you must sign in"
   surface. The app is localhost-only today, so this has been tolerable — but it
   must be fixed **before** the app is exposed, not after.
2. **Hardcoded, flat navigation.** Navigation is 8+ literal `<a mat-button>`
   links baked into a top `mat-toolbar` in `app.component.html`. There is no
   `MatSidenavModule`, no config-driven menu, no grouping, no icons, and no
   i18n on nav labels. With ~19 feature routes this no longer scales, and there
   is nowhere clean for role-based gating (spec 043) to hook in.

This spec modernises the admin **shell** — a gated login screen plus a
config-driven left sidenav — without touching the backend or the identity plane.

## Identity plane (unchanged)

Admin/staff authenticate via **Microsoft Entra ID (Azure AD) with MSAL**
(`@azure/msal-angular` v3, redirect flow). This is deliberate and stays:
`rettxapi` admin endpoints trust **Entra tokens only**. **Auth0 is the caregiver
plane and is explicitly out of scope for the admin app** — see
[patterns.md §4](../../.specify/memory/patterns.md) and
[ADR 0012](../../docs/adr/0012-admin-rbac-entra-app-roles.md). This spec keeps
MSAL/Entra end to end.

## Goals

1. A **dedicated, gated MSAL login screen**: unauthenticated ⇒ login screen only;
   authenticated ⇒ full app shell. Redirect posture preserved; `login-failed`
   retained as the failure target.
2. A **left sidenav** (`MatSidenavModule`) replacing the top-toolbar nav, driven
   by a **typed config data structure** (not template literals), organised into
   logical **groups** with **Material Icons**.
3. **Responsive** behaviour: persistent on desktop, collapsible/hamburger on
   mobile.
4. **i18n-ready** labels: every nav string is a translation key, reserved now
   even though only English is populated.
5. A **role-aware extension point**: an optional `requiredRoles` field on each
   nav item, defined here and consumed later by spec 043. No role logic ships in
   this spec.

## Non-goals

- No authorization / role enforcement — that is [spec 043](../043-admin-rbac-mvp/spec.md).
- No Auth0 in the admin app; no change to the Entra-only admin trust.
- No `rettxapi` or `rettxid` change.
- No route renames or new features; this is purely the shell.

## Nav model (the config-driven menu)

The menu is data, not markup. Proposed shape (final names at implementation
time):

```ts
interface AdminNavItem {
  labelKey: string;        // i18n key, e.g. 'nav.patients'
  icon: string;            // Material icon name
  route?: string;          // Angular route; absent for pure group headers
  children?: AdminNavItem[];
  requiredRoles?: string[]; // EXTENSION POINT for spec 043 — unused here
  featureFlag?: string;    // e.g. 'pulseCatalog' — hides item when flag off
}

interface AdminNavGroup {
  labelKey: string;
  items: AdminNavItem[];
}
```

A presentational `SidenavComponent` iterates `AdminNavGroup[]` from a dedicated
config file. Adding, reordering, grouping, or (later) role-gating an item is a
data edit.

> **Consistency note (RBAC).** For the MVP, the `requiredRoles` slot stays a
> **coarse role-based** nav gate consumed by
> [spec 043](../043-admin-rbac-mvp/spec.md). Spec 043 makes the granular
> capabilities that `admin`/`read_only` grant **super_admin-configurable**;
> finer nav gating **may** later consult those configured capabilities, but this
> shell keeps the simple `requiredRoles` gate and the **API remains the true
> authorization boundary** regardless of what the nav shows.

## Proposed grouping of the current routes

Grounded in the live `src/app/app.routes.ts` (main). Detail routes
(`patients/:id`, `surveys/:id`, campaign sub-flows), redirect stubs
(`survey-campaigns`, `survey-assignments`), the `home` landing, and
`login-failed` are **not** sidenav items.

| Group | Nav item(s) → route | Icon |
|---|---|---|
| Overview | `data` | `dashboard` |
| Patients | `patients` (list) | `groups` |
| Users & Access | `users` | `manage_accounts` |
| Surveys | `survey-command-center`, `surveys`, `survey-campaigns/add` | `assignment` |
| Campaigns | `email-campaigns` | `campaign` |
| Genetics | `mecp2-distribution` | `biotech` |
| Pulse | `pulse-catalog` (feature-flag gated) | `monitoring` |

`pulse-catalog` keeps its existing `pulseCatalogGuard` feature-flag gate and is
surfaced through the config `featureFlag: 'pulseCatalog'` slot (hidden when the
flag is off). Confirm the exact route set at implementation time and fold any
newly added route into the nearest group.

## Login screen

- Unauthenticated: a single dedicated, branded screen with one
  "Sign in with Microsoft" action that starts the existing MSAL redirect. No
  sidenav, no feature chrome.
- Authenticated: the full shell (sidenav + routed content).
- `login-failed` (`FailedComponent`) remains the redirect failure target.
- `MsalGuard` stays authentication-only; no authorization added here.

## Responsive & accessibility

- Desktop: persistent (`side`) sidenav. Mobile: `over` mode with a hamburger
  toggle (`BreakpointObserver`). Account / sign-out reachable in both.
- Keyboard-navigable; `nav` landmark; `aria-current` on the active item;
  respects reduced motion. Target **WCAG 2.2 AA** (Constitution Principle V).

## Constitution Check

- **Principle V (Accessibility & inclusion):** the shell targets WCAG 2.2 AA,
  keyboard and screen-reader support, predictable navigation, and reduced-motion
  respect; nav labels are i18n keys so the admin surface can be localised.
- **Principle VI (Security baseline):** the login gate strengthens the
  authentication boundary before the app is exposed; MSAL/Entra and short-lived
  tokens are unchanged. This spec adds **no** authorization — it only reserves
  the `requiredRoles` extension point; server-side enforcement remains the
  security control (delivered in spec 043), never the client shell.
- **Patterns §4 (Authentication & authorization):** admin stays on Microsoft
  Entra ID (MSAL); Auth0 is not introduced into the admin plane.
- **Patterns §5 (Internationalization):** nav text routes through translation
  keys (admin i18n uses ISO 3166-1 country-code file names).

## Acceptance criteria

- [ ] Unauthenticated users see ONLY a dedicated MSAL login screen; no sidenav
      or feature route is reachable until an MSAL account exists.
- [ ] "Sign in with Microsoft" starts the existing MSAL redirect; `login-failed`
      remains the failure target; Auth0 is not present in the admin app.
- [ ] The top-toolbar nav is replaced by a LEFT `MatSidenavModule` sidenav.
- [ ] The menu is rendered from a TYPED CONFIG structure (`AdminNavGroup[]` /
      `AdminNavItem`), not from hardcoded template links.
- [ ] Items are grouped into logical sections with Material Icons, covering the
      current navigable routes (Overview, Patients, Users & Access, Surveys,
      Campaigns, Genetics, Pulse).
- [ ] `pulse-catalog` shows only when its feature flag is on (existing behaviour
      preserved via the config `featureFlag` slot).
- [ ] The sidenav is persistent on desktop and collapsible/hamburger on mobile;
      account/sign-out reachable in both.
- [ ] Every nav label is an i18n translation key (English populated).
- [ ] Each nav item supports an OPTIONAL `requiredRoles` field that is defined
      and passed through but not yet acted on (no role filtering in this spec).
- [ ] Shell is keyboard-navigable and screen-reader labelled (`nav` landmark,
      `aria-current`), honouring reduced motion.
- [ ] No rettxapi / rettxid change; no route renames; no Auth0.

## Open questions

- **Overview naming:** `DataComponent` at `/data` is surfaced as "Overview" —
  confirm the intended label/role of this page (dashboard vs. a specific data
  view) and rename the key if needed.
- **Group ordering & collapse:** should groups be collapsible accordions, or a
  flat grouped list? (Recommend flat grouped list for the MVP; revisit if the
  route count grows.)
- **Deep-link on unauth:** when an unauthenticated user hits a deep link, do we
  round-trip them back to the target after MSAL login, or land on Overview?
  (Recommend: preserve and return to the requested route.)

## Relationships

- Pairs with **[spec 043 — Admin RBAC MVP](../043-admin-rbac-mvp/spec.md)**,
  which consumes the `requiredRoles` extension point defined here.
- Aligns with **[ADR 0012 — Admin RBAC via Entra App Roles](../../docs/adr/0012-admin-rbac-entra-app-roles.md)**
  (admin stays on Entra).
- Conventions: **[patterns.md §4](../../.specify/memory/patterns.md)** (auth),
  **§5** (i18n).
