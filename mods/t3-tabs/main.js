import { View, div, svg } from "gpui-kit";
import { h_flex } from "gpui-base";
import { spaces, panes, agents, terminals, run, openOverlay, focused, notify, theme, window, layout, settings, props, shared, setShared, nextCommand } from "herdr";
import { modStatus, namer, programOf } from "./name.js";
import { notNews, ownStatus, snoozeOf, stillSettled, subAgents, treeStatus } from "./tree.js";
import { statusMark } from "./status-mark.js";
import { tip, glow } from "./tip.js";
import { detailsFor, detailsAt } from "./details.js";
import { programIcon } from "./program.js";
import { focusAgent, focusPane } from "./zoom.js";
import { stopsInit, stopsEnd, stop, focusRoot, within } from "./focus.js";
import { opener, popupOpen, hang } from "./trigger.js";
import { litProp } from "./list.js";
import { sidebarParts } from "./sidebar.js";
import { navigation } from "./navigation.js";
import { newTab, projectMark } from "./project.js";
import { KEY, closedKey } from "./store.js";
import { pinList, pin, unpin, putBack } from "./pins.js";
import { writeLabel } from "./labels.js";
import { openMenu } from "./menu.js";
import { panelState, togglePanel, toggleWide, syncPanel, restorePanel, reviewRepo, layoutNode } from "./panel.js";
import { rememberTerminal } from "./terminal-context.js";
import { stripAt, stripWheel, stripFades } from "./scroll-strip.js";
import { button as drawButton, radiusOf, tint as ghostTint, GROUP_GAP } from "./button.js";
import { nameText, named as namedLabel } from "./measured-text.js";
import { tab } from "./tab.js";

const inboxShown = () => sidebarParts(layout()).stack?.active === "inbox";
// The tab bar's row, as layouts/herdr-t3.json has it.
const ROW_PX = 40;
// A Review bar with `toggle` in its props draws the panel's toggle as its last part, beside its counts: one control, not two.

// What the hidden sidebar's toggle counts, as the selected sidebar shows it. In the Inbox an agent settled there isn't news
// while it stays settled, and a snoozed one, until it wakes, isn't news either, working or done; while it or what's under it
// needs the person it shows there, so it counts here too, unless it was snoozed through that need. In Lists either only loses its done dot.
function awake(st, under, inbox) {
  const now = Date.now(), byAddress = new Map(terminals().map((k) => [k.address, k]));
  return agents().filter((a) => {
    const k = byAddress.get(a.address), s = st(a), nap = snoozeOf(k?.labels?.snoozed), napping = nap.until > now;
    if (!inbox) return !(s === "done" && notNews(k, a.status, under(a.address)));
    return (s === "blocked" && !(napping && nap.held)) || (!stillSettled(k, a.status, under(a.address)) && !napping);
  });
}

const TAB_GAP = 4;
// A tab's name gives way to T3's 144px at most, the active one's to 240px; past that the strip scrolls.
// Unlike T3's, a tab is 96px at least: a short name (`Pi`) left one too small to aim at.
const TAB_FLOOR = 144, TAB_ACTIVE = 240, TAB_MIN = 96;
// A tab around its name: padding, the icon's slot (× covers it hovered, tab.js), the gaps and the end slot its status mark keeps.
const TAB_CHROME = 51;
// With the Inbox, the tools at the right hug their icon and name: padding, the icon's slot and the gap. Their tabs have no status
// mark (docs/adr/0002), so they keep no end slot, which would only ever be empty. Nothing kept empty, they sit flush and evenly against Actions.
const SNUG_CHROME = 32;
// A zoomed tab's pane segment around its name: a tab's padding, icon slot and gap, with no ×. The rule between the Inbox's groups.
const SEG_CHROME = 32, RULE_W = 9;
// With the Inbox showing, the breadcrumb shows whole while it can: the strip beside it gives way first, down to
// nothing (it scrolls), and the names shorten only when the breadcrumb alone is wider than the row; under NARROW, a parent's
// name turns to `…`.
const NARROW = 360;

// The panes you were in, the one you're in first, for Go to's order (T3's recent threads): kept by the `keys` copy, as it
// always shows, so every way of moving counts. A closed pane leaves it.
const RECENT = 30;
function keepRecent() {
  const here = focused()?.pane, open = new Set(panes().map(p => p.pane)), was = shared(KEY.recent) ?? [];
  const next = [...(here ? [here] : []), ...was.filter(p => p !== here)].filter(p => open.has(p)).slice(0, RECENT);
  if (next.length !== was.length || next.some((p, i) => p !== was[i])) setShared(KEY.recent, next);
}

// The widest a tab may be for `wants` to fill `room`: the shorter keep all they want, the longest share what's left.
function fairCap(wants, room) {
  const sorted = [...wants].sort((a, b) => a - b);
  for (let i = 0; i < sorted.length; i++) {
    const share = room / (sorted.length - i);
    if (sorted[i] > share) return share;
    room -= sorted[i];
  }
  return Infinity;
}

// One navigation for every copy: where the person has been (navigation.js) is one memory, so what the strip draws and what the
// keys do can't disagree. The `keys` copy, a floating block over the whole window that draws nothing, shows whatever else is
// hidden (the sidebar, `work` under a wide panel): it answers every t3-tabs command and lays the window out. The strip tracks
// it too before drawing, so it never draws a frame behind; tracking twice a frame changes nothing (check-navigation.cjs).
let brain = null;
const nav = () => brain ??= navigation();

// A tab nobody named reads as its lead pane: the agent in it, else the focused one.
const leadOf = (mine) => mine.find(p => p.status != null) ?? mine.find(p => p.focused) ?? mine[0];
const nameOf = (c, lead, name) => c.named ? c.name : lead ? name(lead) : "Terminal";

export default class Tabs extends View {
  init(_props, cx) {
    this.pressed = null;
    this.over = null;
    this.tabStrip = {};
    this.nameW = {};
    this.dragKeys = cx.focus_handle();
    const part = props()?.part;
    if (part !== "measure" && part !== "keys") stopsInit(this, cx);
    // A close may ask first: the dialog covers the strip, and nothing reports the pointer's leaving until it moves, so the
    // strip, which hears the commands too, clears its hover then. Herdr's own wait, so a reload ends it.
    if (!part) cx.spawn(async (cx) => {
      for (;;) {
        if (!(await nextCommand()).startsWith("close-")) continue;
        this.overTab = this.hot = null;
        detailsFor(this, null, cx);
        cx.notify();
      }
    });
    if (part !== "keys") return;
    nav().arrive = (space) => { this.fitRow(window()); restorePanel(this, space); };
    // Only this copy answers: every other copy would open its own dialog.
    cx.spawn(async (cx) => {
      for (;;) {
        const command = await nextCommand();
        // One at a time: a second press finds the first's pane gone.
        if (command === "sidebar") run("layout.select", { stack: "sidebar-lists", child: inboxShown() ? "lists" : "inbox" });
        else if (command === "settle") await this.settle(cx);
        // The space panel (docs/adr/0017), keyed as VS Code's: a surface opens on it, or puts away the panel showing it; `panel` keeps it as it was.
        else if (command === "files") togglePanel("files");
        else if (command === "review") {
          const p = panelState(), sp = spaces().find(s => s.active);
          if (!p.pages.includes("review")) continue;
          if (p.open && p.active === "review") { togglePanel("review"); continue; }
          const { problem } = await reviewRepo(sp?.id);
          if (spaces().find(s => s.active)?.id !== sp?.id) continue;
          if (!problem) togglePanel("review");
          else notify({ title: "Review unavailable", body: problem, level: "warning" });
        }
        else if (command === "panel") togglePanel();
        else if (command === "details") {
          if (this.navigation.atHome) continue;
          if (panelState().wide) toggleWide();
          cx.timer.after(50, () => run("t3-actions.details"));
        }
        // An agent's menu (t3-menu): Settle, Un-settle or Wake the agent it was opened on, in view or not.
        else if (command.startsWith("settle:")) await this.settle(cx, command.slice("settle:".length));
        else if (command.startsWith("wake:")) await writeLabel(command.slice("wake:".length), "snoozed", "");
        else if (command.startsWith("unpin:")) this.unpin(command.slice("unpin:".length), cx);
        // The Inbox breadcrumb title's menu (t3-menu).
        else if (command.startsWith("pin:")) pin(command.slice("pin:".length));
        else if (command.startsWith("snooze:")) await this.snooze(command.slice("snooze:".length), cx);
        else if (command === "undo") await this.undo();
        else await this.navigation.handle(command, cx);
      }
    });
  }

  get navigation() { return nav(); }

  // `given`: an agent's menu names it; the key takes the agent in view.
  async settle(cx, given = null) {
    // Settle is the Inbox's: Lists has no Settled to put it in (docs/adr/0002).
    if (this.navigation.atHome || sidebarParts(layout()).stack?.active === "lists") return;
    const f = { ...focused() }, ps = panes(), p = ps.find(p => p.pane === f.pane), every = agents(), all = terminals();
    if (!given && p?.mod && programOf(p)?.inbox) {
      if (!["working", "blocked"].includes(modStatus(p))) await this.navigation.handle(`close-pane-now:${p.pane}`, cx);
      return;
    }
    const byAddress = new Map(all.map(k => [k.address, k]));
    let address = given ?? (f?.pane && !f.terminal ? (every.find(a => a.tab === f.tab && a.address === f.agent) ?? every.find(a => a.tab === f.tab))?.address
      : f?.terminal ?? f?.agent ?? every.find(a => a.focused)?.address);
    // One settled from its menu in the background moves nothing, as its card's Settle.
    const inView = !given || f.terminal === given || every.find(a => a.focused)?.address === given;
    const seen = new Set();
    while (address && !every.some(a => a.address === address) && !seen.has(address)) { seen.add(address); address = byAddress.get(address)?.parent; }
    const a = every.find(a => a.address === address), k = byAddress.get(address);
    if (!a) return;
    const kids = subAgents(every, all)(address), own = ownStatus(a.status, address, all);
    if ([own, ...kids].some(s => s === "working" || s === "blocked")) return;
    if (stillSettled(k, own, kids)) {
      if (await writeLabel(address, "settled", "")) {
        // Kept for live terminals only, so the record doesn't grow with every agent ever brought back.
        const unsettled = Object.fromEntries(Object.entries(shared(KEY.unsettled) ?? {}).filter(([at]) => all.some(t => t.address === at)));
        setShared(KEY.unsettled, { ...unsettled, [address]: Math.max(Date.now(), (unsettled[address] ?? 0) + 1) });
      }
      return;
    }
    const snoozed = k?.labels?.snoozed ?? "";
    if (!await writeLabel(address, "settled", `${Date.now()}:${k?.turn ?? 0}`)) return;
    if (snoozed) await writeLabel(address, "snoozed", "");
    const pins = pinList();
    unpin([address]);
    this.remember("Settled", { address, snoozed, pins }, cx);
    const current = focused();
    if (inView && ["space", "tab", "pane", "terminal", "agent"].every(key => current?.[key] === f[key]) && !this.navigation.nextCard(address)) run("t3-tabs.home");
  }

  // `<address>:<wake ms>`, as an Inbox card's Snooze: the label, an Undo that wakes it, and the agent in view put away as Settle
  // puts it. Snooze is the Inbox's (docs/adr/0002). A time gone by is refused, as the card refuses it.
  async snooze(arg, cx) {
    const i = arg.lastIndexOf(":"), address = arg.slice(0, i), at = Number(arg.slice(i + 1));
    if (!(at > Date.now())) return notify({ title: "Couldn't snooze the agent", body: "That time has passed. Choose another.", level: "warning" });
    if (this.navigation.atHome || sidebarParts(layout()).stack?.active === "lists") return;
    const f = { ...focused() }, all = terminals(), every = agents();
    const k = all.find(k => k.address === address), a = every.find(x => x.address === address), was = k?.labels?.snoozed ?? "";
    if (!k) return;
    const inView = f.terminal === address || every.find(x => x.focused)?.address === address;
    // Snoozed while it needs the person, it stays out of sight through that need (tree.js snoozeOf).
    const held = Boolean(a) && treeStatus(ownStatus(a.status, address, all), subAgents(every, all)(address)) === "blocked";
    if (!await writeLabel(address, "snoozed", `${at}${held ? ":held" : ""}`)) return;
    this.remember("Snoozed", { address, snoozed: was }, cx);
    const current = focused();
    if (inView && ["space", "tab", "pane", "terminal", "agent"].every(key => current?.[key] === f[key]) && !this.navigation.nextCard(address)) run("t3-tabs.home");
  }

  unpin(address, cx) {
    const pins = pinList();
    if (!pins.includes(address)) return;
    unpin([address]);
    this.remember("Unpinned", { address, pins }, cx);
  }

  remember(action, undo, cx) {
    const old = shared(KEY.notice), now = Date.now();
    const joined = old?.owner === "tabs" && old.action === action && old.live && now - old.at < 5000;
    const n = { owner: "tabs", action, count: (joined ? old.count : 0) + 1, gen: (old?.gen ?? 0) + 1,
      live: true, shown: joined, at: now, undos: [...(joined ? old.undos : []), undo] };
    setShared(KEY.notice, n);
    const update = (change) => {
      const current = shared(KEY.notice);
      if (current?.owner === "tabs" && current.gen === n.gen && current.at === n.at) setShared(KEY.notice, change && { ...current, ...change });
    };
    if (!joined) cx.timer.after(16, () => update({ shown: true }));
    cx.timer.after(5000, () => update({ live: false, shown: false }));
    cx.timer.after(5250, () => update(null));
  }

  async undo() {
    const n = shared(KEY.notice);
    if (!n?.live || Date.now() - n.at >= 5000) return;
    if (n.owner !== "tabs") {
      setShared(KEY.undo, { gen: n.gen, at: n.at, requestedAt: Date.now(), request: (shared(KEY.undo)?.request ?? 0) + 1 });
      return;
    }
    // Gone while the writes run, so a second press can't repeat them; back with what failed, so it can be tried again.
    setShared(KEY.notice, null);
    let back;
    const failed = [];
    for (const u of [...n.undos].reverse()) {
      // A snooze undone wakes it: the label back as it was.
      if (n.action === "Snoozed") {
        if (await writeLabel(u.address, "snoozed", u.snoozed)) back = u.address;
        else failed.unshift(u);
        continue;
      }
      if (n.action !== "Unpinned") {
        if (!await writeLabel(u.address, "settled", "")) { failed.unshift(u); continue; }
        back = u.address;
        if (snoozeOf(u.snoozed).until > Date.now()) await writeLabel(u.address, "snoozed", u.snoozed);
      }
      putBack(u.pins, [u.address]);
    }
    if (failed.length) setShared(KEY.notice, { ...n, count: failed.length, undos: failed });
    if (back && this.navigation.atHome) focusAgent(back);
  }

  // Each tab's width: its whole name while the room allows, else the longest names give way first.
  tabWidths(shown, want) {
    const room = (this.room ?? 0) - TAB_GAP * (shown.length - 1), active = shown.find(c => c.active);
    let cap = fairCap(shown.map(want), room), held = active && want(active);
    if (active && held > cap) {
      held = Math.min(held, Math.max(cap, TAB_ACTIVE));
      cap = fairCap(shown.filter(c => c !== active).map(want), room - held);
    }
    return new Map(shown.map(c => [c.id, c === active ? held : Math.min(want(c), Math.max(cap, TAB_FLOOR))]));
  }

  // Where the tab strip sits (scroll-strip.js): the tab the keyboard's on, else the active one, in view. The Inbox's strip
  // stands at the right, beside Actions, so it holds its place from its end.
  stripAt(shown, widths, fromEnd = false) {
    const walked = shown.findIndex(c => within(this, [`tab-${c.id}`, `tab-${c.id}-close`])), i = walked >= 0 ? walked : shown.findIndex(c => c.active);
    // A rule or a zoomed tab's panes has no name of its own to wait for.
    return stripAt(this.tabStrip, { widths: shown.map(c => widths.get(c.id)), gap: TAB_GAP, room: this.room ?? 0, focus: i, focusKey: shown[i]?.id ?? "",
      ready: shown.every(c => c.rule || c.group || this.nameW[`tab-${c.id}`]), fromEnd });
  }

  // With the sidebar hidden, its toggle also says how the agents are doing, with the sidebar's own marks.
  // Idle agents aren't counted: nothing to look at. The counts are 12, the tab bar's, in the 28px button's 14.
  sidebarToggle(t, stopPress, live, st) {
    const counts = ["blocked", "working", "done"].map(s => [s, live.filter(a => st(a) === s).length]).filter(([, n]) => n > 0);
    const words = { blocked: "needing you", working: "working", done: "done" };
    const summary = counts.map(([s, n]) => `${n} ${words[s]}`).join(" · ");
    return tip(this, t, "sidebar-toggle", "Show sidebar", stop(this, t, "sidebar-toggle", drawButton(t, "sidebar-toggle", {
      size: "sm", wide: counts.length > 0, icon: "mods/t3-tabs/icons/panel-left.svg", label: summary ? `Show sidebar, ${summary}` : "Show sidebar", hot: this.hot === "sidebar-toggle" })
      .mr(8).on_hover(glow(this, "sidebar-toggle"))
      // It goes when the sidebar shows, before the pointer can report leaving it.
      .on_mouse_down("left", stopPress).on_click(() => { this.hot = null; run("layout.toggle", { id: "sidebar" }); })
      .children(counts.map(([s, n]) => h_flex().id(`agents-${s}`).gap(4).items_center().child(statusMark(t, s, 14)).child(div().text_size(12).text_color(t.muted).child(String(n))))), radiusOf("sm")), { action: "layout.toggle:sidebar", below: true });
  }

  // With props.block, sizes that block to `size`: layout.resize, which Herdr keeps with the layout's clicks.
  // on_size_change reports zoomed pixels; a layout's are logical.
  fit(size) {
    // The window snaps a zoomed width to whole pixels: up to half a px over its logical width isn't more room needed.
    const z = Number(settings()?.zoom) || 1, id = props()?.block, px = Math.ceil(size.width / z - 0.5);
    if (!id || px === this.fitted) return;
    this.fitted = px;
    run("layout.resize", { id, px });
  }

  // At Home the bar has nothing to show, so its row folds to the panes' 8px gap and Home's mod takes the height. Not with the
  // sidebar hidden (the row holds its toggle and the macOS window buttons) nor with window buttons of the bar's own. A layout
  // click, so it reads the row's size and corrects it whatever left it so (a quit at Home, another layout). Home's pane shows in
  // `home-main`, the same frame with no header: a blank header still took its 28px, a strip over Home's terminal.
  fitRow(w) {
    const root = layout(), row = layoutNode(root, "tabs-row"), work = layoutNode(root, "work-main");
    const child = this.navigation.atHome ? "home-main" : "main";
    if (work && work.active !== child) run("layout.select", { stack: "work-main", child });
    if (!row) return;
    const px = this.navigation.atHome && !sidebarParts(root).rail?.hidden && !w?.buttons ? 8 : ROW_PX;
    if (row.size?.px !== px) run("layout.resize", { id: "tabs-row", px });
  }

  // Another layout's bar shouldn't stay compact because this one was narrow when it went.
  async close() {
    stopsEnd(this);
    if (props()?.part === "measure") setShared(KEY.compact, false);
    // Another layout starts its own memory.
    if (props()?.part === "keys") brain = null;
  }

  endDrag() {
    const moved = this.over !== null;
    this.pressed = this.over = null;
    const back = moved ? focused() : null;
    if (back?.pane) run("pane.focus", { pane: back.pane });
    else if (back?.terminal) run("pane.focus", { terminal: back.terminal });
  }

  render() {
    // The work column's width, in a strip the bar's controls can't change: measured in the bar, their collapsing would undo itself.
    // on_size_change reports zoomed pixels. Past T3's 768 for the same controls: here they share the row with the tabs.
    if (props()?.part === "measure") return div().id("bar-measure").size_full()
      .on_size_change((size) => setShared(KEY.compact, size.width / (Number(settings()?.zoom) || 1) < 1024));
    const t = theme(), w = window();
    if (props()?.part === "keys") {
      rememberTerminal();
      syncPanel(this);
      keepRecent();
      this.navigation.frame();
      this.fitRow(w);
      return div();
    }
    const stopPress = (_e, cx) => cx.stop_propagation();
    // 28, as T3's titlebar controls; on the 40px bar, chrome's hover and on, as the brand bar's.
    const button = (id, icon, label, action, key, glyph = undefined) => tip(this, t, id, label, stop(this, t, id,
      drawButton(t, id, { icon, label, size: "sm", surface: "chrome", hot: this.hot === id, on: id === "panel-toggle" && panelState().open })
        .on_hover(glow(this, id)).on_mouse_down("left", stopPress).on_click(action)
        .when(Boolean(glyph), el => el.child(glyph)), radiusOf("sm")), { action: key, below: true });
    // The work header's end: Lists' terminal + before Details (t3-actions' block), so it never moves Details; after Details the
    // `window` part: the panel's toggle while no panel head owns it, in the window's corner, then the window's buttons 8 on. Each
    // stands a group's gap from Details, its own side carrying it; the layout's tabs-end-inset puts the end 12 from the column's,
    // so the toggle stays where the open panel's head puts it (docs/internals/t3-tokens.md「规则」P3, R1).
    // At Home neither: its row folds to 8 (fitRow); ⌥⌘B still opens the panel there.
    const newTabShown = !this.navigation.atHome && !inboxShown(), toggleShown = !this.navigation.atHome && panelState().pages.length > 0 && !panelState().open;
    if (props()?.part === "end") return focusRoot(this, h_flex().size_full().items_center().justify_end().bg(t.chrome)
      .child(h_flex().id("tabs-end").flex_none().items_center().when(newTabShown, el => el.pr(GROUP_GAP)).on_size_change((size) => this.fit(size))
        // With the Inbox, the breadcrumb's space is the way to a new tab.
        // 28 as the panel toggle beside it: one size in a group (「规则」R2).
        .when(newTabShown, el => el.child(button("tab-new", "mods/t3-tabs/icons/plus.svg", "New tab", () => newTab(spaces().find(s => s.active)), "t3-tabs.new")))));
    if (props()?.part === "window") return focusRoot(this, h_flex().size_full().items_center().justify_end().bg(t.chrome)
      .child(h_flex().id("window-end").flex_none().items_center().when(toggleShown, el => el.pl(GROUP_GAP)).on_size_change((size) => this.fit(size))
        // The space panel's toggle, over where it opens: the sidebar's panel-left, mirrored. Lit while open.
        .when(toggleShown, el => el.child(button("panel-toggle", "mods/t3-tabs/icons/panel-right.svg",
          "Show panel", () => togglePanel(), "t3-tabs.panel")))
        .when(w?.buttons && !panelState().open, el => el.child(h_flex().flex_none().ml(8).items_center()
          .child(button("minimize", w.platform === "windows" ? "mods/t3-tabs/icons/win-min.svg" : undefined, "Minimize", () => run("window.minimize"), undefined, w.platform === "windows" ? undefined : "−"))
          .child(button("maximize", w.platform === "windows" ? `mods/t3-tabs/icons/${w.maximized ? "win-restore" : "win-max"}.svg` : undefined, w.maximized ? "Restore" : "Maximize", () => run("window.maximize"), undefined, w.platform === "windows" ? undefined : "□"))
          .child(button("close-window", w.platform === "windows" ? "mods/t3-tabs/icons/win-close.svg" : "mods/t3-tabs/icons/x.svg", "Close window", () => run("window.close")))))));
    const space = spaces().find(p => p.active);
    // At Home, none: the brand bar's lit mark tells where this is.
    const { tabs: shown, context: ctx } = this.navigation.frame(!props()?.part), inbox = inboxShown();
    // With the Inbox, the breadcrumb holds the tab in view and the parent's: the strip has the rest.
    const strip = ctx ? [...ctx.kin, ...ctx.programs] : shown;
    // Each agent with its sub-agents (tree.js).
    const every = agents(), all = terminals(), under = subAgents(every, all);
    const st = (a) => treeStatus(ownStatus(a.status, a.address, all), under(a.address));
    const ps = panes(), tabName = namer();
    // The tab's most urgent agent, ranked as the app ranks tabs; a done one only while it's still news.
    const statusOf = (c) => {
      const words = [...every.filter(a => a.tab === c.id).map(a => st(a) === "done" && notNews(all.find(k => k.address === a.address), a.status, under(a.address)) ? "idle" : st(a)), ...ps.filter(p => p.tab === c.id && p.mod).map(p => modStatus(p))];
      return words.includes("blocked") ? "blocked"
        : words.includes("done") ? "done"
        : words.includes("working") ? "working" : null;
    };
    // A zoomed tab with more than one pane shows them, a segment each (paneGroup): in Lists the tab in view; with the Inbox a
    // program tab in view, or beside the agents in view the panes that aren't theirs, as its agents are in the breadcrumb.
    const zoomedIn = (tab) => {
      const mine = ps.filter(p => p.tab === tab), z = mine.find(p => p.zoomed);
      return mine.length > 1 && z ? { mine, z } : null;
    };
    /** @type {any[]} Tabs, zoomed tabs' panes and rules. */
    const entries = strip.map(c => {
      const zi = c.active && zoomedIn(c.id);
      // In Lists it keeps the tab's status mark, as the tab did.
      return { id: c.id, active: c.active, c, group: zi && { panes: zi.mine, z: zi.z, status: inbox ? null : statusOf(c) } };
    });
    const work = ctx?.tab && !ctx.away ? zoomedIn(ctx.tab) : null;
    if (ctx) {
      // With the Inbox, a rule between what's the work's (a zoomed tab's other panes, its sub-agents' tabs) and the space's programs.
      const tools = work ? work.mine.filter(p => !every.some(a => a.address === p.terminal)) : [], rule = (n) => ({ id: `rule-${n}`, rule: true });
      if (ctx.kin.length && ctx.programs.length) entries.splice(ctx.kin.length, 0, rule(2));
      if (tools.length) entries.unshift({ id: `tools-${ctx.tab}`, active: tools.includes(work.z), group: { panes: tools, z: work.z } }, ...(entries.length ? [rule(1)] : []));
    }
    const segWant = (p, on) => Math.min(on ? TAB_ACTIVE : TAB_FLOOR, this.nameW[`seg-${p.pane}`] ? Math.ceil(this.nameW[`seg-${p.pane}`]) + SEG_CHROME : TAB_FLOOR);
    const want = (e) => e.rule ? RULE_W
      : e.group ? e.group.panes.reduce((sum, p) => sum + segWant(p, p === e.group.z), 2 + (e.group.status ? 16 : 0))
      : this.nameW[`tab-${e.id}`] ? (ctx ? Math.ceil(this.nameW[`tab-${e.id}`]) + SNUG_CHROME : Math.max(TAB_MIN, Math.ceil(this.nameW[`tab-${e.id}`]) + TAB_CHROME)) : TAB_FLOOR;
    // With the Inbox the strip asks for what its tabs want and gets what the breadcrumb leaves (measured: stripW); in Lists, the row.
    const area = this.area ?? 0, stripWant = Math.max(0, entries.reduce((sum, e) => sum + want(e) + TAB_GAP, -TAB_GAP));
    this.room = ctx ? this.stripW ?? Math.min(stripWant, area) : area;
    const widths = this.tabWidths(entries, want), at = this.stripAt(entries, widths, Boolean(ctx));
    // With the Inbox showing, agents' tabs hold their place at the front: only the rest drag, among themselves.
    const loose = (c) => !inbox || !every.some(a => a.tab === c.id);
    // A press holds a tab's id: an agent starting or a tab closing can change the bar under it.
    const pressedAt = strip.findIndex(c => c.id === this.pressed);
    const item = (c, i) => {
      const lead = leadOf(ps.filter(p => p.tab === c.id));
      const program = lead && programOf(lead);
      const name = nameOf(c, lead, tabName);
      // With the Inbox showing, what needs the person is the sidebar's to say, shown or hidden.
      const status = inbox ? null : statusOf(c);
      const glyph = programIcon(program, 12, t.muted) ?? svg("mods/t3-tabs/icons/terminal.svg").size(12).text_color(t.muted);
      // Shared with the panel's tabs (tab.js); the drag, double-click rename and the click that selects are the bar's own.
      // A Lists tab keeps its end slot for its status, so its width doesn't move with it; the Inbox's tools have none (docs/adr/0002).
      return tab(this, t, `tab-${c.id}`, { mod: "mods/t3-tabs", label: name, icon: glyph, active: c.active, width: widths.get(c.id), mark: status && statusMark(t, status, 14),
        slot: !ctx, closeLabel: "Close tab", closeAction: c.active ? "t3-tabs.close-tab" : undefined, quiet: this.pressed !== null,
        close: () => run(`t3-tabs.close-tab:${c.id}`), menu: (cx) => openMenu(this, "tab", { id: c.id, space: space.id }, cx), enter: () => run("tab.select", { id: c.id }) }, el => el
        // Dragged as a space is: the source fades, a line shows where it lands. `over` is null until the drag starts.
        .when(pressedAt === i && this.over !== null && this.over !== c.id, el => el.opacity(0.5))
        .when(pressedAt >= 0 && this.over === c.id && pressedAt !== i, el => el.child(
          div().absolute().top(0).bottom(0).w(2).bg(t.accent)
            .when(pressedAt < i, line => line.right(0))
            .when(pressedAt > i, line => line.left(0)),
        ))
        .on_mouse_down("left", (e, cx) => { this.pressed = c.id; this.over = null; this.dragFrom = e.position; if (e.click_count === 2) run("tab.rename", { id: c.id }); cx.notify(); })
        .on_mouse_move((e, cx) => {
          const held = strip.find(x => x.id === this.pressed);
          if (!held || this.over === c.id || !loose(held) || !loose(c)) return;
          // As T3's tabs: a drag starts 6px from the press, so a click's wobble only selects.
          if (this.over === null && Math.hypot(e.position.x - this.dragFrom.x, e.position.y - this.dragFrom.y) < 6 * settings().zoom) return;
          if (this.over === null) this.dragKeys.focus();
          this.over = c.id;
          cx.notify();
        })
        .on_mouse_up("left", (_e, cx) => {
          const from = this.pressed, to = this.over;
          if (from === null) return;
          this.endDrag();
          // To the line it shows: past a tab that can't take a drop, the last one that can.
          if (from !== to && strip.some(x => x.id === from) && strip.some(x => x.id === to)) run("tab.move", { id: from, index: space.tabs.findIndex(x => x.id === to) + 1 });
          // Short of a drag it was a click on the pressed tab, wherever the release lands. A tab gone from the bar took its press along.
          else if (strip.some(x => x.id === from)) run("tab.select", { id: from });
          cx.notify();
        }));
    };
    const root = layout(), { rail: sidebar } = sidebarParts(root);
    // Old saved rails and a dragged-narrow sidebar can be smaller than the window buttons.
    // Hidden, leave room for the window controls before the sidebar toggle's padded 28px button.
    const lights = w?.platform === "macos" && w.titlebar === "none" && !w.fullscreen && root?.traffic_lights;
    const lightsPadding = sidebar?.hidden ? (lights ? (root.traffic_lights[0] + 66) / settings().zoom - 4 : 10)
      : lights ? Math.max(8, (root.traffic_lights[0] + 64) / settings().zoom - (sidebar?.size?.px ?? 0)) : 8;
    const notice = sidebar?.hidden && this.undoNotice(t);
    return focusRoot(this, h_flex().size_full().min_w(0).pl(lightsPadding).pr(4).gap(4).items_center().bg(t.chrome)
      .when(this.over !== null, el => el.track_focus(this.dragKeys).on_key_down((e, cx) => {
        if (e.keystroke !== "escape" || this.over === null) return;
        cx.stop_propagation();
        this.endDrag();
        cx.notify();
      }))
      .on_mouse_up("left", (_e, cx) => { this.endDrag(); cx.notify(); })
      // Herdr reports no release outside the bar, so leaving ends a drag, as in the inbox.
      .on_hover((on, cx) => {
        if (on || this.pressed === null) return;
        this.endDrag();
        cx.notify();
      })
      // The wheel only scrolls the strip, either way; a click is what goes to a tab.
      .on_scroll_wheel((e, cx) => {
        stripWheel(this.tabStrip, e);
        cx.notify();
      })
      .when(Boolean(sidebar?.hidden), el => el.child(this.sidebarToggle(t, stopPress, awake(st, under, inbox), st)))
      .when(Boolean(notice), el => el.child(notice))
      // The tabs' row, measured whole: with the Inbox the breadcrumb and the strip share it.
      .child(h_flex().id("tab-area").flex_1().min_w(0).h_full().items_center().gap(8)
        .on_size_change((size, cx) => { this.area = size.width / settings().zoom; cx.notify(); })
        .when(Boolean(ctx), el => el.child(this.crumb(t, ctx, { every, ps, name: tabName, narrow: area - this.room - 8 < NARROW, stopPress })))
        .child(h_flex().id("tab-scroll").relative().h_full().items_center().overflow_hidden()
          // 8 from Actions, as from the breadcrumb: the bar's 4 and these 4.
          .when(Boolean(ctx), el => el.w(stripWant).flex_shrink(1).min_w(0).mr(4)
            .on_size_change((size, cx) => { this.stripW = size.width / settings().zoom; cx.notify(); }))
          .when(!ctx, el => el.flex_1().min_w(0))
          .child(h_flex().id("tab-strip").flex_none().h_full().items_center().gap(TAB_GAP).ml(-at)
            .children(entries.map(e => e.rule ? div().id(e.id).w(1).h(16).mx(4).flex_none().bg(t.border)
              : e.group ? this.paneGroup(t, e, widths.get(e.id), { name: tabName, stopPress })
              : item(e.c, strip.indexOf(e.c)))))
          // A cut end fades out, in both modes: one way for the strip to run out of room, and a tab cut short reads as cut, not as
          // a narrow tab. 16px of the bar's own color in steps, there being no gradient fill for an element.
          .children(stripFades(t.chrome, this.tabStrip)))));
  }

  // With the Inbox showing, who's in view, as T3's thread header: the space, a sub-agent's parent, then the tab's agents side by
  // side with the one in view lit, the card the Inbox lights (docs/internals/specs/tab-bar.md). Held, a program there has the
  // focus: the one last looked at is outlined. Away, in a tab of programs: it all dims, and leads back. The title's ⌄ is the
  // tab's menu. A zoomed tab's panes come back by the pane header's zoom: the bar has no button for it.
  crumb(t, ctx, { every, ps, name, narrow, stopPress }) {
    const space = ctx.space, dim = ctx.held || ctx.away, agentOf = (address) => every.find(a => a.address === address);
    const nameOf = (address) => { const a = agentOf(address); return a ? name(a) : address; };
    // The title's menu: the agent's (t3-menu's "agent", the same wherever it's opened), as T3's thread actions. It hangs 4 under
    // the title, left edges together, as T3's (rect.left, rect.bottom + 4) and the layout's other menus. A click while it's open
    // closes it.
    const titled = ctx.sub ?? ctx.head;
    const menu = (b) => {
      openOverlay({ mod: "t3-menu", kind: "popup", width: 220, height: 260, ...hang(b, 220, { align: "start" }), props: { tab: "agent", target: { address: titled }, ...litProp(!b) } });
    };
    // Its menu up: the title stays lit, its ⌄ shown and its label down, as the layout's other buttons that open one (trigger.js).
    const menuOn = (id) => popupOpen(this, id, closedKey("t3-menu"));
    // A right-click is the menu of what's under it, on the pointer, as everywhere: the space's (as in Spaces), an agent's (as
    // its card's).
    const context = (kind, target) => (_e, cx) => { detailsFor(this, null, cx); openMenu(this, kind, target, cx); };
    const sep = (id) => div().id(id).flex_none().text_color(t.dim).child("/");
    const press = (e, cx) => { stopPress(e, cx); detailsFor(this, null, cx); };
    const act = (action) => (_e, cx) => { action(); cx.notify(); };
    const link = (id, label, el, action, radius = 4) => tip(this, t, id, label, stop(this, t, id, el.id(id).role("button").accessibility_label(label)
      .on_mouse_down("left", press).on_click(act(action)).on_hover(glow(this, id)), radius), { below: true });
    // A name shown whole has no label, as a tab's (T3's title only repeats it). Cut short, or down to its icon or `…`, the tab's
    // hover label holds it whole, under it, its words where the name starts (`at`, from the item's left; the label's 1 + 8 in).
    const text = (id, label) => nameText(this, id, label, { size: 14, weight: "medium" });
    // `action` null: the title, which opens its menu.
    const named = (id, label, el, action, { agent, titled: own = false, shown = true, at = 0, radius = 4 } = /** @type {{ agent: string, titled?: boolean, shown?: boolean, at?: number, radius?: number }} */ ({ agent: null })) => {
      const wired = action ? el.on_mouse_down("left", press).on_click(act(action)) : opener(this, { id, closed: closedKey("t3-menu"), onOpen: menu, press })(el);
      return stop(this, t, id, namedLabel(this, t, id, label, wired.id(id).role("button").accessibility_label(label)
        .on_mouse_down("right", context("agent", { address: own ? titled : agent })), {
        shown, at, onHover: (hovered, cut, cx) => { glow(this, id)(hovered, cx); detailsFor(this, hovered && cut && !menuOn(id) ? id : null, cx); },
        onMove: e => detailsAt(this, id, e),
      }), radius);
    };
    // As T3's title: its ⌄ is part of it, 4 after the name, 14px, there only while the title is hovered or has the keyboard.
    const chevron = (id) => {
      const shown = this.hot === id || within(this, [id]) || menuOn(id);
      return div().id("crumb-menu").flex_none().opacity(shown ? 1 : 0).transition("opacity", { duration: 150, easing: "ease-out" })
        .child(svg("mods/t3-tabs/icons/chevron-down.svg").size(14).text_color(t.muted));
    };
    // The title: the agent in view alone, the card the Inbox lights. Another agent in its tab is reached as any is, by its card
    // or its pane. In view it opens its menu, as T3's title; held or away it's dim, and leads back.
    const title = (address) => {
      const lit = !dim && !ctx.sub, id = `peer-${address}`, label = nameOf(address);
      const el = h_flex().h(24).gap(4).rounded(6).items_center().min_w(0).flex_shrink(1)
        .text_color(lit || this.hot === id ? t.foreground : t.muted)
        .child(text(id, label))
        .when(lit, e => e.child(chevron(id)));
      return named(id, label, el, lit ? null : () => focusAgent(address), { agent: address, titled: lit, radius: 6 });
    };
    const sub = ctx.sub && named(`peer-${ctx.sub}`, nameOf(ctx.sub), h_flex().min_w(0).flex_shrink(1).gap(4).items_center().rounded(4)
      .text_color(dim ? t.muted : t.foreground).child(text(`peer-${ctx.sub}`, nameOf(ctx.sub)))
      .when(!dim, e => e.child(chevron(`peer-${ctx.sub}`))), dim ? () => focusAgent(ctx.sub) : null, { agent: ctx.sub, titled: !dim });
    // Its own width and no less (flex weighting alone let the strip win): capped at the row, where its names shorten.
    return h_flex().id("crumb").flex_grow(1).flex_shrink(0).min_w(0).when(this.area > 0, el => el.max_w(this.area)).h_full().gap(12).items_center().text_size(14).font_medium()
      .child(link("crumb-space", `Open a tab in ${space.name}`, h_flex().min_w(0).flex_shrink(1).gap(6).items_center()
        .text_color(this.hot === "crumb-space" ? t.foreground : t.muted).on_mouse_down("right", context("space", { id: space.id }))
        .child(projectMark("mods/t3-tabs", space, 14, t, ps)).child(div().min_w(0).truncate().child(space.name)), () => run("t3-tabs.open-empty")))
      .when(Boolean(ctx.parent), el => el.child(sep("crumb-sep-parent")).child(named("crumb-parent", nameOf(ctx.parent),
        h_flex().min_w(0).flex_shrink(1).items_center().text_color(this.hot === "crumb-parent" ? t.foreground : t.muted)
          .child(narrow ? div().child("…") : text("crumb-parent", nameOf(ctx.parent))),
        () => focusAgent(ctx.parent), { agent: ctx.parent, shown: !narrow })))
      .when(Boolean(ctx.head), el => el.child(sep("crumb-sep")).child(title(ctx.head)))
      .when(Boolean(sub), el => el.child(sep("crumb-sep-sub")).child(sub));
  }

  // A zoomed tab's panes, a segment each with the zoomed one lit: a click moves the zoom there (zoom.js).
  // Dashed: what one tab holds, unlike the tabs beside it. shortcut: it doesn't drag as a tab does; upgrade if Lists wants that.
  paneGroup(t, e, width, { name, stopPress }) {
    const { panes: list, z, status } = e.group;
    const segment = (p) => {
      const on = p.pane === z.pane, id = `seg-${p.pane}`, label = name(p);
      const glyph = programIcon(programOf(p), 12, t.muted) ?? svg("mods/t3-tabs/icons/terminal.svg").size(12).text_color(t.muted);
      return stop(this, t, id, h_flex().id(id).relative().h_full().pl(6).pr(8).gap(2).rounded(6).items_center().min_w(0).flex_shrink(1)
        .max_w(on ? TAB_ACTIVE : TAB_FLOOR).text_size(12).text_color(on || this.hot === id ? t.foreground : t.muted)
        .when(on, el => el.bg(ghostTint(t, "chrome", true))).when(!on, el => el.hover(s => s.bg(ghostTint(t, "chrome", false)))).on_hover(glow(this, id))
        .role("button").accessibility_label(label)
        .on_mouse_down("left", stopPress).on_click(() => focusPane(p.pane))
        .on_mouse_down("right", (_e, cx) => openMenu(this, "pane", { pane: p.pane, terminal: p.terminal }, cx))
        .child(div().size(16).flex_none().flex().items_center().justify_center().child(glyph))
        .child(nameText(this, id, label).flex_1()), 6);
    };
    return h_flex().id(`group-${e.id}`).w(width).h(24).flex_none().rounded(6).border(1).border_dashed().border_color(t.border).items_center().overflow_hidden()
      .children(list.map(segment))
      .when(Boolean(status), el => el.child(div().w(16).flex_none().flex().items_center().justify_center().child(statusMark(t, status, 14))));
  }

  undoNotice(t) {
    const n = shared(KEY.notice);
    if (!n || Date.now() - n.at >= 6000) return null;
    return h_flex().id(`undo-notice-${n.gen}`).flex_none().h(24).gap(4).items_center().text_size(11).text_color(t.dim)
      .opacity(n.shown ? 1 : 0).transition("opacity", { duration: 200, easing: "ease-out" })
      .child(`${n.action}${n.count === 1 ? "" : ` ${n.count}`},`)
      .child(h_flex().id("undo-notice-undo").h(24).items_center().font_medium().text_color(t.foreground)
        .when(n.live && Date.now() - n.at < 5000, el => stop(this, t, "undo-notice-undo", el.hover(s => s.underline()).role("button")
          .accessibility_label(`Undo: ${n.action}`).on_click(() => run("t3-tabs.undo")), 4)).child("Undo"));
  }
}
