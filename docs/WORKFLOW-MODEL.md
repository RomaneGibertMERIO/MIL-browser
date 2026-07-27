# MIL-Browser — Collaboration & Workspace Model

Reference for how the app behaves **online vs offline vs standalone**, what each
role may do, and how local edits flow to the shared repository. This is the
single source of truth for the sync/permission UX. (Presentation-level rules;
the real write/validation gate is enforced by the Electron main process from the
non-forgeable Windows account.)

---

## 1. The three operational states

The state is derived from **the repository configuration and its reachability**,
never guessed from anything else.

| State | Condition | `repoMode` / `isOffline` | Badge |
|---|---|---|---|
| **Standalone** | no repository path configured | `local` | grey *Standalone* |
| **Online** | path configured **and** last sync succeeded | `shared`, `!isOffline` | green *Shared* |
| **Offline** | path configured **but** last sync failed / unreachable | `shared`, `isOffline` | orange *Offline* |

`online` (used for gating) = **`repoMode === "shared" && !isOffline`**.

**Standalone** = *your own local database*. You are effectively the admin of your
machine. Full control, entirely offline, no collaboration surfaces.
**Online** = collaboration is live; the central repository is the source of truth.
**Offline** = you keep working on the **last synced state**; collaboration is
**paused** until you reconnect.

---

## 2. What you can do, by state

| Rail destination | Standalone | Online | Offline |
|---|---|---|---|
| **Home** | ✓ | ✓ | ✓ |
| **Edit database** (Profiles / Taxonomy) | ✓ | ✓ (Write+) | ✓ (edits last-synced) |
| **Synchronization** (push) | **hidden** | ✓ (Write+) | **hidden** |
| **Settings** | ✓ | ✓ | ✓ |
| **Admin** (review/approve) | **hidden** | ✓ (Admin) | **hidden** |

**Sync and Admin exist only when online** — there is no one to push to or validate
with otherwise. They are *hidden from the rail* (and the router redirects to Home
if the active view becomes inaccessible), instead of being shown then failing.

---

## 3. Roles (Online only)

Roles come from `admins.json` / `access.json` in the central repo (read by the
main process). **Absent file ⇒ everyone is Admin** (deliberate: the app stays
usable until access control is set up).

| Internal role | UI label | May |
|---|---|---|
| `readonly` | **Read Only** | browse, read; set the repo path |
| `testing` | **Write** | + edit locally, push proposals (Sync) |
| `admin` | **Admin** | + review / approve / reject (Admin) |

**In Standalone the role is forced to `admin`** (it's your machine), but Sync and
Admin are still hidden — there is nothing to sync or validate.

---

## 4. Content visibility (which standards / profiles are shown)

Three families, one principle: **Built-in is the base and is always visible; your
local drafts are always visible; the repository's official content shows only
when connected.**

| Family | Standalone | Online / Offline | Badge |
|---|---|---|---|
| **Built-in** (ships with the app) | ✓ | ✓ | grey **Built-in** |
| **Local** (your unpushed drafts) | ✓ | ✓ | yellow **Local** |
| **Official / Pending** (from the repo) | **hidden** | ✓ | green **Official** / orange **Pending** |

- Standards use the `workspace` field (`local` / `shared`).
- Profiles have no `workspace` field, so visibility is derived from
  `source` + `status`: standalone shows `source==="builtin"` or `status==="local"`.

---

## 5. Actions & their side-effects

| Action | Standalone | Online | Offline |
|---|---|---|---|
| **Edit / create** a standard, taxonomy, or profile | saved locally; marked **Local** | saved locally as a **Local** draft, ready to push | same as Online (push later) |
| **Edit a Built-in** | forks it into **your Local copy** (`isBuiltin=false`, status `local`); the badge flips Built-in → Local | same | same |
| **Delete** | **purely local** — no tombstone, no propagation, sync journal purged | local delete **+ tombstone** → proposes removal on next push | tombstone queued for next online push |
| **Push** (Synchronization) | **N/A** (hidden; the action is refused) | each item → **Pending**, sent to the repo | **N/A** (hidden; refused) |
| **Approve / Reject** | **N/A** | Admin only | **N/A** |

**Built-in deletion** is allowed; the built-in base is re-installed **only if you
delete everything** (empty-DB safety net).

---

## 6. Transitions

- **Standalone → Online** (you configure a reachable repo): the repo's official
  content appears alongside your Built-in base and your **Local** drafts. Your
  drafts are **not** auto-pushed and **not** overwritten — you choose what to push
  from the Synchronization page.
- **Online → Offline** (repo becomes unreachable): you keep the last synced state;
  Sync and Admin disappear; a *Offline* badge explains why. New edits accumulate
  as Local drafts and push once you're back online.
- **Online/Offline → Standalone** (you clear the repo path): the Built-in base is
  re-installed if it had been replaced by the repo; official content disappears
  (it belongs to the repo); your Local drafts remain.

---

## 7. Known follow-up (not yet implemented)

- **Empty-repository baseline (confirmation).** Today the first client to reach an
  *empty* repo auto-publishes the whole Built-in baseline to it. The agreed target
  is to make this an **explicit, confirmed** action ("Publish the built-in
  standards as the shared baseline?") on the Synchronization page, rather than a
  silent side-effect of the first sync. To be delivered with the Synchronization
  page rebuild (Phase 5). Until then, the new visibility model already ensures a
  connected user is never left empty-handed (the Built-in base stays visible).
