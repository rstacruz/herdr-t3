// Space labels: set from a space's menu (the t3-labels dialog), filtered by in the Spaces list and the Inbox. One
// source in shared/, copied by scripts/sync.sh into each mod that uses it (t3-spaces, t3-inbox, t3-labels).
// A machine's labels live in a file in its home, as space-folders' do, so every screen showing its spaces shows the
// same: { of: { spaceId: [label] }, at }, with space ids as that machine knows them. While this runs, shared state
// holds them per machine ("" is this computer), so the list and the dialog see a change at once.
// A terminal's labels are another thing (labels.js); this module keeps the name to itself, so a mod with both can hold both.
import { exec, shared, setShared } from "herdr";

const FILE = "~/.config/herdr-space-labels.json";
const SPACE_LABELS = "space-labels";
const all = () => shared(SPACE_LABELS) ?? {};
const localId = (s) => (s.machine ? s.id.slice(s.machine.length + 1) : s.id);

export const labelsOf = (s) => all()[s.machine ?? ""]?.of?.[localId(s)] ?? [];

// Every label some space has now, sorted.
export const knownLabels = (sp) => [...new Set(sp.flatMap(labelsOf))].sort((a, b) => a.localeCompare(b));

// Each machine's file (null: this computer), taken when newer than what's shown: another screen wrote it.
export const loadLabels = async (machines) => {
  for (const m of machines) {
    const r = await exec("sh", ["-c", `cat ${FILE} 2>/dev/null`], { on: m }).catch(() => null);
    let read;
    try { read = JSON.parse(r?.stdout ?? ""); } catch { continue; }
    const now = all()[m ?? ""];
    if (read && (!now || (read.at ?? 0) > (now.at ?? 0))) setShared(SPACE_LABELS, { ...all(), [m ?? ""]: { of: read.of ?? {}, at: read.at ?? 0 } });
  }
};

export function saveLabels(s, labels) {
  const m = s.machine ?? "", of = { ...(all()[m]?.of ?? {}) };
  if (labels.length) of[localId(s)] = labels;
  else delete of[localId(s)];
  const next = { of, at: Date.now() };
  setShared(SPACE_LABELS, { ...all(), [m]: next });
  exec("sh", ["-c", `mkdir -p ~/.config && printf '%s\\n' "$1" > ${FILE}.tmp && mv ${FILE}.tmp ${FILE}`, "sh", JSON.stringify(next)], { on: s.machine })
    .catch(() => null);
}
