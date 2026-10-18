# Reconcile style guide ("Ledger")

The rules every page follows (M5 AC-8). If a page needs something that isn't here,
add it here first, then use it. The tokens below become CSS variables in
`apps/web/src/styles/tokens.css`; components never use raw color values.

## The idea in one line

**An accountant's ledger, made calm and modern:** warm paper, dark ink, thin ruled
lines, one teal accent, and numbers that line up perfectly.

## Color

Each color has one job. Status colors always come with an icon or a word, so they still
work for people who don't see color well.

| Token | Light | Dark | Job |
|---|---|---|---|
| `--paper` | `#F6F2E9` | `#121618` | Page background |
| `--sheet` | `#FBF9F4` | `#191E20` | Cards, panels, tables |
| `--raised` | `#FFFFFF` | `#20262A` | Menus, dialogs, inputs |
| `--ink` | `#1C2321` | `#ECE7DC` | Main text |
| `--ink-2` | `#535B57` | `#AEB3AD` | Supporting text |
| `--ink-3` | `#626863` | `#8F9590` | Hints, captions (at least 4.5:1 contrast on paper and sheet) |
| `--rule` | `#E3DBCB` | `#2A3134` | Thin dividing lines |
| `--rule-strong` | `#CDC2AC` | `#3A4246` | Table header lines, input borders |
| `--accent` | `#0E5C58` | `#63B9AF` | Buttons, links, selection, focus ring |
| `--accent-tint` | `#E0ECE8` | `#16302D` | Selected rows, the accent's soft background |
| `--risk` | `#A13A28` | `#E58B76` | Money at risk, disputes, errors |
| `--risk-tint` | `#F5E2DC` | `#3A1F19` | |
| `--caution` | `#8A5A00` | `#DDB061` | Needs a look, unsure AI readings |
| `--caution-tint` | `#F4E8CC` | `#33280F` | Also the highlight behind an unsure field |
| `--settled` | `#3E6A2D` | `#9AC285` | Approved, matched, resolved |
| `--settled-tint` | `#E4EDDA` | `#1E2E17` | |

## Type

| Role | Font | Size / line height | Used for |
|---|---|---|---|
| Display | Newsreader 500 | 40 / 44 | The money-at-risk figure |
| Title | Newsreader 500 | 28 / 34 | Page titles |
| Heading | Newsreader 500 | 20 / 26 | Card and section titles |
| Body | Inter 400 | 14 / 21 | Most text, table cells |
| Small | Inter 400 | 13 / 18 | Supporting text |
| Label | Inter 500 | 12 / 16, +0.02em spacing | Column headers, field labels (sentence case, never all caps) |
| Code | IBM Plex Mono 400 | 13 / 18 | PO, invoice, and SKU numbers |

- Two weights only: 400 and 500.
- All fonts are free (SIL Open Font License) and installed from `@fontsource` packages.

## Numbers and money

- **Equal-width figures** everywhere (`font-variant-numeric: tabular-nums`), so digits
  line up in columns.
- Money columns are **right-aligned**, always two decimals, with a dollar sign and
  thousands separators: `$1,284.50`. Never computed in the browser with JavaScript
  numbers: the API sends exact decimal strings and the website only formats them.
- A difference shows its direction and unit: `+$0.40 / unit`, `−3 cases`.
- Big headline figures use Newsreader; the cents are set smaller and in `--ink-2`.
- Dates: `Mar 4, 2026` in tables, `Mar 4, 2026, 2:15 PM` in the history.

## Space, shape, and lines

- Spacing steps of 4px: 4, 8, 12, 16, 24, 32, 48.
- Corners: 6px for buttons and inputs, 10px for cards. Pills only for status tags.
- **Ruled lines instead of boxes:** tables use 1px `--rule` lines between rows and a
  `--rule-strong` line under the header, no zebra stripes.
- No gradients. One soft shadow, only on floating things (menus, dialogs).

## Components

| Component | Rule |
|---|---|
| Button | One filled (accent) button per area, the rest outlined or plain. Verb first: "Write off", "Upload files". |
| Status tag | Small pill: tint background, matching dark text, an icon. `Open`, `Disputed`, `Matched`, `Waiting`, `Needs review`. |
| Problem row | Type tag · PO number (mono) · vendor · explanation's first line · impact (right) |
| Line comparison | Three columns (PO · Receipt · Invoice). The field that differs gets the problem's color, with the difference written underneath. |
| Field box (document page) | 1.5px accent outline; unsure fields get a caution outline and tint; hovering a field in the list fills its box lightly. |
| Timeline | A thin vertical rule with small dots: grey for system steps, accent for human decisions (with the name and the note). |
| Skeleton | Grey bars shaped like the real content, gently pulsing. No spinners for page loads. |
| Empty state | A short title that says what this place is for, one sentence, and an action. "No open problems. Everything's matched." |
| Error | What happened, then what to do: "Couldn't reach the server. Try again." Never a raw error message. |

## Motion

Short and quiet: 120ms for hovers, 200ms for panels. Status changes on the upload page
fade between states. All motion is turned off when the computer asks for reduced motion.

## Keyboard

`J`/`K` next/previous row · `Enter` open · `A` approve · `D` dispute · `W` write off ·
`E` edit field · `/` search · `G` then `O`, `P`, `L` (POs), `R`, or `U` to jump pages ·
`?` show shortcuts · `Esc` close. Every action is also reachable with `Tab`, and the
focus ring (2px accent) is always visible.

## Writing on screen

Sentence case. Verbs on buttons. No "please", no "successfully", no exclamation marks.
Money and quantities in plain words: "Billed 12 cases, received 10."

## The logo

Three short horizontal rules (the PO, the receipt, and the invoice), the last one
turning up into a check mark, next to the word **Reconcile** in Newsreader.
