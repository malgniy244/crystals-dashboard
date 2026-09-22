# Deadline Calendar Generator — Spec (v1.0)

## Purpose
Turn the US office's Word production schedules into monthly **Consignment Deadline** and **Settlement Deadline** calendars (same look as the hand-made PDF), for any month range, with no manual retyping.

## Hosting
- 100% static: `index.html` + `parser.js` + `mammoth.browser.min.js`. No server, no database, no accounts.
- Deploy: drag the `deadline-calendar` folder onto https://app.netlify.com/drop → get a URL. To update, drop the folder again on the same site (Site → Deploys → drag).
- Word files never leave the browser (parsing is client-side). Parsed data is cached in the browser's localStorage so you don't re-upload every visit.

## Inputs
- One or more `.docx` production schedules (Showcase & C&A, CCO Auctions, …). Re-uploading a file with the same name replaces it.
- From / To month (any range, up to 36 months).
- Toggles: show RAW (to be graded) deadlines · show HK non-TIB deadlines · include non-HK auctions · show Sat/Sun columns.

## Parsing rules
1. **Auction heading** = a line starting with a month/season/"Bruun" and containing Auction / Sale / Collectors Choice / Showcase / CCO. Year is taken from the heading; if missing, the previous auction's year is assumed (flagged as INFO).
2. **Consignment deadline lines** = any line whose label contains "Consignment Deadline(s)" or "Deadline for coins/items to be graded". Handles:
   - `Label: date` single lines
   - Group blocks (`Consignment Deadline:` then `World Coins: July 20` / `World Paper: July 27`)
   - Section blocks (`World Coins:` heading then several deadline lines)
   - Inline pairs (`Coins: July 6; Paper: July 27`)
   - Date formats: `July 20`, `Sept 11th`, `Dec 7`, `9/16/2026`, `6/30`, `1/3/2027`.
3. **Type of each deadline**
   - `TIB` — label contains "TIB" (incl. "TIB & Non-TIB", "including TIB coins…")
   - `HK` — "sourced from Hong Kong" but not TIB
   - `RAW` — "to be graded" (but *not* "(graded & ready to catalog)")
   - `FINAL` — the latest non-RAW date **per category** (World Coins / World Paper / US Coins / US Currency / Colonial / Crypto…). A plain "including Z-Lots" line with no category is FINAL only if it is the overall latest.
4. **What appears on the consignment calendar** (per your rule): every TIB deadline; the FINAL deadline for each category (so if TIB isn't the latest, the latest shows too); optionally RAW and HK non-TIB. Intermediate deadlines that are none of these are dropped. If an auction has no TIB deadline, only its FINAL(s) (+ optional RAW) appear.
5. **Settlement** = the `Consignor Settlement:` date ("(check with Eric C…)" stripped).
6. **Year inference** for dates without a year: consignment dates are assumed before the auction (a Nov/Dec date for a Jan 2027 sale → 2026); settlement dates after it (a January settlement for a Nov 2026 sale → 2027).
7. **Dedup**: same auction + same date + same type → one entry, categories joined with " / ".
8. **HK-related** = heading contains "Hong Kong" OR it has any TIB/HK deadline. Editable per auction in the review table.

## Review step (before generating)
- Issues list (ERROR / WARN / INFO): stale years, dates on weekends, TIB earlier than RAW, missing deadlines/settlement, tentative/TBD, duplicate headings, unreadable dates.
- Table per auction: include/exclude, HK flag, editable display name, each deadline with tags (editable date, include/exclude), editable settlement date. Edits persist in the browser.

## Output
- One page per month per calendar (Consignment, then Settlement), Sun–Sat grid, A4 landscape.
- Red chip = HK-related auction; yellow chip = other auction. Chip text = display name + type/category line.
- "Print / Save as PDF" button (browser print → Save as PDF; tick "Background graphics").

## Not in v1 (easy to add later)
- Export to .ics / Google Calendar.
- Chinese labels.
- A "diff" when a new version of the schedule is uploaded (what changed vs last time).
- Custom colour per auction family.
