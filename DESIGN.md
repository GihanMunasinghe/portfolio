---
name: Gihan Munasinghe
description: The site of a software engineer, consultant and educator, designed as a paperback series in which every page is a volume.
colors:
  # the series: flat print colour fields (light theme values)
  series-blue: "#2346a6"
  series-orange: "#ee6a1f"
  series-green: "#0f6b47"
  series-red: "#c41f45"
  orange-text: "#b04a10"
  # paper and ink (light)
  paper: "#f3f5f7"
  paper-2: "#e5e8ed"
  paper-3: "#d6dbe2"
  ink: "#14161b"
  ink-2: "#474c56"
  ink-3: "#5c626d"
  rule: "rgba(20, 22, 27, 0.16)"
  rule-strong: "rgba(20, 22, 27, 0.72)"
  on-dark-band: "#f3f5f7"
  on-light-band: "#14161b"
  scrim: "rgba(10, 12, 18, 0.62)"
  ok: "#0f6b47"
  danger: "#b3261e"
  # dark theme
  series-blue-dark: "#2a4fb5"
  blue-text-dark: "#8eaaff"
  orange-text-dark: "#ff9b5e"
  green-text-dark: "#5fd3a0"
  red-text-dark: "#ff7d97"
  paper-dark: "#111318"
  paper-2-dark: "#191c22"
  paper-3-dark: "#23272f"
  ink-dark: "#eceef2"
  ink-2-dark: "#b4b8c0"
  ink-3-dark: "#959ba6"
  rule-dark: "rgba(236, 238, 242, 0.15)"
  rule-strong-dark: "rgba(236, 238, 242, 0.7)"
  on-dark-band-dark: "#eef1f5"
  on-light-band-dark: "#111318"
  plank-dark: "#2c313a"
  ok-dark: "#5fd3a0"
  danger-dark: "#ff8a80"
typography:
  display:
    fontFamily: "Archivo, 'Helvetica Neue', Arial, system-ui, sans-serif"
    fontSize: "clamp(3rem, min(6.6vw, 10.5vh), 6rem)"
    fontWeight: 820
    lineHeight: 0.9
    letterSpacing: "-0.035em"
    fontVariation: "'wdth' 114"
  display-volume:
    fontFamily: "Archivo, 'Helvetica Neue', Arial, system-ui, sans-serif"
    fontSize: "clamp(2.45rem, 5.3vw, 4.6rem)"
    fontWeight: 820
    lineHeight: 0.95
    letterSpacing: "-0.032em"
    fontVariation: "'wdth' 112"
  headline:
    fontFamily: "Archivo, 'Helvetica Neue', Arial, system-ui, sans-serif"
    fontSize: "clamp(2rem, 4.2vw, 3.25rem)"
    fontWeight: 780
    lineHeight: 1.02
    letterSpacing: "-0.02em"
    fontVariation: "'wdth' 104"
  title:
    fontFamily: "Archivo, 'Helvetica Neue', Arial, system-ui, sans-serif"
    fontSize: "clamp(1.2rem, 1.8vw, 1.45rem)"
    fontWeight: 680
    lineHeight: 1.2
    letterSpacing: "-0.01em"
  body:
    fontFamily: "Archivo, 'Helvetica Neue', Arial, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.55
  lede:
    fontFamily: "Literata, 'Iowan Old Style', Georgia, 'Noto Serif', serif"
    fontSize: "clamp(1.08rem, 1.4vw, 1.22rem)"
    fontWeight: 400
    lineHeight: 1.6
  prose:
    fontFamily: "Literata, 'Iowan Old Style', Georgia, 'Noto Serif', serif"
    fontSize: "1.0625rem"
    fontWeight: 400
    lineHeight: 1.72
  reading:
    fontFamily: "Literata, 'Iowan Old Style', Georgia, 'Noto Serif', serif"
    fontSize: "1.125rem"
    fontWeight: 400
    lineHeight: 1.75
  button:
    fontFamily: "Archivo, 'Helvetica Neue', Arial, system-ui, sans-serif"
    fontSize: "0.98rem"
    fontWeight: 650
    lineHeight: 1.1
  nav:
    fontFamily: "Archivo, 'Helvetica Neue', Arial, system-ui, sans-serif"
    fontSize: "0.95rem"
    fontWeight: 560
  label:
    fontFamily: "Archivo, 'Helvetica Neue', Arial, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 650
  meta:
    fontFamily: "Archivo, 'Helvetica Neue', Arial, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    fontFeature: "'tnum'"
  spine:
    fontFamily: "Archivo, 'Helvetica Neue', Arial, system-ui, sans-serif"
    fontSize: "0.9rem"
    fontWeight: 720
    lineHeight: 1.06
    letterSpacing: "0.005em"
    fontVariation: "'wdth' 64"
  mark:
    fontFamily: "Archivo, 'Helvetica Neue', Arial, system-ui, sans-serif"
    fontSize: "0.95rem"
    fontWeight: 800
    lineHeight: 1
    letterSpacing: "-0.01em"
    fontVariation: "'wdth' 100"
  mono:
    fontFamily: "ui-monospace, 'SF Mono', Menlo, Consolas, monospace"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.65
rounded:
  none: "0px"
  r: "2px"
  roundel: "50%"
spacing:
  gutter: "clamp(16px, 4vw, 40px)"
  section: "clamp(4.5rem, 9vw, 8rem)"
  wrap: "1240px"
  read-col: "43rem"
  nav-h: "64px"
  nav-h-compact: "58px"
  spine-w: "58px"
components:
  button-primary:
    backgroundColor: "{colors.series-blue}"
    textColor: "{colors.on-dark-band}"
    typography: "{typography.button}"
    rounded: "{rounded.r}"
    padding: "0.75rem 1.3rem"
    height: "48px"
  button-primary-hover:
    backgroundColor: "color-mix(in oklab, #2346a6 84%, #000)"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    typography: "{typography.button}"
    rounded: "{rounded.r}"
    padding: "0.75rem 1.3rem"
    height: "48px"
  button-ghost-hover:
    backgroundColor: "{colors.paper-2}"
  button-sm:
    padding: "0.5rem 0.95rem"
    height: "40px"
  button-paper:
    backgroundColor: "{colors.on-dark-band}"
    textColor: "{colors.series-blue}"
    typography: "{typography.button}"
    rounded: "{rounded.r}"
    padding: "0.5rem 1rem"
    height: "40px"
  button-outline-band:
    backgroundColor: "transparent"
    textColor: "{colors.on-dark-band}"
    typography: "{typography.button}"
    rounded: "{rounded.r}"
    padding: "0.75rem 1.3rem"
    height: "48px"
  input:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.r}"
    padding: "0.7rem 0.9rem"
    height: "48px"
  masthead:
    backgroundColor: "{colors.series-blue}"
    textColor: "{colors.on-dark-band}"
    typography: "{typography.nav}"
    height: "64px"
  tab:
    textColor: "{colors.ink-3}"
    typography: "{typography.nav}"
    padding: "0.7rem 0"
  tab-active:
    textColor: "{colors.ink}"
  tag:
    backgroundColor: "{colors.series-blue}"
    textColor: "{colors.on-dark-band}"
    rounded: "{rounded.r}"
    padding: "0.12rem 0.5rem"
  roundel:
    typography: "{typography.mark}"
    rounded: "{rounded.roundel}"
    padding: "0 0.85em"
    height: "2.3em"
  band:
    backgroundColor: "{colors.series-blue}"
    textColor: "{colors.on-dark-band}"
    padding: "clamp(4.5rem, 9vw, 8rem) 0"
  spine:
    backgroundColor: "{colors.series-orange}"
    textColor: "{colors.on-light-band}"
    typography: "{typography.spine}"
    rounded: "{rounded.none}"
    width: "58px"
  sheet:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.r}"
    padding: "clamp(1.25rem, 4vw, 2.5rem)"
    width: "880px"
  toast:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper}"
    rounded: "{rounded.r}"
    padding: "0.85rem 1.15rem"
  colophon:
    backgroundColor: "{colors.paper-2}"
    textColor: "{colors.ink-2}"
---

# Design System: Gihan Munasinghe

## Overview

**Creative North Star: "The Paperback Series"**

The site is a paperback series and Gihan is its author. Every page is a volume with its own series colour: the homepage is the cover, and Ventures, the blog post, the Shop and even the 404 are further titles in the same run. Paper, ink, type and the publisher's mark are shared across the series; only the series colour changes from volume to volume, the way a paperback imprint keeps one grid and one typeface and reprints it in a new colour for each title.

The material is flat print. Colour arrives as solid horizontal fields printed edge to edge, never as gradients, glows or tinted panels. Structure comes from rules: a 2px ink rule opens every block and list, and 1px hairlines divide what follows, so the page reads as a ruled book page instead of a stack of cards. Depth exists only where a physical object sits: a photograph mounted as a print, books standing on a shelf plank, a dialog laid over the page. Type carries the rest of the voice: Archivo is pushed along its width axis from condensed spine lettering to wide cover titles, and Literata sets everything meant to be read at length.

The world refuses the dark-gradient developer portfolio it replaced, and it equally refuses the cream editorial page. Paper is a cool blue-grey off-white, ink is blue-black, and the four series colours are saturated print inks, not muted tints. Covers and title pages are generous and quiet; lists, timelines, the cart and comments are dense and ruled. Dark is a real, designed theme, not an inversion: night paper and light ink, the series fields keep their print colours, and the type tints of each series lighten for legibility. It follows `prefers-color-scheme` and a remembered manual toggle (stored as `gm_theme`, applied to `html[data-theme]` before first paint).

Motion follows one grammar: things are placed. Bands are drawn across the page, the portrait settles onto the cover, books slot onto the shelf, a stamp is pressed. Every move uses one exponential ease-out, nothing loops, and `prefers-reduced-motion` removes all of it.

**Key Characteristics:**
- One series colour per page (cobalt for the author, orange for writing, bottle green for ventures, cerise for the shop) on shared cool paper and blue-black ink.
- Full-bleed horizontal colour bands, including the tri-band title page that opens every volume.
- Hairline rules and 2px ink opening rules instead of cards or boxes.
- Archivo across its width axis for display, UI and spines; Literata for every long read; system mono for code only.
- Square 2px corners on controls, 0 on printed objects, and one curve in the whole system: the "Gihan." roundel.
- Shadows only under physical objects: mounted prints, books on a plank, dialogs.
- Placed motion on a single exponential ease-out; nothing loops; reduced motion honoured.

## Colors

Four flat print inks on cool paper with blue-black type, one ink per page.

### Primary
The series colours. Each page sets one with a body class (`series-blue`, `series-orange`, `series-green`, `series-red`), and that colour is the page's primary everywhere a CSS rule reads `--series`.
- **Author Cobalt** (#2346a6; field lifts to #2a4fb5 in dark): the author's volume, used by the homepage and the 404. Carries paper-coloured type.
- **Press Orange** (#ee6a1f): writing, used by the blog post and by the blog spines on the homepage shelf. The only light field in the series, so it carries ink type, not paper type.
- **Bottle Green** (#0f6b47): ventures, used by the Ventures page and by the venture spines on the homepage shelf. Carries paper type.
- **Cerise** (#c41f45): the shop. Carries paper type.

### Secondary
The series text inks: the readable form of each series colour for type, links, list markers and focus rings on paper.
- **Burnt Orange** (#b04a10): Press Orange as type on light paper. In the light theme cobalt, green and cerise are dark enough to serve as their own text ink.
- **Dark-theme text tints**: Pale Cobalt (#8eaaff), Apricot (#ff9b5e), Mint (#5fd3a0) and Rose (#ff7d97) replace the series colours as type on night paper, while the fields keep their print colours.

### Neutral
- **Cool Paper** (#f3f5f7; Night Paper #111318 in dark): the page, inputs, sheets, drawers, and the title panel of every spine.
- **Paper Shade** (#e5e8ed; #191c22): the colophon field, code blocks, callouts, notices, ghost-button hover.
- **Paper Deep** (#d6dbe2; #23272f): still loading placeholders, the product media mat, unfilled spines.
- **Blue-Black Ink** (#14161b; #eceef2): headings, body type on paper, the 2px opening rules, and the shelf plank in the light theme (the dark plank is #2c313a).
- **Ink Grey** (#474c56; #b4b8c0): ledes, prose and secondary text.
- **Ink Muted** (#5c626d; #959ba6): meta lines, inactive tabs, placeholders, dates.
- **Hairline** (ink at 16%; light ink at 15% in dark) and **Strong Rule** (ink at 72%; 70% in dark): dividers, control borders, dashed empty slots.
- **Scrim** (rgba(10, 12, 18, 0.62)): behind sheets and the cart drawer, both themes.

### State
- **Confirmation Green** (#0f6b47; #5fd3a0 in dark): success notices.
- **Signal Red** (#b3261e; #ff8a80 in dark): field errors, failed loads, error toasts, the remove action. Kept apart from Cerise so an error never reads as shop branding.

### Named Rules
**The One Volume Rule.** Every page owns exactly one series colour, and all of its chrome takes that colour: masthead, bands, primary buttons, active tab underline, focus ring, text selection, list markers, the colophon's top band and the browser `theme-color`. Another series colour may appear on a page only as an object that belongs to that other volume, such as the orange blog spines and green venture spines on the cobalt homepage.

**The Field and Text Rule.** Each series colour has a field value (solid ground behind type) and a text value (type and focus on paper). Never set Press Orange as type on paper; use Burnt Orange. On orange fields, type is ink; on cobalt, green and cerise fields, type is paper.

**The Hover Moves Away Rule.** Hover on a series fill moves away from its type colour: 84% series mixed with black (oklab) under paper type, 82% series mixed with white under the ink type on orange.

**The Flat Ink Rule.** Colour is printed as solid fields. No gradients, glows, translucent tinted panels or gradient text anywhere; the only `linear-gradient` in the build draws the select chevron.

## Typography

**Display Font:** Archivo, variable, self-hosted (weights 100 to 900, width 62% to 125%), with Helvetica Neue, Arial and system-ui
**Body Font:** Literata, variable, self-hosted (roman and italic, optical sizing on), with Iowan Old Style, Georgia and Noto Serif
**Label/Mono Font:** Archivo for labels; the system monospace stack (ui-monospace, SF Mono, Menlo, Consolas) for code only

**Character:** A grotesque that can be squeezed onto a spine or stretched across a cover, paired with a contemporary book face that makes the long reads feel printed. Display sizes are heavy (780 to 860), tight (negative tracking to -0.035em) and set close (line-height 0.9 to 1.02).

### Hierarchy
- **Display** (820, width 114%, clamp(3rem, min(6.6vw, 10.5vh), 6rem), line-height 0.9): the author's name on the homepage cover, one per site. The back-cover heading uses the same voice at up to 4.9rem, and the 404 numerals push it to weight 860 at width 125%.
- **Display Volume** (820, width 112%, clamp(2.45rem, 5.3vw, 4.6rem), line-height 0.95): the title-page h1 of an inner volume (Ventures; the Shop runs to 5.4rem). The blog post title is a sentence, so it steps down to 790 at width 104% and tops out at 3.4rem.
- **Headline** (780, width 104%, clamp(2rem, 4.2vw, 3.25rem), line-height 1.02): section headings.
- **Title** (680, clamp(1.2rem, 1.8vw, 1.45rem), line-height 1.2): entries in a ruled list (offers, formats, jacket and face titles run heavier at 760).
- **Body** (Archivo 400, 1rem, line-height 1.55): interface text.
- **Lede** (Literata 400, clamp(1.08rem, 1.4vw, 1.22rem), line-height 1.6, max 60ch, Ink Grey): the paragraph under a heading.
- **Prose** (Literata 400, 1.0625rem, line-height 1.72): about text, venture write-ups, excerpts and comments.
- **Reading** (Literata 400, 1.125rem, line-height 1.75, in a 43rem column): the blog post body. Pull quotes are Literata italic at up to 1.55rem between two strong hairlines.
- **Label** (Archivo 650, 0.875rem): form labels; buttons are Archivo 650 at 0.98rem, nav links 560 at 0.95rem.
- **Meta** (Archivo 400, 0.875rem, tabular figures, Ink Muted): dates, counts, conditions, prices in lists.
- **Spine** (Archivo 720, width 64%, 0.9rem, line-height 1.06, vertical): book titles set up the spine on the shelf.

### Named Rules
**The Width Axis Rule.** Hierarchy uses Archivo's width as deliberately as its weight: condensed (64% to 92%) for spines, tool lists, stage labels and jacket lettering; normal for UI; extended (104% to 125%) for headings, covers and numerals. Never fake width with transforms or letter-spacing.

**The Serif Is for Reading Rule.** Anything read at length (ledes, prose, post bodies, excerpts, comments, empty-state messages, cart notes) is Literata. Anything operated or scanned (nav, buttons, labels, meta, prices, headings) is Archivo. Mono appears only inside code.

**The No Kicker Rule.** Headings stand alone: no eyebrow or kicker labels above them, and no small tracked uppercase labels. Uppercase with wide tracking (0.14em) exists only inside a rubber stamp ("Sold", "Out of print").

**The Every Script Rule.** Translated posts switch to script-native serif stacks (Noto Serif Tamil, Sinhala, Devanagari, SC) at weight 700, width 100%, zero tracking, line-height 1.9 to 1.95 for body text; Chinese drops italics.

## Layout

The page is a 1240px wrap with a fluid gutter (clamp(16px, 4vw, 40px)) and a section rhythm of clamp(4.5rem, 9vw, 8rem). Bands, the masthead and title pages ignore the wrap and run the full width of the viewport; their content aligns to it through named grid lines (`full`, `text`, `plate`).

- **Cover and title pages** are a three-row grid: series band, paper, series band. The homepage cover splits the paper row 7fr text to 5fr portrait plate, sized to min(100svh minus the masthead, 880px); inner volumes run the title across and put a 7fr to 5fr spread under a 2px ink rule.
- **Spreads** pair a 5fr "left page" (heading, lede, action) with a 7fr "right page" (the ruled list), gap clamp(2.5rem, 7vw, 7rem), and stack below 900px.
- **Reading** happens in a single 43rem column shared by the post's title page, text and end matter.
- **Grids of objects**: venture jackets auto-fill at a 330px minimum; shop covers auto-fill at 196px and hold two across below 600px.
- **The masthead** is sticky at 64px (58px below 960px), where the nav collapses into a Menu button and a full-width series-coloured menu panel.
- **The shelf** is a horizontal run of spines that scrolls sideways; below 720px it becomes a vertical stack of horizontal spines.
- **The colophon** runs three columns (1.2fr 1fr 1fr) and folds to two below 820px.

### Named Rules
**The Tri-Band Rule.** Every volume opens on a title page of three horizontal bands: a series band above (with the sticky masthead it reads as one thick top field), paper in the middle carrying the title, and a series band closing it. Bands are always full-bleed, edge to edge of the viewport. They are never inset, never vertical and never a side stripe; the volume band between homepage sections, the 14px band at the top of a sheet or drawer, and the colophon's 10px top band are the same device.

**The Ruled List Rule.** A list, timeline, form or block opens with a 2px ink rule, and each further entry is separated by a 1px hairline. No cards, boxes or zebra fills; on a series band the rules are drawn in the band's type colour.

## Elevation & Depth

The system is flat: paper, bands and ruled lists sit on one plane with no ambient shadow. Depth appears only where a physical object sits on the page, and those shadows are tinted with blue-black (rgb 18, 26, 54) in light and pure black in dark. Every object shadow uses a large negative spread so it falls below the object like a cast shadow on a plank, never as a halo around it.

### Shadow Vocabulary
- **Mounted print** (`box-shadow: 0 34px 60px -30px rgba(18, 26, 54, 0.6), 0 0 0 1px rgba(20, 22, 27, 0.1)`): the cover portrait, the teaching frontispiece and the post cover plate. A frontispiece print sits in a light paper mount (#f3f5f7, padding clamp(10px, 1.4vw, 18px)) that stays light in both themes, because it is an object.
- **Shelf plank** (`box-shadow: 0 26px 22px -22px rgba(18, 26, 54, 0.5)`): under the 14px plank of the homepage shelf; venture jackets carry their own plank with `0 18px 18px -16px rgba(18, 26, 54, 0.45)`.
- **Book on display** (`box-shadow: 0 18px 22px -16px rgba(18, 26, 54, 0.42)`): shop covers standing on the plank, deepening to `0 26px 26px -18px` as the cover lifts 8px on hover.
- **Spine edge** (`box-shadow: inset -3px 0 0 rgba(0, 0, 0, 0.14), inset 2px 0 0 rgba(255, 255, 255, 0.14)`): the rounded-back feel of a spine without any radius.
- **Overlay** (`box-shadow: 0 40px 80px -30px rgba(18, 26, 54, 0.6)`): sheets. The cart drawer casts sideways (`-34px 0 60px -34px`), the mobile menu panel drops `0 24px 40px -24px` at 0.5, and the toast `0 18px 40px -18px` at 0.6.
- **Hairline frame** (`box-shadow: 0 0 0 1px` Hairline): jackets, screenshots, post images and the author photo, so an edge is drawn without lifting anything.

### Named Rules
**The Object Rule.** Shadows belong to objects, never to surfaces. If it is a print, a book, or a layer over the page, it may cast a shadow; if it is content on paper, it sits on rules.

**The Plank Rule.** Books and face-out covers always stand on a plank: a solid bar of ink (#2c313a in dark), 10 to 14px tall, running under the whole row.

## Shapes

Corners are square. Every control and panel takes a 2px corner (buttons, inputs, icon buttons, tags, the cart count, sheets, toasts, code, embedded media); every printed object is fully square (bands, spines, books, jackets, typographic covers, mounted prints). Strokes come in four weights: 1px hairlines, 1.5px control borders, 2px opening rules and focus outlines, and the 10 to 18px bands.

Markers are squares too: 7px square bullets in offer lists, 5px square separators in the post byline, 8px square pips for a venture's stage, and 14 to 16px square progress nodes with the 2px corner. A dashed 1.5px Strong Rule outline, open at the bottom and standing on a plank, marks an empty slot where a book would go.

### Named Rules
**The 2px Corner Rule.** Controls and panels get 2px, printed objects get 0, and nothing in between. No pills, no 8px cards, no circular avatars.

**The One Curve Rule.** The roundel is the only curve in the system: an ellipse with a 1.5px currentColor stroke around "Gihan." (or "G." where space is tight). It is the publisher's mark on the masthead, the cover's bottom band, spine and jacket feet, the end of every post and the colophon. The favicon is the same "G." on a cobalt tri-band.

## Components

### Buttons
Printed and tactile: solid or stroked rectangles, never floating.
- **Shape:** 2px corner, 1.5px border, min-height 48px (40px for the small size), padding 0.75rem 1.3rem, Archivo 650 at 0.98rem, Phosphor icon leading at 1.15em with a 0.55rem gap.
- **Primary:** the page's series field with its band type colour; the one obvious next step in a group ("Email me", "Add to cart", "Post comment").
- **Hover / Focus:** primary moves to the series hover value; ghost fills with Paper Shade and its border goes to full ink; a press nudges every button down 1px. Focus is the global 2px outline.
- **Ghost:** transparent with a Strong Rule border and ink type; the secondary action and every share button.
- **On a band:** Paper (a paper fill with series-coloured type; ink fill with orange type on the orange volume) for the masthead's "Work with me" and the back-cover email; Outline Band (a 70% band-type border) beside it.
- **Text link:** series text ink, 650, a 1.5px underline as a bottom border, and a trailing arrow that nudges 3px on hover.

### Chips (tags)
- **Style:** flat print tags of the series field with band type, 0.75rem at 720, padding 0.12rem 0.5rem: "Current" on the career timeline, "Author" on Gihan's comments. The cart count inverts them (band-type fill, series-coloured number).
- **State:** tags are labels, not filters; filtering is done with tabs.

### Books and jackets (not cards)
- **Corner Style:** square (0).
- **Background:** Cool Paper with series-coloured bands top and bottom.
- **Shadow Strategy:** they stand on a plank (see Elevation & Depth); a jacket's edge is a hairline frame.
- **Border:** none beyond the hairline frame; a 1px hinge score runs down a jacket 10px from its left edge.
- **Internal Padding:** 1.15rem to 1.5rem, larger on the hinge side.

### Inputs / Fields
- **Style:** Cool Paper ground, 1.5px Strong Rule border, 2px corner, min-height 48px, padding 0.7rem 0.9rem, Archivo 1rem; labels above in Archivo 650 at 0.875rem, hints and counts in Ink Muted at 0.8125rem. Selects draw their own chevron; textareas start at 120px.
- **Focus:** border turns to the series text ink with a 3px ring of the series colour at 28%.
- **Error / Disabled:** Signal Red border with a 24% red ring and a 600-weight red message under the field; disabled buttons drop to 50% opacity.

### Navigation
- **Masthead:** a sticky band of the page's series colour, 64px tall. The "Gihan." roundel sits left; nav links in Archivo 560 at 0.95rem take a 1.5px underline in their own colour on hover and on the current page; a 40px theme toggle and the Paper "Work with me" button sit right.
- **Mobile (below 960px):** the links fold into a "Menu" icon button that opens a full-width panel in the series colour, links at 1.35rem 700 width 104% with trailing arrows, divided by band-type hairlines at 22%. Escape closes it and returns focus.
- **Tabs:** Archivo 600 at 0.95rem in Ink Muted on a hairline; the active tab turns ink with a 3px series underline, counts in the series text ink.
- **Colophon:** a Paper Shade field under a 10px full-bleed series band, the roundel in ink, sentence-case column headings, 42px square social links with Hairline borders, and a hairline base row.

### The Shelf (signature)
The homepage blog and ventures sit on a bookshelf of real titles. Each book is a 58px spine and itself a tri-band: a 58px series cap (number or year in tabular figures), a paper panel with the title set vertically in Spine type, and a 54px series foot with a small "G." roundel. Heights vary between 88% and 99%, derived from the post's id so a book is always the same height. Hovering or focusing a spine slides that book out to min(460px, 78vw) to show its face: a series band with the label, the title at 1.42rem 760, a Literata excerpt, "Read post" with an arrow, and the cover art or roundel. One book is open at a time and the first starts open; closed spines lift 10px on hover. Below 720px the shelf becomes a vertical stack of horizontal spines (width 86%): the first book shows its face and the rest are direct links.

### Paperback jacket (Ventures)
A face-out paperback: a 56px series band with the stage pips and category, 16:9 artwork (or the venture name set at width 74% over a 2px band-type rule), a title at 1.5rem 760 with a Literata tagline and a "Looking for" line, and a 48px series foot band with "Open venture" and the roundel. The whole jacket is one link through a covering layer; hover deepens the foot band and nudges its arrow 4px.

### Typographic cover (Shop)
When a product has no photo it gets a printed 5:7 cover: a 17% series band with the category and its icon, a paper middle with the title in Archivo 780 at width 90% above a short ink rule, and a 19% series foot with the roundel. Container-query units keep the cover in proportion from a 52px cart thumbnail to the 290px product sheet. A sold item greys out to 45% and takes a rubber stamp.

### Sheets and the cart drawer
Dialogs are pages laid over the book: a Cool Paper sheet (880px, 980px for products) with a 14px series band along its top edge, the overlay shadow, a Scrim behind, and a 40px close button top right. The cart drawer is the same material sliding in from the right at min(440px, 100vw), its items ruled and its foot opened by a 2px ink rule. Toasts are ink rectangles with paper type, Signal Red for errors.

### Rubber stamp
A rubber-stamp impression for states that end something ("Sold", "Out of print"): rotated -9deg, uppercase Archivo 820 to 850 at width 80 to 88% tracked 0.14em, a double or 2.5px border with the 2px corner. On the 404 it overprints the numerals with multiply (screen in dark).

### Loading, empty and error states
Loading placeholders take the exact shape of what is coming (Paper Deep spines on the shelf, jacket-shaped skeletons, Paper Deep bars for a post's title and lines) and stay still. Empty and failed shelves say so in Literata inside a dashed Strong Rule outline, or as dashed empty slots standing on the plank in the shop; failures name the next step (refresh, or a "Try again" text link) and the ventures error state adds a Signal Red icon. Live content never collapses to a blank region.

### Focus and selection
`:focus-visible` is a 2px solid outline in the series text ink, offset 3px; on a band or the masthead the outline switches to the band's type colour. Objects that are links as a whole (books, jackets, shop covers) draw the outline around the whole object, offset 4 to 5px. Text selection is the series field with band type.

### Motion
One easing for everything: an exponential ease-out (`cubic-bezier(0.16, 1, 0.3, 1)`). Bands draw across the page in 0.9s from a 4% sliver, the top band from the left and the closing band from the right 80ms later. The cover portrait settles in 1.1s from 26px above and a -1.4deg tilt. Books and jackets slot onto the shelf in 0.7s with a 45 to 70ms stagger; shop covers are lowered onto theirs. Sheets rise 18px in 0.45s, the drawer slides in 0.45s, a stamp presses from 145% scale in 0.5s, opening a book takes 0.6s. Colour and border changes take 0.2s; arrows nudge 3 to 4px in 0.25s. Page navigations use a cross-document view transition and anchors scroll smoothly, both only when motion is allowed.

**The Placed Rule.** Motion only ever places an object: it draws, settles, slots, slides or presses, once, and comes to rest. Nothing loops, pulses, shimmers or bounces, and with `prefers-reduced-motion: reduce` every animation and transition is cut to near zero.

## Do's and Don'ts

### Do:
- **Do** give every new page exactly one series colour with a body class and route all of its chrome through `--series`, `--series-text` and `--on-series`.
- **Do** open every new volume with the tri-band title page, and keep every band full-bleed and horizontal.
- **Do** open lists, timelines, forms and end matter with a 2px ink rule and separate entries with 1px hairlines.
- **Do** set anything read at length in Literata (1.0625rem to 1.125rem, line-height 1.72 to 1.75, a 43rem column for posts) and everything operated in Archivo.
- **Do** use Archivo's width axis for hierarchy: 64% on spines, 104% to 125% on headings and covers.
- **Do** keep 2px corners on controls and panels and square corners on printed objects; the roundel is the only curve.
- **Do** use Phosphor regular icons from the sprite at 1.15em in currentColor, 20px inside icon buttons.
- **Do** design both themes: night paper #111318, light ink #eceef2, print-colour fields, lightened series text tints and a #2c313a plank in dark.
- **Do** keep focus visible with the 2px series-text outline at a 3px offset, switched to the band's type colour on bands.
- **Do** show loading as still placeholders in the shape of the content, and give empty and error states a real message and a next step.

### Don't:
- **Don't** add eyebrow or kicker labels above headings, or small tracked uppercase labels anywhere outside a rubber stamp.
- **Don't** use gradient text, gradient fills or glows; colour is flat print.
- **Don't** put coloured side stripes on cards, callouts, quotes or notices; a callout is set off by a 2px ink top rule on Paper Shade, a pull quote by two hairlines.
- **Don't** use emoji as icons.
- **Don't** float drop-shadowed cards; content sits on rules, and shadows belong only to prints, books on a plank and overlays.
- **Don't** use em dashes in copy; use commas, colons, full stops or parentheses.
- **Don't** drift toward cream or warm paper, or back toward the dark navy gradient look the site replaced.
- **Don't** set Press Orange as type on paper; use Burnt Orange (#b04a10).
- **Don't** mix two series colours in one page's chrome.
- **Don't** round corners beyond 2px, or introduce pills, circles or round dots besides the roundel.
- **Don't** use monospace for anything but code.
- **Don't** animate on a loop, shimmer a skeleton, or bounce an object into place.
