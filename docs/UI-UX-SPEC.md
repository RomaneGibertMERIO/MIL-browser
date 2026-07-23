# MIL-Browser — UI/UX & Front-End Architecture Specification (Redesign Reference)

## Context

MIL-Browser is a working Electron desktop tool for browsing military environmental
test standards (MIL-STD-810H, STANAG-4370, …) without reading thousands of PDF pages.
It is a **Standard Browser first**, not a database editor or a Git client.

This document is the **reference specification** for a **visual + architectural front-end
redesign**. It must be detailed enough that another engineer (or AI) can execute the
redesign without inventing behavior. The business logic, data engines, sync protocol and
IPC contract are **not** being redesigned — with two explicitly scoped exceptions the
product owner approved (multi-window, and the node-image storage change that fixes the
edit freeze).

**Approved scope decisions (from the product owner):**
1. Scope = **front-end redesign + multi-window + edit-freeze fix**.
2. Pinned profiles stay **comparison cards** (independent-Miller-per-pin is future work).
3. Edit page selects a standard as the **first Miller column**; **every column in edit
   mode carries a `+` row at its bottom** to add an item at that level.
4. Icons = **lucide-react** (adds one dependency; replaces all emoji/Unicode glyphs).

**Absolute rule:** the entire front-end is **English only**. No French anywhere in the UI.
(Recent additions — Browser, Accounts, Settings, some dialogs — contain French strings and
must be translated as part of this work. Code comments may stay as-is.)

---

## 1. Product Philosophy

- **Laboratory / engineering software.** Technical, dense-but-legible, precise. The user
  is a test engineer comparing environmental profiles, not a consumer.
- **IDE-inspired.** Visual references: **VS Code, JetBrains, GitHub Desktop, Linear, Figma.**
  Miller-column navigation like macOS Finder.
- **Minimal & monochrome.** Neutral greys are the base. Color is *semantic only* (see §8).
  Avoid: Material Design elevation, playful rounded shapes, decorative color, shadows
  everywhere, emoji.
- **The Browser defines the visual language.** Every other page reuses the same toolbar,
  spacing, typography, Miller component, Profile Card, color system, icons, resize handles.
- **Non-destructive redesign.** Presentation layer only (+ the two sanctioned exceptions).
  IndexedDB, Zod schemas, engines, sync and Git logic keep working exactly as today.

---

## 2. User Personas

| Persona | Role in app | Primary needs |
|---|---|---|
| **Test Engineer (Reader)** | `readonly` | Browse standards, read node guidance/images, open & compare profiles, search everything. No editing. |
| **Contributor** | `testing` → relabeled **"Write"** | Everything above + create/edit profiles, edit taxonomy locally, submit changes for review. |
| **Lab Admin** | `admin` | Everything above + review/approve/reject submissions, inspect history, manage user permissions. |

Read-only is the **default** for any newly-seen session. Roles come from `access.json` in
the central repo (see existing `readRole`/`setUserRole` in `electron/gitService.ts`). The
role gate is enforced in the main process; the UI only *reflects* it.

---

## 3. Information Architecture

Two top-level **modes** (already modeled by `appStore.mode = 'assistant' | 'admin'`):

```
MIL-Browser
├── BROWSER (default landing, "Home" of the app) ............ mode = assistant
│     Standard browsing, reading, comparison. Read-only view of data.
│     "Manage" button (hidden for readonly) → Management.
│
└── MANAGEMENT ............................................... mode = admin
      ├── Home ............... landing/help + identity (role, git link, session)
      ├── Edit database ...... Miller (profiles editing + gear→taxonomy editing)
      ├── Synchronization .... local/pending/approved changes + comparison + push
      ├── Settings ........... import/export, git path, session, version, credits
      └── Admin (admin only) . Tab 1 Review · Tab 2 History · Tab 3 Users
```

**Change vs today (deltas the redesign introduces):**
- Management gains a **Home** landing (does not exist today).
- Today's separate **"Library Space"** + **"Standards Config"** merge into one **"Edit
  database"** with a gear toggle (profiles ↔ taxonomy), per the brief.
- **Synchronization** becomes a real page (today: scattered across a sidebar button +
  `SubmitChangesModal` + Settings).
- Today's flat **"Admin Validations"** + **"Accounts & Roles"** become **tabs inside a
  single "Admin"** page, plus a **new "History (Git tree)"** tab.

`appStore.AdminView` extends to: `home | edit | sync | settings | admin`. The current
`library|standards|validations|accounts|browse` values are internalized behind these
(e.g. Edit hosts library+standards; Admin hosts validations+accounts+history).

---

## 4. Navigation

- **Global chrome on every page** (Browser and all Management pages):
  - **Top-left:** app **logo + name** ("MIL-Browser"). Always present, always the same.
  - **Bottom bar:** **version** (`__APP_VERSION__`) + **credits**. Always present.
- **Browser:** global **search** (top center/left) + **Manage** button top-right
  (hidden when `role === 'readonly'`).
- **Management:** left **rail** with the five destinations (Home / Edit / Sync / Settings /
  Admin). A persistent **"← Browser"** button top-left returns to the Browser. Admin entry
  visible only to `admin`. Contribution actions (Push, edit) hidden below `write`.
- **Selection model:** blue = current selection everywhere (Miller row, nav item, tab).
- **Role gate** must be defined **once** and shared by the rail and the content router
  (today it is duplicated in `Sidebar.NAV_ITEMS.minRole` and `App.ContentPane.minRoleByView`
  — unify into one `ROLE_RANK` + `canAccess(view, role)` util in `src/shared/roles.ts`).

---

## 5. Complete Screen Hierarchy

```
Browser (assistant)
  Toolbar: logo·name | search | [Manage]
  Body: MillerBrowser(standards→nodes→profiles) │split│ InfoPanel(node|profile) + Pins…
  Footer: version · credits

Management (admin)
  Rail: logo·name / [←Browser] / Home·Edit·Sync·Settings·Admin(admin) / role·repo badge
  Content:
    Home            → identity card + "what you can do" + quick links
    Edit database   → MillerBrowser(editable) │ ProfileForm+LivePreview   (gear→Taxonomy)
                        Taxonomy mode → MillerBrowser(editable) │ NodeProps │ NodeSchema
    Synchronization → 3 change columns │split│ Comparison(ProfileCard diff) + [Send…]
    Settings        → cards: Data · Git repo · Session · About/credits
    Admin
      Tab Review    → submissions list │ diff detail (ProfileCard/diff) + Approve/Reject
      Tab History   → commit tree (GitHub-style)
      Tab Users     → sessions list + role toggles (Read Only / Write / Admin)
  Footer: version · credits
```

---

## 6. Design System

**Principles:** one toolbar, one spacing scale, one type scale, one Miller component, one
Profile Card, one color system, one icon set, one resize handle, one panel/dock primitive.

**Surfaces (greyscale ramp, light theme):**
- App background: `bg-gray-50`
- Panels/cards/columns: `bg-white`
- **Navigation / taxonomy tree tone: greyed** (`bg-gray-50/60` columns, `text-gray-*`),
  deliberately *lower contrast* than the profile/info area so "structure" reads as
  secondary and "content" (profiles/info) reads as primary. This is the requested
  "tree greyed vs profiles" separation.
- Borders/dividers: `border-gray-200` (structural), `border-gray-100` (internal).
- Elevation: **none by default.** A single soft shadow (`shadow-sm`) only for floating
  overlays (dialogs, popovers). No shadows on static panels.

**Radii:** `rounded` (badges, inputs, small controls), `rounded-md` (buttons), `rounded-lg`
(cards/dialogs). **Remove `rounded-xl`/`rounded-2xl`** (sidebar/validation cards today) —
too soft for the IDE aesthetic.

**Reused components (do not rebuild):** `Badge`, `Card`, `EmptyState`, `LoadingSpinner`,
`ErrorBanner`, `EmptyWorkspaceNotice`, `ProfileDetail` (= the Profile Card), `TimeSeriesChart`,
`FieldRenderer`, `DatasetEditor` (keep its paste-parser), the Miller sub-components and the
resize gesture (`beginGesture`/weights) in `AssistantPage.tsx`, `profileStatus.ts`,
`previewSafe.ts`.

**New shared primitives to extract/create:**
- `AppFrame` — logo+name top-left, footer version+credits; wraps every page.
- `MillerBrowser` — extract the Miller from `AssistantPage` into
  `src/shared/components/miller/` so Browser, Edit, Taxonomy and Admin-review all reuse it
  (read mode + edit mode with `+` rows).
- `Splitter`/`ResizeHandle` — extract the existing gesture into a reusable component.
- `StatusDot` + centralized `statusStyle()` — one source for local/pending/official color
  used **everywhere** (fixes today's inconsistency; extend `profileStatus.ts`).
- `Toolbar`, `IconButton`, `TabBar` (horizontal + vertical), `FilterBar`, `DockPanel`.
- `DiffView` — reuses the Profile Card layout with change highlighting.
- `Icon` — thin wrapper over lucide-react for consistent sizing/stroke.

---

## 7. Typography

- **Font family:** keep the current system stack (`"Segoe UI", "Helvetica Neue", Arial`).
  Monospace (`font-mono`, `tabular-nums`) for codes, IDs, git paths, numeric dataset cells.
- **Scale (Tailwind):**
  - `text-[10px]`/`text-[11px]` — micro labels, badges, meta.
  - `text-xs` — section headers (with `uppercase tracking-wider`), field labels, table heads.
  - `text-sm` — body, list rows, values, buttons.
  - `text-base` — panel/screen titles.
  - `text-lg` — page-level title (Management header) only.
- **Weights:** `font-medium` (values), `font-semibold` (titles), `font-bold` (emphasis).
  Retire `font-black`/`font-extrabold` (too heavy for a technical tool).
- **Section header pattern:** `text-xs font-semibold text-gray-400 uppercase tracking-wider`
  (already the app's convention — standardize it).

---

## 8. Colors (the ONLY semantic colors)

| Meaning | Color | Tailwind tokens (badge / dot / text) |
|---|---|---|
| **Official** (synced/approved) | **Green** | `bg-green-50 text-green-700` · dot `bg-green-500` |
| **Pending** (awaiting admin review) | **Orange** | `bg-orange-50 text-orange-700` · dot `bg-orange-500` |
| **Local** (changed, not submitted) | **Yellow** | `bg-yellow-50 text-yellow-800` · dot `bg-yellow-500` |
| **Selection / interactive** | **Blue** | `bg-blue-600 text-white` (strong) · `bg-blue-50 text-blue-700` (soft) · focus `ring-blue-500` |
| **Error / destructive** | **Red** | `bg-red-50 text-red-700` · `bg-red-600 text-white` |
| **Navigation / structure / neutral** | **Grey** | `gray-*` ramp |

Everything else stays monochrome. **Status is never conveyed by color alone** — always
color + label and/or dot (accessibility).

**Migration note (today → target):** the app is inconsistent — Local is blue, Pending is
grey/amber, Official is green/blue/emerald depending on the file. The redesign **replaces
all local badge logic with `statusStyle()`** (extended `profileStatus.ts`) so:
`local → yellow`, `pending → orange`, `approved → green`. Add the `orange`/`yellow` variants
to `Badge.tsx`.

**Roll-up on standards & structure (requested):** a standard/branch shows an aggregate
status dot:
- **any descendant is Local** → yellow indicator,
- else **any descendant is Pending** → orange,
- else **all Official** → green.
Compute from the same `status` fields already present on profiles/standards; render the dot
on the standard row (Miller col 1) and on tree nodes. Pure derivation, no new data.

---

## 9. Spacing System

- **Base unit: 4px** (Tailwind default). Use the existing rhythm:
  - Rows: `px-3 py-2` (Miller/nav rows), `px-3 py-2.5` (profile rows).
  - Cards: `p-5` (Card), header strips `px-5 py-4`.
  - Toolbars: `px-4 py-2.5`, `h-16` for the Management header.
  - Gaps: `gap-1.5` (inline meta), `gap-2`/`gap-3` (controls), `space-y-5` (stacked cards).
- **Resize handles:** 6px hit area (`w-1.5` / `SPLITTER_W=6`), `cursor-col-resize`,
  rest `bg-gray-200` (primary split) / `bg-gray-100` (internal), **hover `bg-blue-400`**.
- **Min sizes (never collapse a pane):** `MIN_MILLER=320`, `MIN_RIGHT=340`, `PANEL_MIN=260`,
  `COL_MIN=130` (already defined in `AssistantPage.tsx` — promote to shared constants).

---

## 10. Component Library (contracts)

| Component | Source | Contract / notes |
|---|---|---|
| `AppFrame` | new | `{children, toolbar}`. Renders logo+name (top-left), toolbar slot, footer (version+credits). Used by Browser & Management. |
| `MillerBrowser` | extract from `AssistantPage` | `{columns, selectedPath, onSelect, mode:'read'|'edit', renderColumnFooter?}`. Equal-width flex columns, horizontal scroll past `COL_MIN`, greyed tone. Edit mode renders a `+` footer row per column. |
| `ProfileCard` | = `ProfileDetail.tsx` | `{profile, schema, onBack?, backLabel?}`. Dynamic groups + chart+table toggle. Add optional `diff?: {previous}` and `expandChart` props (see §13). |
| `DatasetEditor` | keep | Preserve paste-parser (`parsePaste`, tab/comma/space detection). |
| `FieldRenderer` | keep | Schema-driven inputs (text/number/enum/boolean/date/multiline/duration). |
| `TimeSeriesChart` | keep | Recharts; add a fullscreen/expand affordance (see §13/§20). |
| `Badge` | extend | Add `green`/`orange`/`yellow` variants; keep `blue`/`gray`/`red`. |
| `StatusDot`/`statusStyle` | new/extend `profileStatus` | Single mapping used everywhere. |
| `Splitter` | extract | Reusable drag handle wrapping `beginGesture`. |
| `TabBar` | new | Horizontal (Admin tabs) and vertical variants. |
| `FilterBar` | new | Sort/filter controls for Sync (standard/date/type/status). |
| `DiffView` | new | Wraps `ProfileCard`; highlights changed fields (old strikethrough red, new green/orange). Reuses existing `renderDynamicDiff` logic from `App.tsx`, generalized. |
| `Icon` | new | lucide-react wrapper: `<Icon name="pin" size={14}/>` at stroke 1.75. |
| `EmptyState`/`LoadingSpinner`/`ErrorBanner`/`EmptyWorkspaceNotice` | keep | Standard states. |
| Dialogs (`RejectReasonModal`, `DeleteConfirmDialog`, `ImportOverwriteDialog`) | keep, restyle | Replace remaining `alert()`/`confirm()` with in-app dialogs (Electron blocks `prompt`, and native dialogs are jarring). |

---

## 11. Docking System (VS Code-like)

Panels are **resizable, collapsible, closable** and never fully disappear.

- **Split model:** two zones separated by a `Splitter`. Zones have min widths; the splitter
  is always reachable. The Browser already implements this (Miller │split│ Info+Pins with a
  collective slider + internal weighted splitters). Generalize to `DockRow`.
- **Panel header:** title (left) + actions (right): **collapse** (to a thin vertical bar,
  `COLLAPSED_W=40`), **close** (context-dependent: unpin / hide), optional **expand**.
- **Pinned profiles:** open as additional weighted panels to the right of the Info panel;
  equal width by default, individually resizable via internal splitters (redistribute, no
  overflow), collapsible, removable. (Current behavior — keep.)
- **Multi-window (approved):** a **"Open in new window"** action (Browser toolbar + a pinned
  panel's menu) opens a **second native Electron window** rendering a standalone Browser,
  optionally pre-selected on a standard. Lets the engineer put different standards on
  different monitors. See §26/implementation for the IPC.

---

## 12. Miller Browser Specification

- **Columns, left→right, equal width**, driven by the global Miller width (flex-1 +
  `COL_MIN` min → horizontal scroll only when very deep). Greyed tone vs the info panel.
- **Column 1 = Standards** (both Browser and Edit). Row: label + organization + roll-up
  status dot + chevron. Selecting a standard resets the path and reveals its root nodes.
- **Node columns:** row = code (mono) + label + "has-profiles" dot + chevron (if children).
  Selecting a node reveals its children column; a leaf reveals its **Profiles** column.
- **Profiles column** (Browser & Edit): profile rows with status badge + point count + pin
  action (Browser) / open-to-edit (Edit).
- **Selection:** strong blue (`bg-blue-600 text-white`).
- **Edit mode (Edit database & Taxonomy):** **every column has a `+` row at its bottom**:
  - Standards column → **"+ New standard"**.
  - Node columns → **"+ New node here"** (adds a child at that level).
  - Leaf/profiles column → **"+ New profile"** (Edit) — taxonomy mode instead shows
    **"Customize expected fields"** at the end of a branch.
- **Read vs edit** differ only by affordances (the `+` rows, inline node actions), never by
  layout — same component, same spacing.

ASCII (Browser, read mode):
```
┌ Standards ┬ Methods ─┬ Procedures ┬ Zones ───┬ Profiles ─┐║ Information ─────────────┐
│●MIL-810H ▸│ 507 Hum ▸│ I  Induced▸│ B3 Hot  ▸│ Cycle A ★ │║ [Profile Card / Node]   │
│○STANAG…  ▸│ 501 Heat▸│ II Nat.    │ B2 …     │ Cycle B   │║  chart ▸ expand         │
│           │          │            │          │ +New(edit)│║  fields · table         │
└───────────┴──────────┴────────────┴──────────┴───────────┘║  [Pin]      + pinned →  │
   greyed structure (equal-width, scroll when deep)   split↕  higher-contrast content
```

---

## 13. Profile Card Specification

**Single component (`ProfileDetail`) used in Browser, Edit, Creation, Review, Comparison,
Admin.** Layout is visually identical regardless of standard — only content is dynamic.

- **Header:** name + **status badge** (yellow/orange/green) + **"last modified by"** line.
- **Field groups** (dynamic, by `schema.fields[].group`): Identification, Test Conditions,
  Procedures, Acceptance Criteria, References, Notes, Custom. Empty groups are hidden. Label
  = grey, value = high-contrast, unit appended.
- **Data view toggle:** `chart | table | both` (default `both`).
- **Chart:** `TimeSeriesChart` inside the card; add an **expand** control (fullscreen
  overlay) for detailed inspection. Series colors from the existing auto palette.
- **Table:** zebra rows, mono numeric cells, columns where `axis !== 'none'`.
- **Diff mode (Sync & Admin):** same card, with changed fields highlighted — previous value
  struck-through in **red/neutral**, new value in **yellow** (local) or **orange** (pending)
  or **green** (approved), matching the object's status. Reuse/lift `renderDynamicDiff`.
- **Never assume fields exist.** The card renders whatever the standard's schema defines.

---

## 14. Browser Page

- **Toolbar:** logo·name (left) · **global search** (scans all DB text — see below) ·
  **Manage** button (right, hidden for `readonly`).
- **Body:** `MillerBrowser` (standards→nodes→profiles) │ collective splitter │ **Info panel**
  (node info when a node is selected; **Profile Card** when a profile is selected) +
  **pinned comparison cards**. Neither Miller nor Info can vanish; splitter always reachable.
- **Search:** already scans all fields of the active standard (labels, codes, descriptions,
  tags; profile name/description/author/status, **all field values and all dataset cells**).
  Results view = Nodes section + Profiles section; click navigates / opens; pin from results.
  (Cross-standard search = future, §26.)
- **Footer:** version · credits.
- **"Open in new window"** in the toolbar (multi-window).

---

## 15. Management Pages

**Shell:** left rail (Home/Edit/Sync/Settings/Admin) + `AppFrame`. Header shows the current
page title, the **repo badge** (Standalone / Shared / Offline) and the **role badge**.

**15.1 Home** — landing that *explains the app* and shows identity:
- "You are **{role}**" (Read Only / Write / Admin), the **Git repository link**, the
  **session name** (read-only).
- Short "What you can do" cards linking to Edit / Sync / Settings / Admin (gated by role).
- Persistent **"← Browser"** top-left.

**15.2 Edit database** — profiles + taxonomy behind a gear toggle:
- **Profile mode (default):** `MillerBrowser` (editable, `+` rows) │ **Profile editor**
  (`ProfileForm` + `DatasetEditor` paste-parser + **live preview**: chart/table/fields).
  End of a branch → **"+ New profile"**; existing profiles are editable.
  **Save / Cancel** clearly visible, in a fixed action zone (top-right of the editor).
- **Taxonomy mode (gear icon, per selected standard):** same `MillerBrowser` but **editable
  nodes** (add/remove/modify/reorder) with a `+` row per column; a node's end-of-branch
  offers **"Customize expected fields"** (per-node schema: profile fields + dataset columns).
  **Profiles are hidden in this mode.** **Save / Cancel in the same screen zone** as profile
  mode (consistency). Reuse `TaxonomyEditor`'s `NodePropertiesPanel` + `NodeSchemaSection`.
- **Status coherence:** every standard/node/profile shows local(yellow)/pending(orange)/
  official(green) + **"last modified by"**.

**15.3 Synchronization** — the missing dedicated page. Shows **all** changes:
```
┌ Standards ───────┬ Taxonomy (by std) ┬ Profiles (by std) ┐│ Comparison ───────────┐
│ ☐ +Add  ○local   │ ☐ MIL-810H  ●pend │ ☐ Cycle A  ○local ││ ProfileCard / DiffView│
│ ☐ ~Info ●pending │ ☐ STANAG    ○local│ ☐ Cycle B  ●pend  ││ old → new highlighted │
│ ☐ −Del           │                   │                   ││                       │
│ Filter/Sort: standard · date · type · admin-status        ││ [Send to admin]       │
└──────────────────┴───────────────────┴───────────────────┘└───────────────────────┘
```
- Three grouped columns: **Standards** (add / info-modify / delete), **Taxonomy** (per
  standard), **Profiles** (per standard). Built from `localStagedChanges` + `syncEvents`
  (existing) and status.
- **Filter & sort** by standard, date, modification type, admin/review status.
- Click an object → **Comparison panel** on the right, reusing the **Profile Card layout**
  with **change highlighting** (previous vs current).
- Each object has a **checkbox, unchecked by default.**
- A **"Send modifications to admin"** button lives in the **same action zone** used for Save
  in Edit; it calls the existing `submitCommit` on the checked items. Pushed objects switch
  visual to **pending (orange)**. (Replaces the current `SubmitChangesModal` + sidebar
  button; same underlying store action.)

**15.4 Settings:**
- **Data:** Import DB JSON; **Export merged** DB JSON (local + online combined); **Export
  online-only** DB JSON (convert the central repo state to JSON). (Merged/import exist; the
  online-only export is the new option — read the synced records and serialize.)
- **Git repository location:** editable path (`gitRepoPath`).
- **Session name:** shown, **read-only**.
- **Version + credits.**
- Keep per-card actions (no global Save) — but restyle to the new system.

---

## 16. Synchronization Page

Covered in §15.3. Design rules that make it correct:
- Same **Profile Card** and **field placement** as creation — the comparison must look like
  the editor with old/new overlaid, so engineers recognize fields instantly.
- Modified fields highlighted; unchanged fields muted.
- Grouping and filters reduce cognitive load on large change sets.
- The action zone (Send-to-admin) is spatially consistent with the Save zone elsewhere.

---

## 17. Admin Pages (admin only) — single page, three tabs

- **Tab 1 — Review submissions** (`AdminValidationsPage` restyled):
  - **Standard change:** add / delete / modify with the **same fields as creation**,
    color-coded to show what changed (+ previous state).
  - **Taxonomy change:** the **same view as Edit's taxonomy mode but read-only** (no add),
    color-coding what this push changes.
  - **Profile change:** show the **taxonomy location** it attaches to + before/after
    **DiffView** (color-coded).
  - **Resolve conflicts** between two pushes touching the same object; **Approve / Reject**
    (Reject requires a reason — existing `RejectReasonModal`). Uses existing
    `resolveSingleChange`.
- **Tab 2 — History (Git tree):** GitHub-style commit tree to see *what changed, when, by
  whom, across versions*. **Data source:** the local `isomorphic-git` history that
  `gitService` already writes on submit/approve (read-only via a new IPC `git:log`), and/or
  the `approvedHistory` + `syncEvents` timeline. This tab is **read-only** over Git — no Git
  logic is modified. If a full graph is out of reach initially, ship a linear
  time-ordered commit list first (documented as progressive).
- **Tab 3 — Connected users** (`AccountManagementPage` restyled): every session that pulled
  or pushed; per-user role toggles **Read Only / Write / Admin**. (Internally the roles stay
  `readonly | testing | admin`; **relabel `testing` → "Write"** in the UI only, to avoid
  touching `access.json`.) Default is Read Only.

---

## 18. Settings Page

Covered in §15.4. Reuses `Card` + the new toolbar/typography. The only **new capability** is
**"Export online-only JSON"** (serialize the synced central records); it reads existing data
and writes a file via the existing download helper — no sync/Git change.

---

## 19. Icons (lucide-react)

Adopt **lucide-react** (add to `package.json`). One `<Icon>` wrapper, stroke ~1.75, sizes
14/16/18. Replace every emoji/Unicode glyph:

| Current glyph | Meaning | lucide |
|---|---|---|
| 📌 | pin/compare | `Pin` / `PinOff` |
| ✕ | close/remove | `X` |
| ⚙ | settings / gear (taxonomy) | `Settings` |
| 🔧 | admin validations | `ShieldCheck` |
| 👥 | users | `Users` |
| 📤 | push | `UploadCloud` |
| ◀ / ↗ | back / open | `ArrowLeft` / `ExternalLink` |
| ▸ / › | expand / breadcrumb | `ChevronRight` |
| – | collapse | `Minus` / `PanelRightClose` |
| ◧ ≡ | library / standards | `SquarePen` / `ListTree` |
| 🔍 (SVG) | search | `Search` |
| ＋ | add row/node/standard | `Plus` |
| ✓ / ❌ | approve / reject | `Check` / `X` |
| (new) | git history | `GitBranch` / `GitCommit` |
| (new) | new window | `Copy` / `AppWindow` |

CSP note: lucide renders inline SVG — compatible with the app's strict CSP and offline use.

---

## 20. Animations

- **Functional only.** `transition-colors`/`transition-all` at **120–150ms** on hover,
  selection, resize-handle highlight. No bounce, no spring, no decorative motion.
- Chart **expand** = simple fade/scale of an overlay.
- Column reveal in Miller = instant (Finder-like); keep the existing scroll-to-newest-column.
- Respect `prefers-reduced-motion` (disable non-essential transitions).

---

## 21. Interaction Rules

- **One selection color (blue) everywhere.** One hover treatment. One focus ring
  (`ring-2 ring-blue-500`).
- **Resize:** handles are 6px, always reachable, hover-blue; panes never fully collapse
  (min widths); off-window `mouseup` is handled (existing `beginGesture` `AbortController`).
- **No native `alert`/`confirm`/`prompt`** in the redesign — use in-app dialogs (Electron
  blocks `prompt`; native dialogs break the visual language). Replace the remaining `alert`
  in `AdminValidationsPage` and `confirm` in `LibraryPage`.
- **Save/Cancel placement is consistent** across Edit (profiles), Edit (taxonomy) and Sync
  (Send-to-admin) — same on-screen action zone.
- **Destructive actions** (delete node/profile/standard, reject) are red and confirmed.

---

## 22. Accessibility

- Status = **color + text/dot**, never color alone.
- Focus-visible rings on all interactive elements; logical tab order.
- `aria-label` on icon-only buttons (pin, close, collapse, resize).
- Keyboard: Miller arrow-key navigation (←/→ between columns, ↑/↓ within) — target for a
  later phase; at minimum all controls are tab-reachable.
- Contrast: body text ≥ 4.5:1; the "greyed" tree still meets ≥ 4.5:1 for text (grey is a
  *surface/secondary* cue, not low-contrast text).
- Dialog focus trapping + `Esc` to close.

---

## 23. Empty States

Reuse `EmptyState` / `EmptyWorkspaceNotice`:
- **No standard selected** (Browser/Edit): prompt to pick a standard (col 1).
- **Empty workspace** (offline / empty repo / builtin not loaded): existing
  `EmptyWorkspaceNotice` (3 diagnostics).
- **Node without profiles:** "No profiles on this node" (+ "+ New profile" in Edit).
- **No local changes** (Sync): "Everything is synchronized."
- **No pending submissions** (Admin): calm empty state (retire the festive 🎉 card).
- **No sessions yet** (Users): explain sessions appear after first sync.

## 24. Loading States

- `LoadingSpinner` for first bootstrap and async loads.
- **Skeleton rows** for Miller columns and lists while `useLiveQuery`/`useProfilesByStandard`
  resolve (avoid layout jump). Charts show a subtle placeholder while data resolves.
- Long sync operations show a non-blocking indicator in the repo badge, not a modal.

## 25. Error States

- `ErrorBanner` for recoverable errors; the existing `syncError` banner for sync/IPC
  failures (already surfaces `{success:false}` from the store).
- Per-field validation errors via `FieldRenderer` (red border + message).
- Add a top-level **Error Boundary** (missing today) so one render error can't white-screen
  the app — wrap `main.tsx` and each heavy page.

---

## 26. Future Extensibility

- **Independent Miller per pinned profile** (deferred by decision) — the `DockPanel`/pin
  model is designed to host it later.
- **Cross-standard global search** (today: active standard only).
- **Full Git graph** in Admin Tab 2 (start linear, evolve to a branch/merge tree).
- **Keyboard-first Miller navigation.**
- **Dark theme** — because color is centralized (§8) and surfaces are tokenized, a dark
  variant is a token swap, not a rewrite.

---

## 27. Non-Regression Constraints

**Must NOT change (hard):**
- Business logic in `src/core/engine/*` (profile/migration/import-export/dataIntegrity,
  `getEffectiveSchema`, `buildTree`, `validateProfile`, `buildProfileFromDraft`).
- Repositories in `src/core/db/repositories/*` and the **Dexie schema/stores**.
- The **sync protocol** and **Git logic** in `electron/gitService.ts` (file-copy "pull/push",
  rejection/deletion markers, roles/sessions), and `submitCommit`/`triggerGitSync`/
  `resolveSingleChange`/`applyRejections`/`applyDeletions` in `appStore.ts`.
- The **IPC contract** (`src/shared/electronBridge.ts` ↔ `electron/preloads.ts` ↔
  `electron/main.ts`) — kept in sync by the existing contract test.
- Zod schemas' **meaning** (only additive/label changes allowed).

**Sanctioned exceptions (approved scope):**
1. **Multi-window** — *add* an IPC (e.g. `window:open-browser`) + `main.ts` handler creating
   a second `BrowserWindow` loading the same renderer (query param selects the view/standard).
   Purely additive; no existing logic touched. Reflect in `electronBridge`/`preloads` and the
   contract test.
2. **Edit-freeze fix (node images as files)** — the highest-risk item, done **last** as its
   own phase:
   - Node images move from inline base64 (`imageData`) to **file references** (`./images/…`),
     like the build-time extraction already applied to `database.json`.
   - `TaxonomyEditor` upload writes the image via a new IPC to the workspace and stores a
     **path**; sync (`gitService`) must copy image files alongside JSON; a one-time
     **migration** rewrites existing base64 to files (mirror of the extraction script).
   - `imageData` stays `string?` (path *or* data-URI both accepted) — schema stays valid.
   - This removes the multi-MB sync-event payloads that freeze editing (already partially
     mitigated by `standardSyncSummary` in `schema.ts` and `previewSafe` at render).

**Reuse, don't reinvent:** `appStore` actions & state, all repositories, all engines, the
Miller/resize code, `ProfileDetail`, `TimeSeriesChart`, `DatasetEditor`, `FieldRenderer`,
status/preview utils, existing dialogs.

---

## Implementation Mapping & Phasing (for the build that follows this spec)

**Critical files to touch (presentation only, unless noted):**
- `src/shared/components/**` — new primitives (`AppFrame`, `MillerBrowser`, `Splitter`,
  `TabBar`, `FilterBar`, `DiffView`, `Icon`, `StatusDot`), extend `Badge`, extend
  `profileStatus.ts` → `statusStyle()`.
- `src/App.tsx` + `src/app/Sidebar.tsx` — new Management shell (rail Home/Edit/Sync/Settings/
  Admin), unified role gate `src/shared/roles.ts`, `AppFrame` on both modes.
- `src/features/assistant/AssistantPage.tsx` — Browser toolbar (logo/name/footer), extract
  Miller, add "Open in new window".
- `src/features/**` — reorganize Library+Standards into **Edit** (gear toggle), create
  **Sync** page (from `SubmitChangesModal` + `localStagedChanges`), **Home**, **Admin**
  (tabs wrapping validations + accounts + new History).
- English translation pass across all `src/**` UI strings.
- lucide-react added to `package.json` (build dependency).
- **Exceptions:** `electron/main.ts` + `preloads.ts` + `electronBridge.ts` for multi-window
  (`git:log` read for History; `window:open-browser`); the node-image workstream touches
  `TaxonomyEditor`, `gitService`, and adds a migration.

**Suggested phase order (each shippable, CI-green before the next):**
1. **Design system**: colors (§8) + `statusStyle` unified, typography, spacing, lucide
   `Icon`, `Badge` variants, `AppFrame` (logo/name/footer everywhere), English pass. Low risk.
2. **Browser polish**: extract `MillerBrowser`, apply tokens, greyed tree, status roll-ups.
3. **Management shell**: rail Home/Edit/Sync/Settings/Admin, unified gate, Home page.
4. **Edit database**: merge Library+Standards, gear toggle, `+` rows per column.
5. **Synchronization page**: replace modal, comparison via `DiffView`.
6. **Admin**: tabs (Review restyle, Users restyle→Write label, History read-only `git:log`).
7. **Multi-window** (IPC + second `BrowserWindow`).
8. **Edit-freeze fix** (node images → files + migration + sync copy). Highest risk, last.

**Verification per phase:**
- `npm run typecheck` (app + electron) and `npm test` green (CI already runs both on push).
- Contract test stays green whenever IPC changes (phases 6–8).
- Manual: rebuild `MIL-Browser-Setup-<version>.exe`, verify the phase's screens; for phase 8,
  test taxonomy image upload → submit → pull on a second machine, and confirm editing a
  profile whose standard has images no longer freezes.
- Non-regression smoke: browse → pin/compare → search; create/edit profile → send to admin →
  approve/reject; role gates (use `MIL_BROWSER_USER` to impersonate).
