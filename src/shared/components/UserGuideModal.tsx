/**
 * UserGuideModal — the in-app user manual, shown as a full-screen overlay.
 *
 * Opened from the native application menu (Help → User Guide, F1) via the
 * `menu:open-user-guide` channel (see electron/main.ts + preloads.ts). Rendered
 * from AppFrame so it is available in BOTH the Browser and the Management shell,
 * and closes back to wherever the user was — no navigation change, no extra rail
 * entry. All content is English (front-end hard rule) and fully offline (no
 * external assets), so it works on an isolated lab machine.
 *
 * Left column: a table of contents that scrolls the right column to each section.
 * Right column: the manual, split into self-contained sections.
 */
import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import type { ReactNode } from "react";
import { Icon } from "./ui/Icon";

const SECTIONS: { id: string; title: string }[] = [
  { id: "overview", title: "What is MIL-Browser" },
  { id: "workspaces", title: "The two workspaces" },
  { id: "modes", title: "Standalone vs Shared" },
  { id: "roles", title: "Roles & permissions" },
  { id: "colors", title: "Status & change colours" },
  { id: "browsing", title: "Browsing the catalog" },
  { id: "editing", title: "Editing the database" },
  { id: "sync", title: "Synchronization" },
  { id: "admin", title: "Admin: review, history, users" },
  { id: "deleting", title: "Deleting content" },
  { id: "offline", title: "Offline & data safety" },
  { id: "settings", title: "Settings & data" },
  { id: "workflow", title: "Typical workflow" },
  { id: "faq", title: "Troubleshooting & FAQ" },
];

export function UserGuideModal({ onClose }: { onClose: () => void }) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Fermeture par Échap.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const goTo = (id: string) => {
    const container = scrollRef.current;
    const el = container?.querySelector<HTMLElement>(`#guide-${id}`);
    el?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="User guide"
      onMouseDown={onClose}
    >
      <div
        className="flex h-[94vh] w-full max-w-[160rem] flex-col overflow-hidden rounded-xl bg-white shadow-2xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex flex-shrink-0 items-center gap-3 border-b border-gray-200 px-6 py-4">
          <Icon name="book" size={20} className="text-blue-600" />
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-semibold text-gray-900">MIL-Browser — User Guide</h2>
            <p className="text-xs text-gray-400">Environmental Testing Knowledge Base · v{__APP_VERSION__}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close user guide"
            className="rounded-md p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700"
          >
            <Icon name="close" size={18} />
          </button>
        </div>

        <div className="flex min-h-0 flex-1">
          {/* Table of contents */}
          <nav className="hidden w-64 flex-shrink-0 overflow-y-auto border-r border-gray-200 bg-gray-50 p-3 md:block">
            <p className="px-2 pb-2 text-[11px] font-semibold uppercase tracking-wider text-gray-400">
              Contents
            </p>
            <ul className="space-y-0.5">
              {SECTIONS.map((s, i) => (
                <li key={s.id}>
                  <button
                    type="button"
                    onClick={() => goTo(s.id)}
                    className="flex w-full items-baseline gap-2 rounded-md px-2 py-1.5 text-left text-[1.05rem] text-gray-600 transition-colors hover:bg-blue-50 hover:text-blue-700"
                  >
                    <span className="text-[11px] font-mono text-gray-300">{i + 1}</span>
                    <span>{s.title}</span>
                  </button>
                </li>
              ))}
            </ul>
          </nav>

          {/* Content */}
          <div ref={scrollRef} className="min-w-0 flex-1 overflow-y-auto px-8 py-6">
            <div className="mx-auto w-full max-w-[110rem] space-y-10 pb-16">
              <GuideBody />
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

// ---------------------------------------------------------------------------
// Presentational helpers
// ---------------------------------------------------------------------------

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={`guide-${id}`} className="scroll-mt-4">
      <h3 className="mb-3 border-b border-gray-100 pb-1.5 text-[1.35rem] font-semibold text-gray-900">{title}</h3>
      <div className="space-y-3 text-[1.05rem] leading-relaxed text-gray-600">{children}</div>
    </section>
  );
}

function P({ children }: { children: ReactNode }) {
  return <p>{children}</p>;
}

function UL({ children }: { children: ReactNode }) {
  return <ul className="list-disc space-y-1.5 pl-5 marker:text-gray-300">{children}</ul>;
}

function OL({ children }: { children: ReactNode }) {
  return <ol className="list-decimal space-y-1.5 pl-5 marker:text-gray-400 marker:font-semibold">{children}</ol>;
}

function B({ children }: { children: ReactNode }) {
  return <span className="font-semibold text-gray-800">{children}</span>;
}

function Tip({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-start gap-2 rounded-lg border border-blue-200 bg-blue-50 p-3 text-[1.05rem] text-blue-900">
      <Icon name="info" size={16} className="mt-0.5 flex-shrink-0 text-blue-500" />
      <div className="space-y-1">{children}</div>
    </div>
  );
}

/** Coloured status/change chip used in the "colours" legend. */
function Chip({ tone, label }: { tone: string; label: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[0.9rem] font-semibold ${tone}`}>
      <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />
      {label}
    </span>
  );
}

/**
 * Capture d'écran + légende. Les fichiers vivent dans public/help/ (copiés tels
 * quels dans dist/ par Vite) et sont référencés en chemin relatif, comme le
 * favicon. Si un fichier manque, `onError` masque la figure au lieu d'afficher
 * une image cassée — le manuel reste propre même sans toutes les captures.
 */
function Figure({ src, alt, caption }: { src: string; alt: string; caption: string }) {
  return (
    <figure className="my-2 overflow-hidden rounded-lg border border-gray-200 shadow-sm">
      <img
        src={src}
        alt={alt}
        loading="lazy"
        className="block w-full"
        onError={(e) => {
          const fig = e.currentTarget.closest("figure");
          if (fig instanceof HTMLElement) fig.style.display = "none";
        }}
      />
      <figcaption className="border-t border-gray-100 bg-gray-50 px-3 py-2 text-[0.9rem] text-gray-500">
        {caption}
      </figcaption>
    </figure>
  );
}

// ---------------------------------------------------------------------------
// Manual content
// ---------------------------------------------------------------------------

function GuideBody() {
  return (
    <>
      <Section id="overview" title="What is MIL-Browser">
        <P>
          MIL-Browser is a desktop application for browsing, editing and sharing environmental
          test standards (MIL-STD / STANAG families) and the test <B>profiles</B> derived from
          them. Each standard is organised as a <B>taxonomy</B> (a tree of methods, procedures,
          zones, conditions…) and a profile is a concrete test configuration attached to a leaf
          of that tree, with a set of fields and an optional time-series dataset (shown as a
          chart and a table).
        </P>
        <P>
          The application works fully on its own (<B>Standalone</B>) and can also connect to a
          shared <B>central repository</B> so a team can propose changes, have them reviewed by
          an administrator, and keep everyone in sync.
        </P>
        <Tip>
          <P>You can reopen this guide at any time from <B>Help → User Guide</B> in the menu bar (shortcut <B>F1</B>).</P>
        </Tip>
      </Section>

      <Section id="workspaces" title="The two workspaces">
        <P>MIL-Browser has two screens; switch between them from the top-left of the window.</P>
        <UL>
          <li>
            <B>Browser</B> — a read-only catalog to explore standards and profiles. This is where
            most people spend their time.
          </li>
          <li>
            <B>Management</B> — where you edit the database, synchronize, and (for admins) review
            submissions. Its left rail lists the available sections; use the <B>← Browser</B>{" "}
            button at the top of the rail to go back.
          </li>
        </UL>
        <Figure
          src="./help/br-ws.png"
          alt="The Browser workspace"
          caption="The Browser: a read-only catalog of standards and profiles. Use Manage (top-right) to open the Management workspace."
        />
        <P>
          The sections shown in the Management rail depend on your role and connection: <B>Edit
          database</B> and <B>Synchronization</B> require the <B>Write</B> role, and <B>Admin</B>{" "}
          requires the <B>Admin</B> role. <B>Synchronization</B> and <B>Admin</B> only appear when
          connected to a central repository.
        </P>
        <Figure
          src="./help/workspaces.png"
          alt="Management screen with the left navigation rail"
          caption="Management: the left rail lists the available sections; use ← Browser (top-left) to return to the catalog."
        />
      </Section>

      <Section id="modes" title="Standalone vs Shared (central repository)">
        <Figure
          src="./help/repo-badge.png"
          alt="Top bar showing the role badge and the repository badge"
          caption="Top bar: your role (e.g. Read-only) and the repository badge (Standalone / Shared / Offline)."
        />
        <P>The badge in the top-right corner always tells you which mode you are in:</P>
        <UL>
          <li>
            <B>Standalone</B> — the app uses only its own local database (the built-in standards
            plus anything you create). Nothing is shared. Everything you make stays on this
            machine.
          </li>
          <li>
            <B>Shared</B> — the app is connected to a central repository (a shared folder) that
            the whole team reads from and proposes changes to.
          </li>
          <li>
            <B>Offline</B> — a central repository is configured but currently unreachable. You keep
            working on the last synchronized state; changes cannot be sent until it is reachable
            again.
          </li>
        </UL>
        <P>
          To connect, open <B>Settings → Git</B>, enter the path of the shared central repository
          folder and click <B>Update Path</B>. The badge switches to <B>Shared</B>, and the{" "}
          <B>Synchronization</B> and (if you are an admin) <B>Admin</B> sections appear.
        </P>
        <Figure
          src="./help/settings-git.png"
          alt="Settings screen with the Git repository path field"
          caption="Settings → Git: enter the central repository path to switch to Shared mode. Data can also be imported here."
        />
        <Tip>
          <P>
            The central repository is the single source of truth. The app never recreates a missing
            central repository on its own — if it cannot find it, it reports <B>Offline</B> and
            refuses to write, rather than silently forking the team's data.
          </P>
        </Tip>
      </Section>

      <Section id="roles" title="Roles & permissions">
        <P>When connected to a central repository, every account has one of three roles:</P>
        <UL>
          <li><B>Read Only</B> — browse the catalog and read everything. Cannot edit or submit.</li>
          <li>
            <B>Write</B> — everything Read Only can do, plus create and edit standards, taxonomy and
            profiles, and submit them for review.
          </li>
          <li>
            <B>Admin</B> — everything Write can do, plus review submissions (approve / reject),
            manage users and roles, and read the shared history.
          </li>
        </UL>
        <P>
          Your identity is your Windows account; it is resolved by the application itself and cannot
          be changed from the interface (it is what signs your submissions). Roles are granted by an
          administrator in <B>Admin → Users</B>. When a brand-new repository has no administrator
          declared yet, access is open until the first admin is set.
        </P>
        <Figure
          src="./help/roles-users.png"
          alt="Admin Users tab listing connected accounts and their roles"
          caption="Admin → Users: every account that has connected, with buttons to set Read Only / Write / Admin."
        />
      </Section>

      <Section id="colors" title="Status & change colours">
        <P>
          Two independent colour systems are used throughout the app; keeping them distinct makes the
          state of any item unmistakable.
        </P>
        <P><B>Status</B> — what an object <em>is</em> (shown in the Browser and the editor):</P>
        <div className="flex flex-wrap gap-2">
          <Chip tone="border-yellow-300 bg-yellow-50 text-yellow-700" label="Local" />
          <Chip tone="border-orange-300 bg-orange-50 text-orange-700" label="Pending" />
          <Chip tone="border-green-300 bg-green-50 text-green-700" label="Official" />
          <Chip tone="border-gray-300 bg-gray-50 text-gray-600" label="Built-in" />
        </div>
        <UL>
          <li><B>Local (yellow)</B> — your draft; created or edited here, not yet sent for review.</li>
          <li><B>Pending (orange)</B> — submitted to the administrator, awaiting a decision.</li>
          <li><B>Official (green)</B> — approved and shared with the whole team.</li>
          <li><B>Built-in (grey)</B> — ships inside the application as the local fallback base.</li>
        </UL>
        <Figure
          src="./help/status-colors.png"
          alt="Browser profiles column showing Pending, Local and Official badges"
          caption="Status badges on profiles in the Browser: Pending (orange), Local (yellow) and Official (green)."
        />
        <P><B>Change type</B> — what a proposal <em>does</em> (shown only in Synchronization and Admin review, in shades of blue):</P>
        <div className="flex flex-wrap gap-2">
          <Chip tone="border-sky-300 bg-sky-50 text-sky-700" label="Created" />
          <Chip tone="border-blue-300 bg-blue-50 text-blue-700" label="Modified" />
          <Chip tone="border-indigo-300 bg-indigo-50 text-indigo-700" label="Deleted" />
        </div>
        <P>
          In a modified item's detail, changed fields are highlighted in blue with the previous value
          struck through; added values appear in light blue and removed ones in indigo.
        </P>
        <Figure
          src="./help/change-colors.png"
          alt="Synchronization list coloured by change type with a highlighted rename"
          caption="Synchronization: each change is coloured Created / Modified / Deleted. Here a rename shows the new name with the old value struck through."
        />
      </Section>

      <Section id="browsing" title="Browsing the catalog">
        <P>
          The Browser uses Miller columns (like a file explorer): pick a <B>standard</B>, then drill
          into its <B>nodes</B>, and finally a <B>profile</B> at the end of a branch. The right side
          shows the selected profile's full details: identification, test conditions, procedures,
          acceptance criteria, references and notes, plus a chart and data table when the profile has
          a dataset.
        </P>
        <UL>
          <li>
            <B>Pins</B> — pin a profile to keep its card open side-by-side with others for comparison.
            Pinned cards can be resized, collapsed or removed.
          </li>
          <li>
            <B>Search</B> — the search box scans everything: node labels and codes, and every profile
            field and dataset cell (including notes and comments). Selecting a result navigates
            straight to it.
          </li>
          <li>
            <B>Multiple windows</B> — open a standard in its own separate window to compare two
            standards at once. Each window is independent and reads the same local database.
          </li>
        </UL>
        <Figure
          src="./help/br-toolbar.png"
          alt="Close-up of the Browser top-right toolbar"
          caption="Top-right toolbar (close-up): Search filters across every field; New window opens a second independent window; Manage switches to the Management workspace."
        />
        <Figure
          src="./help/br-pin.png"
          alt="Close-up of the Pin to compare button and a pinned card"
          caption="Pins (close-up): press Pin to compare on a profile to open it as a card beside another, for side-by-side comparison."
        />
        <Figure
          src="./help/browser-miller.png"
          alt="The Browser with Miller columns, a profile's details and a pinned comparison card"
          caption="The Browser: drill Standards → Methods → Procedures → Zones → Profiles; the right side shows the profile (conditions, chart, dataset) and a pinned card for side-by-side comparison."
        />
      </Section>

      <Section id="editing" title="Editing the database">
        <P>
          Open <B>Management → Edit database</B>. It is a single unified view: one Miller
          (Standards → nodes → profiles) with a contextual panel on the right that adapts to what you
          selected. <B>Save always applies to the object that is currently open.</B>
        </P>
        <Figure
          src="./help/edit-database.png"
          alt="The unified Edit database view with the Miller and the profile editor"
          caption="Edit database: one Miller on the left, the contextual editor on the right (a profile here). Status dots mark Local (yellow) and Official (green) items."
        />
        <P><B>Standards & taxonomy</B></P>
        <UL>
          <li><B>+ New standard</B> — create a standard; it starts as <B>Local (yellow)</B>.</li>
          <li>
            <B>Nodes</B> — select a standard to edit its identity, or a node to edit its properties
            (code, type, label, description) and, at a branch end, to <B>customize expected fields</B>{" "}
            (the fields and dataset columns for profiles under it). You can add child nodes, reorder
            siblings (Up / Down), and add an image to a node.
          </li>
          <li>
            A row holds either child nodes <em>or</em> profiles, never both: profiles appear only on a
            leaf, and a node that already has profiles cannot take children.
          </li>
          <li>
            Taxonomy edits are buffered — use <B>Save</B> / <B>Discard</B> at the top of the panel.
            You cannot delete a node that still has profiles attached; move or delete them first.
          </li>
        </UL>
        <P><B>Profiles</B></P>
        <UL>
          <li>Select a leaf node to reveal its <B>Profiles</B> column, then <B>+ New profile</B>.</li>
          <li>The editor previews the chart, table and fields live as you type. Saving marks it <B>Local</B>.</li>
          <li>
            Editing a <B>built-in</B> profile creates an editable <B>local copy</B>; the original is
            hidden while your copy exists. Use <B>View original</B> to inspect it, or <B>Restore
            built-in</B> to discard your copy and bring the original back.
          </li>
          <li><B>Duplicate</B> makes an independent editable copy of a profile.</li>
        </UL>
        <Tip>
          <P>
            If you try to leave an object with unsaved edits, the app asks before discarding them — you
            never lose work silently.
          </P>
        </Tip>
      </Section>

      <Section id="sync" title="Synchronization: sending changes for review">
        <P>
          Everything you create or edit stays <B>Local</B> until you send it. Open <B>Management →
          Synchronization</B> to see your local changes, grouped by Standards and Profiles and coloured
          by change type (Created / Modified / Deleted). A change appears here immediately, from the
          first action.
        </P>
        <OL>
          <li>Review each change — click one to see exactly what will be sent, with the diff highlighted.</li>
          <li>Tick the changes you want to send.</li>
          <li>
            Click <B>Send to admin</B>. The selected items become <B>Pending (orange)</B> and their
            files are written to the central repository for the administrator to review.
          </li>
        </OL>
        <P>
          Only genuine, unsent local work is listed here. Approved / official items and changes you
          have already sent do not reappear when the app refreshes.
        </P>
        <Figure
          src="./help/sync-send.png"
          alt="Synchronization with two changes ticked and the Send to admin confirmation"
          caption="Tick the changes to submit, then confirm Send to admin. The ticked items become Pending."
        />
      </Section>

      <Section id="admin" title="Admin: review, history, users">
        <P>Administrators get an <B>Admin</B> section with three tabs.</P>
        <Figure
          src="./help/admin-review.png"
          alt="Admin Review with the submission queue and Approve/Reject buttons"
          caption="Admin → Review: the queue is coloured by change type; pick one and Approve (green) or Reject (red). Changed fields show the previous value struck through."
        />
        <UL>
          <li>
            <B>Review</B> — the queue of submissions. Select one to see the change, then <B>Approve</B>{" "}
            (it becomes <B>Official</B> for everyone) or <B>Reject</B> with a reason. The reason is sent
            back to the author, who sees it on their card at the next sync and keeps their work to
            revise and resubmit.
          </li>
          <li>
            <B>History</B> — the shared, read-only audit log: who submitted, approved, rejected or
            deleted what, and when, across all machines.
          </li>
          <li>
            <B>Users</B> — the list of accounts that have connected, with their current role. Change a
            role here. (The app prevents you from removing your own last administrator access, which
            would lock the repository.)
          </li>
        </UL>
      </Section>

      <Section id="deleting" title="Deleting content">
        <P>Deletion behaves differently depending on whether the item is shared:</P>
        <UL>
          <li>
            <B>A local draft</B> (created here, never sent) is simply removed — it never existed for the
            team, so nothing appears in Synchronization.
          </li>
          <li>
            <B>An official or already-submitted item</B> is not erased outright. Deleting it creates a
            <B> deletion request</B> that appears as <B>Deleted</B> in Synchronization; you send it for
            review like any other change. The administrator approves the removal (it is deleted for
            everyone) or rejects it (the item is restored to Official).
          </li>
        </UL>
        <P>This guarantees the shared catalog is never silently emptied by a single machine.</P>
      </Section>

      <Section id="offline" title="Offline & data safety">
        <UL>
          <li>
            If the central repository becomes unreachable, the app goes <B>Offline</B>: you keep the
            last synchronized data and can keep reading, but submitting is disabled until it is
            reachable again.
          </li>
          <li>
            A pull never overwrites your unsent local work: an item you are editing (status
            <B> Local</B>) is preserved even when the same item changes centrally.
          </li>
          <li>
            The built-in standards remain available in every mode, so the application is never empty —
            even with no repository configured.
          </li>
        </UL>
      </Section>

      <Section id="settings" title="Settings & data">
        <P>Open <B>Management → Settings</B>:</P>
        <UL>
          <li><B>Git</B> — set or change the central repository path (this is what switches you to Shared).</li>
          <li><B>Data</B> — import a JSON database. You are asked to confirm before it overwrites existing data.</li>
          <li><B>Session</B> / <B>About</B> — your resolved account and the application version.</li>
        </UL>
      </Section>

      <Section id="workflow" title="Typical workflow">
        <OL>
          <li><B>Read Only user:</B> open the Browser, search or drill down, read profiles, pin a few to compare.</li>
          <li>
            <B>Write user:</B> Edit database → create or adjust a standard / node / profile → Save
            (it is <B>Local</B>) → Synchronization → tick it → <B>Send to admin</B> (it becomes{" "}
            <B>Pending</B>).
          </li>
          <li>
            <B>Admin:</B> Admin → Review → <B>Approve</B> or <B>Reject</B> (with a reason). Approved
            items become <B>Official</B> and reach everyone on their next sync.
          </li>
        </OL>
      </Section>

      <Section id="faq" title="Troubleshooting & FAQ">
        <UL>
          <li>
            <B>I don't see Synchronization or Admin.</B> They require a central repository (connect one
            in Settings → Git) and the right role (Write for Sync, Admin for Admin).
          </li>
          <li>
            <B>My change isn't in Synchronization.</B> Make sure you saved it (it must be <B>Local</B>).
            Items that are already Official or already sent do not appear there.
          </li>
          <li>
            <B>The badge says Offline.</B> The configured repository folder is unreachable. Check the
            path in Settings → Git and that the shared folder is available, then let the app sync again.
          </li>
          <li>
            <B>I edited a built-in item but the original is back.</B> Editing a built-in creates a local
            copy; using <B>Restore built-in</B> discards that copy on purpose.
          </li>
          <li>
            <B>I can't delete a node.</B> It (or a child) still has profiles attached — move or delete
            those first.
          </li>
        </UL>
      </Section>
    </>
  );
}
