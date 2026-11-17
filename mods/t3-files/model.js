// What the Files page knows, apart from drawing it: git's answers parsed, the search filter and ranking, sort order and file kinds.
// check-files.cjs loads this alone.
import { join } from "./file-listing.js";

export const REMOTE_MAX = 1000; // another machine sends at most this many matches, the first it finds; they're ranked here

export const parentOf = (p) => p.includes("/") ? p.slice(0, p.lastIndexOf("/")) : "";
export const nameOf = (p) => p.slice(p.lastIndexOf("/") + 1);
/** The folders above a path, from the top: `a/b/c` → `a`, `a/b`. */
export const ancestors = (p) => { const out = []; for (let at = p.indexOf("/"); at > 0; at = p.indexOf("/", at + 1)) out.push(p.slice(0, at)); return out; };

// The same entries as paths from the space's folder ($2 is the folder's, "" or "src/"), a folder's with a slash, put to Git.
export const IGNORED = 'for p in "$1"/* "$1"/.[!.]* "$1"/..?*; do [ -e "$p" ] || [ -L "$p" ] || continue; n=${p##*/}; [ "$n" = .git ] && continue; if [ -d "$p" ]; then printf "%s%s/\\0" "$2" "$n"; else printf "%s%s\\0" "$2" "$n"; fi; done | git check-ignore --stdin -z; :';
// Before reading a file on another machine: its size, and NULs in its first 8 KB. readTextFile there turns a binary into
// text with U+FFFD and takes up to half a minute to refuse one past 1 MiB.
export const PROBE = 's=$(wc -c < "$1") || exit 1; h=$(head -c 8192 "$1" | wc -c); z=$(head -c 8192 "$1" | tr -d "\\000" | wc -c); echo $s $((h - z))';
// Search on another machine runs there: the whole list would take seconds to come over. Every term in the path, case
// aside, REMOTE_MAX at most. The query goes as an argument, never into the script.
export const REMOTE_SEARCH = `if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then git ls-files -co --exclude-standard -z | tr '\\0' '\\n'; else find . -name .git -prune -o -type f -print | sed 's|^\\./||'; fi | awk 'BEGIN { n = split(tolower(ARGV[1]), t, " "); ARGV[1] = "" } { p = tolower($0); for (i = 1; i <= n; i++) if (!index(p, t[i])) next; print; if (++c >= ${REMOTE_MAX}) exit }' "$1"`;

// `git check-ignore --stdin -z`'s answer: the paths it was given that Git ignores. A folder was asked with a trailing slash.
export function parseIgnored(stdout) {
  return new Set(stdout.split("\0").filter(Boolean).map((p) => p.replace(/\/$/, "")));
}

// A folder's entries, listed again: those Git ignores now (`found`) marked, the others not. Under an ignored folder, nothing
// is asked: everything there is.
export function markIgnored(ignored, rel, entries, found) {
  for (const e of entries) { const p = join(rel, e.name); if (found.has(p)) ignored.add(p); else ignored.delete(p); }
}

/**
 * A folder's entries as file-tree.js's treeRows takes them; ignored status is inherited from every ancestor.
 */
export const folderEntries = ({ entries, ignored }) => (rel) => {
  const list = entries.get(rel) ?? [];
  const dim = Boolean(rel) && [...ancestors(rel), rel].some((p) => ignored.has(p));
  return list.map((e) => ({ name: e.name, dir: e.dir, ignored: dim || ignored.has(join(rel, e.name)) }));
};

// A search's terms: every one must be in the path, case aside.
export const terms = (query) => query.toLowerCase().split(/\s+/).filter(Boolean);
// The candidates a query can start from: the last query's matches while this one only adds to it, else everything.
export const narrows = (query, last) => Boolean(last) && query.startsWith(last);

/**
 * The indexes into `lower` (lowercased paths) whose path holds every term, from `from` (indexes, or null for all).
 * Every CHUNK candidates it awaits `pause()`: past about 100k paths in one go, Herdr interrupts the script.
 * `alive()` false stops it early (a newer query); it then returns null.
 */
const CHUNK = 5000;
export async function filterPaths(lower, words, from, pause, alive = () => true) {
  const out = [], n = from ? from.length : lower.length;
  for (let start = 0; start < n; start += CHUNK) {
    for (let k = start; k < Math.min(n, start + CHUNK); k++) {
      const i = from ? from[k] : k, p = lower[i];
      if (words.every((w) => p.includes(w))) out.push(i);
    }
    if (start + CHUNK < n) { await pause(); if (!alive()) return null; }
  }
  return out;
}

/** The first `limit` matches in the order shown: a path whose file name holds every term first, then the shorter path, then
 *  as text. `words` are terms(). Only those shown are kept in order, and it awaits `pause()` every CHUNK paths as filterPaths
 *  does: sorting a search that matches most of a big repo in one go runs past Herdr's script limit. */
export async function rankPaths(paths, words, limit = Infinity, pause = async () => {}) {
  const before = (a, b) => a.k - b.k || (a.p < b.p ? -1 : a.p > b.p ? 1 : 0), top = [];
  for (let i = 0; i < paths.length; i++) {
    if (i && i % CHUNK === 0) await pause();
    const p = paths[i], name = p.slice(p.lastIndexOf("/") + 1).toLowerCase(), x = { p, k: (words.every((w) => name.includes(w)) ? 0 : 1e7) + p.length };
    if (top.length >= limit && before(x, top[top.length - 1]) >= 0) continue;
    let lo = 0, hi = top.length;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (before(top[mid], x) <= 0) lo = mid + 1; else hi = mid; }
    top.splice(lo, 0, x);
    if (top.length > limit) top.pop();
  }
  return top.map((x) => x.p);
}

// What a file is shown as.
const IMAGES = new Set(["png", "jpg", "jpeg", "gif", "webp", "svg"]);
const extOf = (name) => name.includes(".") ? name.split(".").pop().toLowerCase() : "";
export const kindOf = (name) => IMAGES.has(extOf(name)) ? "image" : /^(md|markdown|mdx)$/.test(extOf(name)) ? "markdown" : "text";

// The Editor's languages that color something (docs/internals/specs/files.md, Editor languages); the rest stay plain.
const LANGUAGES = {
  js: "js", mjs: "js", cjs: "js", jsx: "js", ts: "js", mts: "js", cts: "js", tsx: "js", json: "json", jsonc: "json", yaml: "yaml", yml: "yaml",
  rs: "rust", go: "go", py: "python", sh: "sh", bash: "bash", zsh: "zsh", css: "css", c: "c", h: "c", cpp: "cpp", cc: "cpp", cxx: "cpp",
  hpp: "cpp", java: "java", kt: "kotlin", kts: "kotlin", rb: "ruby", php: "php", sql: "sql", lua: "lua", graphql: "graphql", gql: "graphql",
};
export const languageOf = (name) => /^(gnu)?makefile$/i.test(name) ? "makefile" : LANGUAGES[extOf(name)];

// readTextFile's errors, in a sentence each. Gone (null) is the caller's.
export function readProblem(error) {
  const e = String(error);
  if (e.includes("exceeds 1 MiB")) return "This file is larger than 1 MB, too large to preview.";
  if (e.includes("UTF-8")) return "This is a binary file, so there's no text to show.";
  return "This file can't be read.";
}

// Can't be read is a failure, the error bar's, to retry; too large, binary, gone or not UTF-8 is what the file is.
export const failedRead = (problem) => /can't be read/.test(problem);

// A request's answer is used only if no newer one of its kind was made for the same space since (a file picked after it,
// another refresh): a started exec runs to its end however things moved meanwhile.
export function ticket(st, kind) {
  st.tickets ??= {};
  const n = st.tickets[kind] = (st.tickets[kind] ?? 0) + 1;
  return () => st.tickets[kind] === n;
}
