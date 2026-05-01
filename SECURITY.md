# Security policy

## Reporting a vulnerability

**Please do not open a public GitHub issue, discussion, or pull
request to report a suspected security vulnerability** in any part of
the rettX ecosystem.

Instead, report it privately through GitHub's coordinated disclosure
flow:

> **<https://github.com/rett-europe/rettx/security/advisories/new>**

This opens a private security advisory visible only to you and the
rettX maintainers. If the issue affects another repository in the
ecosystem (`rettxweb`, `rettxadmin`, `rettxapi`, `rettxmutation`,
`rettxid`), you can either file the advisory in this repository (we
will route it) or directly in the affected one.

If you cannot use GitHub Security Advisories, email the maintainers at
**security@rettx.eu** with as much detail as you can share. PGP is not
required, but encrypted reports are welcome — request a key.

## What to include

To help us triage quickly, please include where possible:

- A short description of the issue and its impact.
- The repository, file, endpoint, or surface affected (e.g.
  `rettxapi`, the caregiver app, the docs site).
- Steps to reproduce, or a proof of concept.
- Any known mitigations or workarounds.
- Whether the issue involves real or simulated data. **Please do not
  attach real patient data, identifiable health information, or
  production secrets to your report.** A redacted or synthetic example
  is sufficient.

## Scope

The following are in scope for this disclosure process:

- All code in this repository (`rett-europe/rettx`).
- All code and infrastructure in the other rettX repositories:
  `rettxweb`, `rettxadmin`, `rettxapi`, `rettxmutation`, `rettxid`.
- The deployed surfaces: <https://app.rettx.eu>,
  <https://docs.rettx.eu>, and the rettX API.
- The Iris automation (GitHub App and workflows in `.github/`).

The following are **out of scope** here:

- Vulnerabilities in third-party dependencies that are not exploitable
  in a rettX deployment — please report those upstream.
- The WordPress site at <https://www.rettx.eu>. Issues affecting that
  site should be reported to Rett Syndrome Europe through their
  contact channels.
- Social engineering, physical security, or attacks against Rett
  Syndrome Europe staff or partners.

## What to expect

We aim to:

- **Acknowledge** your report within **5 working days**.
- **Triage and assess** within **10 working days** of the
  acknowledgement.
- Keep you informed as the fix progresses.
- Coordinate disclosure with you. We prefer to publish a public
  advisory once a fix is available and deployed, and we will credit
  you (with your consent) in the advisory.

We do not currently operate a paid bug-bounty programme, but we
greatly appreciate responsible disclosure and will recognise reporters
in our advisories.

## Patient data and privacy

rettX handles sensitive health information. If you encounter what
appears to be exposed patient data while testing or using rettX
surfaces:

1. **Stop** the activity that exposed it.
2. **Do not** download, share, or further enumerate the data.
3. Report it through the channels above as a high-severity issue.

We treat any exposure of identifiable patient information as a
critical incident.

## Safe-harbour for good-faith research

We will not pursue civil or criminal action against researchers who:

- Make a good-faith effort to follow this policy.
- Avoid privacy violations, destruction of data, and disruption of
  services.
- Give us reasonable time to remediate before public disclosure.
- Do not exploit the issue beyond what is necessary to demonstrate it.

If in doubt about whether a planned activity falls under this
safe-harbour, contact us at **security@rettx.eu** before you start.
