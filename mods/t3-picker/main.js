// Go to a pane, drawn as T3's command palette and the New menu (t3-new-menu): a row a pane, agents and programs
// alike, named and marked as its pane header is, so lazygit beside an agent is found as itself. From the shipped
// picker (mod.clone). The panes you were in lately lead, as T3's recent threads, so ⌘P, Enter goes back and forth.
// ↑/↓ and Enter to go, ctrl+d to close a pane (asking first while a program runs), Esc to leave.
import { View, div, svg } from "gpui-kit";
import { h_flex, v_flex, InputState, Input } from "gpui-base";
import { theme, spaces, panes, agents, terminals, focused, run, closeOverlay, props, window, shared, setShared } from "herdr";
import { modStatus, namer, programOf } from "./name.js";
import { focusPane } from "./zoom.js";
import { notNews, ownStatus, subAgents, treeStatus } from "./tree.js";
import { statusMark } from "./status-mark.js";
import { projectMark } from "./project.js";
import { programIcon } from "./program.js";
import { step, scrollList } from "./list.js";
import { stopsInit, stop, focusRoot } from "./focus.js";
import { KEY, closedKey } from "./store.js";
import { footAction, paletteFooter } from "./palette.js";

// As T3's command item: 6 + a 20px title + a 16px line + 6.
const ROW = 48;
// The list's share of T3's 420 once its border, search, top and bottom insets and footer are in; the popup hugs its content.
const LIST_MAX = 420 - 2 - 48 - 8 - 8 - 41;

export default class Picker extends View {
  init(_props, cx) {
    stopsInit(this, cx, "modal");
    this.at = null;
    this.filter = "";
    this.input = InputState.new({ placeholder: "Search terminals…" });
    this.input.on("change", (_e, cx) => { this.filter = this.input.value(); this.at = 0; cx.notify(); });
    this.input.on("submit", () => this.choose(this.items()[this.at ?? 0]));
    this.input.focus();
  }

  // For the buttons that open this: see justClosed in focus.js.
  close() { setShared(closedKey("t3-picker"), Date.now()); }

  // Every pane: the ones you were in lately first, newest first (the tab bar keeps them, t3-tabs.recent); then the current
  // space's, then its machine's, as New orders spaces, each space's in tab order; the pane you're in last. Typing, a name that
  // matches goes before a folder or space that does.
  items() {
    const q = this.filter.toLowerCase(), ps = panes(), all = terminals(), name = namer(), kids = subAgents(agents(), all);
    const mine = spaces().find((s) => s.active)?.machine ?? null;
    const rank = (s) => (s.active ? 0 : (s.machine ?? null) === mine ? 1 : 2);
    const rows = [...spaces()].sort((a, b) => rank(a) - rank(b) || (a.machine ?? "").localeCompare(b.machine ?? "")).flatMap((s) => s.tabs.flatMap((c) =>
      // Home has its own key and nothing to find.
      ps.filter((p) => p.tab === c.id && s.id !== shared(KEY.home)).map((p) => {
        const under = p.terminal ? kids(p.terminal) : [];
        return {
          key: `pane:${p.pane}`, p, s, label: name(p), program: programOf(p), team: under.length, under, here: s.active && c.active && p.focused,
          status: p.mod ? modStatus(p) : treeStatus(ownStatus(p.status, p.terminal, all), under),
          // A tab's own name only if someone gave it: else it's its position ("4") or what it was first, not what runs in it.
          words: [s.name, s.machine ?? "", c.named ? c.name : "", name(p), programOf(p)?.name ?? "", p.program?.key ?? "", (p.cwd ?? "").split(/[\\/]/).pop()],
        };
      })));
    // Not by `focused`: each tab has its own. The pane you're in is the recent list's first.
    const here = focused()?.pane, recent = (shared(KEY.recent) ?? []).filter((p) => p !== here);
    const place = (r) => r.p.pane === here ? Infinity : recent.includes(r.p.pane) ? recent.indexOf(r.p.pane) - recent.length : 0;
    const named = (r) => !q || r.label.toLowerCase().includes(q) ? 0 : 1;
    return rows.filter((r) => !q || r.words.join(" ").toLowerCase().includes(q))
      .map((r, i) => ({ r, i })).sort((a, b) => named(a.r) - named(b.r) || place(a.r) - place(b.r) || a.i - b.i).map(({ r }) => r);
  }

  choose(item) {
    if (!item) return;
    closeOverlay(props().overlay);
    focusPane(item.p.pane);
  }

  row(item, i, ps) {
    const t = theme(), on = this.at === i, s = item.s, st = item.status;
    const mark = st === "done" && notNews(terminals().find(k => k.address === item.p.terminal), item.p.status, item.under) ? null : statusMark(t, st, 14);
    return h_flex().id(item.key).w_full().h(ROW).px(8).py(6).gap(8).rounded(4).items_center().flex_none()
      .role("button").accessibility_label(item.label)
      .when(on, (el) => el.bg(t.selected))
      .on_hover((over, cx) => { if (over && this.at !== i) { this.at = i; cx.notify(); } })
      .on_click(() => this.choose(item))
      // As T3's CommandPaletteTitleIcon: level with the title, not the row.
      .child(h_flex().w(16).h(20).pt(2).self_start().flex_none().items_center().justify_center().child(projectMark("mods/t3-picker", s, 16, t, ps, true)))
      .child(v_flex().flex_1().min_w(0)
        .child(div().truncate().text_color(t.foreground).when(Boolean(item.here), (d) => d.font_medium()).child(item.label))
        .child(h_flex().min_w(0).gap(4).items_center().text_size(12).line_height("16px").text_color(t.dim)
          .child(programIcon(item.program, 12, t.muted) ?? svg("mods/t3-picker/icons/terminal.svg").size(12).flex_none().text_color(t.muted))
          .child(div().flex_none().text_color(t.muted).child(item.program?.name ?? "Terminal"))
          .child(div().flex_none().child("·"))
          // As T3 marks a remote thread: a server icon, then the name.
          .when(Boolean(s.machine), (el) => el
            .child(svg("mods/t3-picker/icons/server.svg").size(12).flex_none().text_color(t.muted))
            .child(div().flex_none().text_color(t.muted).child(`${s.machine} ·`)))
          .child(div().min_w(0).truncate().child(s.name + (item.team ? ` · +${item.team}` : "")))))
      .when(Boolean(mark), (el) => el.child(mark));
  }

  render() {
    const t = theme(), ps = panes(), items = this.items();
    // Opens on the first row: the pane you were in before, or another; never the one you're in, where Enter would go nowhere.
    if (this.at === null) this.at = 0;
    this.at = Math.min(this.at, Math.max(0, items.length - 1));
    return focusRoot(this, v_flex().id("picker").size_full().min_h(0).rounded(16).border(1).border_color(t.border).bg(t.popover).shadow_2xl().text_size(14).line_height("20px")
      .on_key_down((e, cx) => {
        if (e.key === "escape") return closeOverlay(props().overlay);
        const to = step(e, this.at, items.length);
        if (to >= 0) this.at = to;
        else if (e.key === "d" && e.modifiers.control && items[this.at]) {
          closeOverlay(props().overlay);
          // The tab bar's close, which asks first while a program runs; a tab's last pane closes the tab.
          return run(`t3-tabs.close-pane:${items[this.at].p.pane}`);
        } else return;
        cx.stop_propagation();
        cx.notify();
      })
      .child(h_flex().h(36).my(6).flex_none().pl(18).pr(20).gap(7).items_center()
        .child(svg("mods/t3-picker/icons/search.svg").size(16).flex_none().text_color(t.dim))
        .child(Input.new(this.input).flex_1().h_full().text_size(14).text_color(t.foreground)))
      // No heading: there is one kind of row, and the room goes to the list.
      .child(div().flex_none().mt(8).mb(8).px(8)
        .when(items.length > 0, (el) => el.child(scrollList(this, "picker-rows", { count: items.length, row: ROW, at: this.at, height: Math.min(items.length * ROW, LIST_MAX),
          draw: (i) => this.row(items[i], i, ps), wheeled: (keep) => { this.at = keep; } })))
        .when(items.length === 0, (el) => el.child(div().py(40).text_center().text_color(t.dim).child("No matching terminals."))))
      // New work goes through New, which picks the space (and for a new space, the machine).
      .child(paletteFooter(t, [["↑ ↓", "Navigate"], ["Enter", "Go"], [window()?.platform === "macos" ? "⌃D" : "Ctrl+D", "Close pane"], ["Esc", "Close"]],
        stop(this, t, "picker-new", footAction(t, "picker-new", "New tab")
          .on_click(() => { closeOverlay(props().overlay); run("mod.open", { name: "t3-new-menu" }); })
          .child(svg("mods/t3-picker/icons/square-pen.svg").size(14).text_color(t.muted))
          .child("New tab"), 8))));
  }
}
