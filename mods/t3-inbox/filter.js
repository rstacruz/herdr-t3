import { div, svg } from "gpui-kit";
import { v_flex, h_flex, Popover, Input } from "gpui-base";
import { spaces, machines, shared, run, props, openOverlay } from "herdr";
import { labelsOf, knownLabels } from "./space-labels.js";
import { projectMark } from "./project.js";
import { glow, tip } from "./tip.js";
import { stop, pressed, justClosed, within } from "./focus.js";
import { step, scrollList } from "./list.js";
import { FIRST } from "./row-model.js";
import { KEY, closedKey } from "./store.js";
import { openMenu } from "./menu.js";
import { button, radiusOf } from "./button.js";
import { trigger } from "./trigger.js";

// The space filter's rows, flush as T3's, and how many show before the list scrolls: the whole rows T3's 23rem holds.
const SCOPE_ROW = 32, SCOPE_SHOWN = 9;

// All spaces, then the space labels (each space with one), then the spaces.
export function inboxMatches(view) {
  const q = view.search.value().toLowerCase(), sp = spaces();
  return [{ id: null, name: "All spaces" }, ...knownLabels(sp).map((l) => ({ label: l, name: l })), ...sp.filter((s) => s.id !== shared(KEY.home))]
    .filter((s) => s.name.toLowerCase().includes(q));
}

// A click shows that space or label alone (the one label alone again: all); shift-click adds or removes it and keeps the
// menu open, as in T3. Spaces and labels add up: a card shows when its space is picked or has a picked label.
export function pickInboxSpace(view, s, shift, cx) {
  if (!s) return;
  const flip = (xs, x) => xs.includes(x) ? xs.filter((y) => y !== x) : [...xs, x];
  if (s.label) {
    const alone = view.labelScope.length === 1 && view.labelScope[0] === s.label && !view.scope.length;
    if (shift) view.labelScope = flip(view.labelScope, s.label);
    else { view.scope = []; view.labelScope = alone ? [] : [s.label]; }
  } else if (!s.id) { view.scope = []; view.labelScope = []; }
  else if (shift) view.scope = flip(view.scope, s.id);
  else { view.scope = [s.id]; view.labelScope = []; }
  localStorage.setItem("scope", JSON.stringify(view.scope));
  localStorage.setItem("labelScope", JSON.stringify(view.labelScope));
  // A new scope starts the settled tail over, as T3's does.
  view.limit = FIRST;
  if (!shift) view.scopeOpen = false;
  cx.notify();
}

export function inboxTop(view, t, model) {
  const { sp, ps, scope, labels } = model;
  const lit = (id, color) => view.hot === id ? t.foreground : color;
  // A space's mark, as t3-spaces draws it.
  const avatar = (id, name, size) => projectMark("mods/t3-inbox", sp.find((s) => s.id === id) ?? { name: name ?? "" }, size, t, ps);
  // T3's top row: search on the left, then the space filter, new space and new tab.
  const asks = props()?.newMenu && machines().length > 1;
  const tool = (id, label, icon, closed, onOpen, action = undefined) => trigger(view, t, id, { icon: `mods/t3-inbox/icons/${icon}.svg`, label, closed, onOpen, action });
  // The filter shows what it filters to: one avatar, two overlapping, or the plain filter icon.
  const scoped = sp.filter((s) => scope.includes(s.id)), found = view.matches();
  const choice = (s, i) => {
    const on = s.label ? labels.includes(s.label) : s.id ? scope.includes(s.id) : scope.length === 0 && labels.length === 0;
    const mine = s.id ? labelsOf(s) : [];
    // Selection is a check badge on the icon, as in T3.
    return h_flex().id(s.label ? `scope-label-${s.label}` : `scope-${s.id ?? "all"}`).h(SCOPE_ROW).px(8).gap(8).flex_none().items_center().rounded(4)
      .when(i === view.scopeAt, (el) => el.bg(t.selected))
      .on_hover((over, cx) => { if (over && view.scopeAt !== i) { view.scopeAt = i; cx.notify(); } })
      .role("button").accessibility_label(s.label ? `Label ${s.name}` : s.name)
      .on_click((e, cx) => view.pick(s, e.modifiers.shift, cx))
      // A space's row: the space's menu, as in Spaces; the list closes under it.
      .when(Boolean(s.id && props()?.menu), (el) => el.on_mouse_down("right", (_e, cx) => { view.scopeOpen = false; openMenu(view, "space", { id: s.id }, cx, props().menu); cx.notify(); }))
      .child(div().relative().flex_none()
        .child(s.id ? avatar(s.id, s.name, 16) : svg(`mods/t3-inbox/icons/${s.label ? "tag" : "folder"}.svg`).size(16).text_color(t.muted))
        // T3's ring is outside its 12px badge; a border here is inside, so 16 and 2 further out.
        .when(on, (el) => el.child(h_flex().absolute().right(-6).bottom(-6).size(16).rounded_full().bg(t.accent)
          .border(2).border_color(t.popover).items_center().justify_center()
          .child(svg("mods/t3-inbox/icons/check.svg").size(8).text_color("#ffffff")))))
      .child(div().flex_1().min_w(0).truncate().text_color(t.foreground).child(s.name))
      // A label's count of spaces; a space's labels.
      .when(Boolean(s.label), (el) => el.child(div().flex_none().text_size(12).text_color(t.dim)
        .child(String(sp.filter((x) => labelsOf(x).includes(s.label)).length))))
      .when(mine.length > 0, (el) => el.child(div().flex_none().max_w(110).truncate().text_size(12).text_color(t.dim).child(mine.join(", "))));
  };
  // As T3's: from the button's left edge, 288 wide, out over the work column; radius 8 and rows' 4, inset 4 (its rounded-lg, rounded-sm, px-1).
  const filter = Popover.new("inbox-scope-menu").anchor("top_left").open(view.scopeOpen)
    .on_open_change((open, cx) => {
      view.scopeOpen = open;
      if (open) {
        view.scopeAt = 0;
        view.search.set_value("");
        view.search.focus();
      }
      cx.notify();
    })
    .trigger(stop(view, t, "inbox-scope", button(t, "inbox-scope", { size: "sm", hot: view.hot === "inbox-scope", on: view.scopeOpen,
      wide: labels.length > 0,
      label: labels.length || scoped.length ? `Filter by space: ${[...labels, ...scoped.map((s) => s.name)].join(", ")}` : "Filter by space",
      icon: labels.length || scoped.length ? undefined : "mods/t3-inbox/icons/list-filter.svg" }).on_hover(glow(view, "inbox-scope"))
      // The labels picked, as a tag with their names; else the spaces' marks.
      .when(labels.length > 0, el => el.child(h_flex().max_w(110).gap(4).items_center().text_size(12).text_color(t.foreground)
        .child(svg("mods/t3-inbox/icons/tag.svg").size(14).flex_none())
        .child(div().min_w(0).truncate().child(scoped.length ? `${labels.join(", ")} +${scoped.length}` : labels.join(", ")))))
      .when(labels.length === 0 && scoped.length > 0, el => el.child(scoped.length > 1
        // T3's second mark overlaps by 4 with a 2px ring of the sidebar's color.
        ? h_flex().children(scoped.slice(0, 2).map((s, i) => i === 0 ? avatar(s.id, s.name, 14)
          : h_flex().flex_none().ml(-6).rounded(6).border(2).border_color(t.chrome).child(avatar(s.id, s.name, 14))))
        : avatar(scoped[0].id, scoped[0].name, 16))), radiusOf("sm")))
    .content(v_flex().id("inbox-scope-panel").w(288).mt(4).p(4).rounded(8)
      .bg(t.popover).border_1().border_color(t.border).shadow_lg().text_size(14)
      .on_key_down((e, cx) => {
        const to = step(e, view.scopeAt, view.matches().length);
        if (to < 0) return;
        view.scopeAt = to;
        cx.stop_propagation();
        cx.notify();
      })
      // As T3's ComboboxSearchInput: 12 in and 10 down less the 1 it shifts up, a 26 field, 6 to the rule. Its text starts 20 from
      // the icon, 4 before the names, and inside the button's left edge as the panel hangs from it.
      .child(h_flex().mx(8).mt(5).h(33).pb(6).gap(4).flex_none().items_center().border_b_1().border_color(t.border)
        .child(svg("mods/t3-inbox/icons/search.svg").size(16).flex_none().text_color(t.dim))
        .child(Input.new(view.search).flex_1().h_full().text_size(14).text_color(t.foreground)))
      .child(div().pt(5).flex_none()
        .when(found.length > 0, (el) => el.child(scrollList(view, "inbox-scope-list", { count: found.length, row: SCOPE_ROW, at: view.scopeAt, height: Math.min(found.length, SCOPE_SHOWN) * SCOPE_ROW,
          draw: (i) => choice(found[i], i), wheeled: (keep) => { view.scopeAt = keep; } })))
        .when(found.length === 0, (el) => el.child(div().p(8).text_center().line_height("20px").text_color(t.dim).child("No matching spaces or labels.")))));
  // T3's top group: 8 in and the search field 4 before its buttons, which touch. The right edge is the brand bar's above, so the two rows of icons line up.
  // The filter, New space and New tab show only with the pointer on this row, the keyboard on one of them, the filter's menu open, or a filter set.
  const toolsShown = view.topHover || view.scopeOpen || scoped.length > 0 || labels.length > 0 || within(view, ["inbox-scope", "inbox-new-space", "inbox-new-tab"]);
  const top = h_flex().id("inbox-top").h(32).px(8).gap(4).flex_none().items_center()
    .on_hover((hovered, cx) => { view.topHover = hovered; cx.notify(); })
    // Sized as T3's search field (h-8, 16px icon, a medium 14px placeholder), but a button: it opens Go to. Not shared/button.js:
    // it's drawn as a field, as the select triggers are.
    .child(stop(view, t, "inbox-search", h_flex().id("inbox-search").flex_1().h(32).px(8).gap(8).items_center().rounded(6).text_size(14).font_medium()
      .text_color(lit("inbox-search", t.dim)).hover((s) => s.bg(t.hover)).on_hover(glow(view, "inbox-search")).on_mouse_down("left", () => pressed(view))
      // Each opens over its button, before the pointer can report leaving it.
      .role("button").accessibility_label("Search").on_click((_e, cx) => { view.hot = null; const picker = props()?.picker ?? "picker"; if (!justClosed(view, closedKey(picker))) run("mod.open", { name: picker }); cx.notify(); })
      .child(svg("mods/t3-inbox/icons/search.svg").size(16).flex_none().text_color(lit("inbox-search", t.dim)))
      .child(div().child("Search"))))
    .child(h_flex().flex_none().items_center().opacity(toolsShown ? 1 : 0).transition("opacity", { duration: 150, easing: "ease-out" })
    .child(tip(view, t, "inbox-scope", "Filter by space or label", filter, { off: view.scopeOpen, hint: "Shift+click to pick several", below: true }))
    // The layout's menu asks which machine, as its mod.json places it; the shipped one can't, so docked alone it's the active space's.
    .child(tool("inbox-new-space", "New space", "folder-plus", closedKey(props()?.newMenu, "pick"), () => {
      if (!asks) { run("space.new"); return false; }
      openOverlay({ mod: props().newMenu, kind: "popup", frame: "none", at: /** @type {any} */ ("top"), offset: 96, width: 576, height: 420, props: { pick: true } });
    }, asks ? null : "space.new"))
    // The layout passes its own menu; docked alone, the shipped one.
    .child(tool("inbox-new-tab", "New tab", "square-pen", closedKey(props()?.newMenu ?? "new-menu"), () => run("mod.open", { name: props()?.newMenu ?? "new-menu" }))));


  return top;
}
