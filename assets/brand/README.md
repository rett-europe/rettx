# rettX brand assets

This directory holds the canonical rettX brand assets used in this
repository's README and on the engineering docs site at
`docs.rettx.eu`.

The master brand kit lives in the Rett Syndrome Europe SharePoint
(`General/Branding/rettX/`). The files here are a pinned snapshot — if
the master kit changes, please update these too.

## Logo files

| File | Use |
|---|---|
| `rettx-logo.svg` | Primary wordmark on light backgrounds. |
| `rettx-logo-dark.svg` | Primary wordmark on dark backgrounds (white text + pink-magenta gradient). |
| `rettx-logo-tagline.svg` | Wordmark with the tagline _"Unveiling hope for Rett Syndrome"_ — light backgrounds. |
| `rettx-logo-tagline-dark.svg` | Same with tagline — dark backgrounds. |

The wordmark stylises the **X** as a DNA double helix in a
pink-to-magenta gradient — a deliberate visual reference to the
genetic basis of Rett Syndrome.

## Colour palette

Source: `AdobeColor-rettX` (master in `rettxweb` repo).

| Token | Hex | RGB | Use |
|---|---|---|---|
| `--rettx-pink` | `#ED3385` | 237, 51, 133 | Primary accent — links, calls to action, gradient endpoint |
| `--rettx-purple` | `#8B4EA6` | 139, 78, 166 | Primary brand colour — wordmark, headings |
| `--rettx-purple-deep` | `#914DAA` | 145, 77, 170 | Deeper purple used in the wordmark glyphs |
| `--rettx-indigo` | `#4E4BBF` | 78, 75, 191 | Secondary accent |
| `--rettx-blue` | `#435BD0` | 67, 91, 208 | Tertiary accent |
| `--rettx-grey` | `#F2F2F2` | 242, 242, 242 | Neutral background |

The signature gradient runs from `#E87CD9` (light pink) through
`#E967C1` and `#ED3385` to `#EE2A7B` (deep magenta) — see the DNA
helix in `rettx-logo.svg`.

## Usage rules

- **Do** use the light or dark variant appropriate to the background.
- **Do** keep clear space around the wordmark equivalent to the
  height of the lowercase `e`.
- **Don't** recolour the wordmark or the gradient.
- **Don't** stretch, rotate, or apply effects to the wordmark.
- **Don't** combine the wordmark with another logo without leaving
  clear space and using a separator.

## Programmatic use

Astro Starlight (`site/`) consumes the colours from
`assets/brand/colors.css`. Update the CSS variables there to roll a
palette change through the site without touching components.
