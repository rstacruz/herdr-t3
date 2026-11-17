import { View, div, svg, image } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { checking, theme, run, props, updates, layout, shared, setShared, spaces, window, settings, appHome, readTextFile, writeTextFile, notify, openOverlay, closeOverlay, nextCommand } from "herdr";
import { tip, glow } from "./tip.js";
import { stopsInit, stopsEnd, stop, focusRoot } from "./focus.js";
import { trigger, hang } from "./trigger.js";
import { notePanelWidth } from "./titlebar.js";
import { menuKeys, litProp, propsLit } from "./list.js";
import { menuRow, menuHint, MENU_ROW } from "./menu-row.js";
import { sidebarParts } from "./sidebar.js";
import { initSettings, settingsView } from "./settings.js";
import { KEY, closedKey } from "./store.js";
import { panelState, showPage, hidePanel, toggleWide, activateSurface, closeSurface, reviewRepo, layoutNode, REVIEW_STATUS } from "./panel.js";
import { workFolder } from "./terminal-context.js";
import { stripAt, stripEnds, stripWheel, stripPage, stripFades } from "./scroll-strip.js";
import { button as drawButton, radiusOf, GROUP_GAP } from "./button.js";
import { pierreFileIcon } from "./pierre-icons.js";
import { statusMark } from "./status-mark.js";
import { tab as closableTab } from "./tab.js";
import { keycap } from "./palette.js";
import { alpha } from "./color.js";

// The space panel's surfaces (docs/adr/0017) that aren't a file: their names and icons. Review wears pulls.review's own mark,
// as the Review bar does: a review, not a git command. In its colors, so an image.
const PAGES = { files: ["Files", "folder-tree"], review: ["Review", "pulls-review", true] };
// The surface menus: as wide as t3-menu's, as tall as their rows and their 4 in (docs/internals/t3-tokens.md「菜单行」).
const MENU_W = 220, menuHeight = (rows) => rows * MENU_ROW + 8;
const zoomOf = () => Number(settings()?.zoom) || 1;
const side = (n) => [].concat(n?.padding ?? 0).at(-1);
// The layout's room each side of the panel head's mod: the panel's and the head's padding put its ends 12 in, as the
// surfaces' own rows below it (t3-tokens「规则」R1).
const headPad = (root) => side(layoutNode(root, "panel")) + side(layoutNode(root, "panel-head"));
// Stamped as `+`'s menu closes: a press on `+` that closed it mustn't reopen it (trigger.js).
const SURFACE_CLOSED = closedKey("t3-chrome", "surface");

// The sidebar shows either Lists (Spaces and Agents) or the Inbox (t3-inbox): a stack in the layout.
const inboxShown = () => sidebarParts(layout()).stack?.active === "inbox";
export default class WorkspaceChrome extends View {
  async close() { stopsEnd(this); if (props()?.part === "surface-menu") setShared(SURFACE_CLOSED, Date.now()); }

  init(_props, cx) {
    // The panel head's tab widths, by id, and where its strip is scrolled (scroll-strip.js).
    this.surfaceWidths = {}; this.surfaceStrip = {};
    if (props()?.view === "settings") return initSettings(this, cx);
    stopsInit(this, cx);
    if (props()?.part?.startsWith("surface-")) {
      this.surfaceKeys = cx.focus_handle(); this.surfaceAt = propsLit(); this.reviewReason = "";
      // A popup takes the keyboard; the panel's docked empty page doesn't take it from the terminal.
      if (props()?.part !== "surface-empty") this.surfaceKeys.focus();
      // Only where Review is offered: whether it can read where the tab works (panel.js reviewRepo), again as that moves (render).
      if (props()?.part !== "surface-context") this.probeReview(cx);
    }
    // The panel's cmd-t (keys.json mod:t3-files and mod:review): + 's menu, under +. Only the head's copy listens.
    if (props()?.part === "panel") cx.spawn(async () => { for (;;) if (await nextCommand() === "surface-menu") this.openSurfaceMenu(null); });
    if (!props()?.footer && !props()?.part) {
      this.alignLights(cx);
      // The brand copy stays alive with the sidebar hidden; no redraw is needed until a zoom actually changes the file.
      cx.timer.every(250, cx => this.alignLights(cx));
    }
  }

  alignLights(cx) {
    if (checking()) return;
    if (shared("layout") !== "herdr-t3") return;
    const root = /** @type {any} */ (layout()), w = window(), zoom = Number(settings().zoom) || 1;
    if (w?.platform !== "macos" || w.fullscreen || root?.titlebar !== "none" || !root.traffic_lights || this.lightsWriting) return;
    // Once per zoom and layout value: an update that rewrites the layout is aligned again, a failure isn't retried.
    const seen = `${zoom}:${root.traffic_lights[1]}`;
    if (this.lightsSeen === seen) return;
    this.lightsSeen = seen;
    // Native buttons are unzoomed, centered 8px below y; the brand row's center is 20 logical px.
    const y = Math.round((12 + 20 * (zoom - 1)) * 1000) / 1000;
    if (root.traffic_lights[1] === y) return;
    this.lightsWriting = true;
    cx.spawn(async () => {
      try {
        const file = `${appHome()}/layouts/herdr-t3.json`, before = await readTextFile(file);
        if (before === null) throw new Error("Couldn't read the layout file.");
        const saved = JSON.parse(before);
        if (saved.titlebar !== "none" || !saved.traffic_lights || saved.traffic_lights[1] === y) return;
        saved.traffic_lights = [saved.traffic_lights[0], y];
        const after = before.replace(/("traffic_lights"\s*:\s*)\[[^\]]*\]/, (_match, key) => key + JSON.stringify(saved.traffic_lights));
        if (JSON.stringify(JSON.parse(after)) !== JSON.stringify(saved)) throw new Error("Couldn't locate the layout's window buttons.");
        await writeTextFile(file, after, before);
      } catch (e) {
        notify({ title: "Couldn't align the window buttons", body: String(e), level: "error" });
      } finally { this.lightsWriting = false; }
    });
  }

  render(cx) {
    if (props()?.view === "settings") return settingsView(this);
    const t = theme();
    // Herdr draws again when a terminal's folder or the focus moves: that's when where the tab works can change.
    if (props()?.part?.startsWith("surface-") && props().part !== "surface-context") this.probeReview(cx);
    if (props()?.part?.startsWith("surface-")) return this.surfaceView(t);
    if (props()?.part === "panel") return this.panelHead(t);
    if (props()?.footer) {
      // As T3's footer: a row of 32px icon buttons, and at its end, once Herdr has downloaded an update, its restart.
      const ready = updates().app.ready;
      // T3's undo notice, the inbox's (t3-inbox.notice), in this row's free space so it covers nothing: "Settled," or
      // "Settled 2," then Undo, which the inbox does. It fades in and out over 200ms, Undo inert while it goes. One older than
      // its 5s and the fade is left from before a restart.
      const n = shared(KEY.notice);
      // Short of room the summary is cut, never Undo: GPUI's flex doesn't do T3's two wraps, which squeezed Undo to nothing.
      const notice = n && Date.now() - n.at < 6000 && h_flex().id(`undo-notice-${n.gen}`).flex_1().min_w(0).h(24).justify_end().gap(4).items_center()
        .text_size(11).text_color(t.dim).opacity(n.shown ? 1 : 0).transition("opacity", { duration: 200, easing: "ease-out" })
        .child(div().min_w(0).truncate().child(`${n.action}${n.count === 1 ? "" : ` ${n.count}`},`))
        // As T3's InlineButton: medium, foreground, underlined on hover.
        .child(h_flex().id("undo-notice-undo").flex_none().h(24).items_center().font_medium().text_color(t.foreground)
          .when(n.live && Date.now() - n.at < 5000, (el) => el.hover((s) => s.underline()).role("button").accessibility_label(`Undo: ${n.action} ${n.count} agent${n.count === 1 ? "" : "s"}`)
            .on_click(() => run("t3-tabs.undo")))
          .child("Undo")
          .when(n.live && Date.now() - n.at < 5000, (el) => stop(this, t, "undo-notice-undo", el, 4)));
      const button = (id, icon, label, action, key) => tip(this, t, id, label, stop(this, t, id, drawButton(t, id, { size: "default", icon, label, hot: this.hot === id })
        .on_hover(glow(this, id))
        // Each opens over its button, before the pointer can report leaving it.
        .on_click((_e, cx) => { this.hot = null; action(); cx.notify(); }), radiusOf("default")), { action: key });
      // T3's footer: 8 in and 4 above its row, whatever height the layout gives the block. Its two buttons a group's gap apart,
      // 8 to what follows (docs/internals/t3-tokens.md「规则」P3).
      return focusRoot(this, div().size_full().bg(t.chrome).px(8).pt(4).child(h_flex().h(32).gap(8).items_center()
        .child(h_flex().id("footer-buttons").flex_none().gap(GROUP_GAP).items_center()
          .child(button("settings", "mods/t3-chrome/icons/settings.svg", "Settings", () => run("app.settings"), "app.settings"))
          .child(button("t3-settings", "mods/t3-chrome/icons/sliders-horizontal.svg", "Herdr T3 settings", () => run("t3-tabs.settings"), "t3-tabs.settings")))
        .child(notice || div().flex_1())
        .when(Boolean(ready), el => el.child(tip(this, t, "app-update", `Update ${ready} downloaded. Click to restart`, stop(this, t, "app-update", div().id("app-update").h(32).px(12).flex_none().flex().items_center()
          .rounded_full().bg(alpha(t.accent, "26")).text_size(12).text_color(t.accent).hover(s => s.bg(alpha(t.accent, "40"))).on_hover(glow(this, "app-update"))
          .role("button").accessibility_label(`Restart into Herdr ${ready}`)
          .on_click(() => run("app.update")).child("Update"), 16))))));
    }
    // Room for the macOS window buttons (layout traffic_lights), a place to drag the window, and the
    // sidebar toggle at its right edge; while the sidebar is hidden, t3-tabs shows it after the buttons.
    const inbox = inboxShown(), w = window();
    // Herdr's mark and name where its own layout has them, past the macOS window buttons; a click goes Home, which has no
    // button of its own. Its colours are louder than anything else here, so it waits at 70% and its name is muted, both lit
    // on hover, with no background behind them. As T3's, no tooltip. The window buttons are screen points, unzoomed: the last ends at 68
    // (traffic_lights x 16, three 12s 8 apart), and the logo's tile shows 16pt from it, less the PNG's 2 of clear edge and
    // this button's 6 in. Short of room the name gives way whole, never cut to "Her…", and never the buttons.
    const zoom = settings().zoom || 1, left = w?.platform === "macos" && !w?.fullscreen ? (68 + 16 - 2) / zoom - 6 : 8, on = this.hot === "home"
      // Lit at Home too: its tab bar is empty and its panes may be anyone's, so this says where you are.
      || spaces().some((s) => s.active && s.id === shared(KEY.home));
    // What the name has past the left inset: less the 8 at the right, two 28px buttons, this button's 6 each side, the 20px logo and 8 gap.
    const named = !this.brandW || this.brandW - left - 8 - 56 - 12 - 20 - 8 >= (this.nameW || 0);
    return focusRoot(this, h_flex().id("brand").size_full().bg(t.chrome).pl(left).pr(8).items_center()
      .on_size_change((size, cx) => { this.brandW = size.width / zoom; cx.notify(); })
      .child(stop(this, t, "home", h_flex().id("home").h(28).min_w(0).px(6).gap(8).items_center().rounded(8)
        .text_size(14).font_medium().text_color(on ? t.foreground : t.muted).on_hover(glow(this, "home"))
        .role("button").accessibility_label("Home")
        .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
        .on_click(() => run("t3-tabs.home"))
        .child(image("frame/welcome/herdr.png").size(20).flex_none().rounded(5).opacity(on ? 1 : 0.7))
        .when(named, el => el.child(div().id("home-name").flex_none().child("Herdr")
          .on_size_change((size, cx) => { this.nameW = size.width / zoom; cx.notify(); }))), 8))
      .child(div().flex_1())
      // T3's 28px title bar buttons, side by side instead of its 12 apart, so each stands over a button of the list's top row below.
      // The mode a click shows: a tray for the Inbox, rows with their marks for the lists.
      .child(tip(this, t, "sidebar-mode", inbox ? "Show lists" : "Show inbox", stop(this, t, "sidebar-mode", drawButton(t, "sidebar-mode", {
        size: "sm", icon: `mods/t3-chrome/icons/${inbox ? "layout-list" : "inbox"}.svg`, label: inbox ? "Show lists" : "Show inbox", hot: this.hot === "sidebar-mode" })
        .on_hover(glow(this, "sidebar-mode"))
        .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
        .on_click(() => run("t3-tabs.sidebar")), radiusOf("sm")), { action: "t3-tabs.sidebar", below: true }))
      .child(tip(this, t, "sidebar-toggle", "Hide sidebar", stop(this, t, "sidebar-toggle", drawButton(t, "sidebar-toggle", {
        size: "sm", icon: "mods/t3-chrome/icons/panel-left.svg", label: "Hide sidebar", hot: this.hot === "sidebar-toggle" })
        .on_hover(glow(this, "sidebar-toggle"))
        .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
        // It goes with the sidebar, before the pointer can report leaving it.
        .on_click(() => { this.hot = null; run("layout.toggle", { id: "sidebar" }); }), radiusOf("sm")), { action: "layout.toggle:sidebar", below: true })));
  }

  // Whether Review can read the active space where its tab works, asked again only when that changes. Until Git answers it
  // stays as it was (offered at first) rather than greying out for a frame.
  probeReview(cx) {
    if (checking()) return;
    const sp = spaces().find(s => s.active), key = `${sp?.id}:${sp && workFolder(sp.id)}:${sp?.machine}`;
    if (this.reviewKey === key) return;
    this.reviewKey = key;
    cx.spawn(async (cx) => {
      const { problem } = await reviewRepo(sp?.id);
      if (this.reviewKey !== key) return;
      this.reviewReason = problem; cx.notify();
    });
  }

  // + 's menu: under its press, else (the panel's cmd-t) under where + stands: the head's mod ends its padding in from the
  // window's right, + after the tabs as the strip has them scrolled. A popup's `at` is in zoomed px.
  openSurfaceMenu(press) {
    const z = zoomOf(), rows = panelState().pages.includes("review") ? 2 : 1;
    let at = hang(press, 0, { align: "start", gap: 6 }).at;
    if (!at && this.headW) {
      const root = layout(), high = layoutNode(root, "panel-head")?.size?.px ?? 40;
      const left = globalThis.window.viewport_size().width - (headPad(root) + this.headW) * z;
      at = { x: left + ((this.addX ?? 0) - (this.surfaceStrip.at ?? 0)) * z, y: (high / 2 + 12 + 6) * z };
    }
    openOverlay({ mod: "t3-chrome", kind: "popup", width: MENU_W, height: menuHeight(rows), ...(at ? { at } : {}), props: { part: "surface-menu", ...litProp(!press) } });
  }

  // The space panel's head (docs/internals/specs/space-panel.md): its tabs as T3's, + after them in the same scrolled strip,
  // T3's arrows together after it while it overflows, then widen and put away; each group's buttons touch, groups 8 apart,
  // and the ends 12 inside the column, over its pages' rows (「规则」P3, R1), by the layout's padding. The rest of the row drags
  // the window.
  panelHead(t) {
    const s = panelState(), space = spaces().find(p => p.active), z = zoomOf();
    // Review's run for this space, marked as a tab's agent is.
    const word = space && shared(REVIEW_STATUS)?.[space.id];
    const mark = statusMark(t, word, 14);
    const own = (el) => el.on_mouse_down("left", (_e, cx) => cx.stop_propagation());
    const widths = this.surfaceWidths;
    for (const id of Object.keys(widths)) if (!s.tabs.some(tab => tab.id === id)) delete widths[id];
    const page = (tab) => {
      const id = tab.id, [label, art, colored] = PAGES[id] ?? [tab.path?.split("/").at(-1) ?? id, "folder-tree"], on = s.active === id, key = `surface-${id}`;
      const icon = tab.folder ? svg("mods/t3-chrome/icons/folder-tree.svg").size(12).text_color(t.dim)
        : tab.path ? pierreFileIcon(t, "mods/t3-chrome", tab.path, 12)
        : colored ? image(`mods/t3-chrome/icons/${art}.svg`).size(12).opacity(on ? 1 : 0.7)
        : svg(`mods/t3-chrome/icons/${art}.svg`).size(12).text_color(t.dim);
      // As T3's: same names aren't told apart. Shared with the tab bar's (tab.js); selecting and the measured width are the head's own.
      return closableTab(this, t, key, { mod: "mods/t3-chrome", label, icon, active: on, maxW: 144, mark: id === "review" ? mark : null, close: () => closeSurface(id),
        menu: () => openOverlay({ mod: "t3-chrome", kind: "popup", width: MENU_W, height: menuHeight(tab.path ? 5 : 4), props: { part: "surface-context", target: id, space: space?.id } }) }, el => el
        .on_click(() => activateSurface(id))
        .on_size_change((size, cx) => { const w = size.width / zoomOf(); if (widths[id] !== w) { widths[id] = w; cx.notify(); } }));
    };
    const button = (id, icon, label, action, { key = undefined, size = /** @type {"xs" | "sm"} */ ("sm"), disabled = false } = {}) => tip(this, t, id, label, stop(this, t, id, drawButton(t, id, {
      size, disabled, on: id === "panel-close" || (id === "panel-wide" && s.wide), icon: `mods/t3-chrome/icons/${icon}.svg`, label, hot: this.hot === id })
      .when(!disabled, el => el.on_hover(glow(this, id)).on_click((_e, cx) => { this.hot = null; action(); cx.notify(); }))
      .on_mouse_down("left", (_e, cx) => cx.stop_propagation()), radiusOf(size)), { action: key, below: true });
    const add = trigger(this, t, "surface-add", { icon: "mods/t3-chrome/icons/plus.svg", label: "Open a surface", size: "xs", below: true,
      closed: SURFACE_CLOSED, onOpen: (b) => this.openSurfaceMenu(b) });
    // The strip: the tabs, + (24) after them; the active tab in view (scroll-strip.js).
    const strip = this.surfaceStrip, room = this.surfaceRoom ?? 300, sizes = [...s.tabs.map(tab => widths[tab.id] ?? 100), 24];
    // The last tab active, + after it comes into view too: the strip's end shows whole.
    const active = s.tabs.findIndex(tab => tab.id === s.active), i = active === s.tabs.length - 1 ? active + 1 : active;
    const at = stripAt(strip, { widths: sizes, gap: 4, room, focus: i, focusKey: `${space?.id}:${s.active}`, ready: s.tabs.every(tab => widths[tab.id]) });
    this.addX = sizes.slice(0, -1).reduce((sum, w) => sum + w + 4, 0);
    const ends = stripEnds(strip), over = (strip.over ?? 0) > 0;
    return focusRoot(this, h_flex().id("panel-head").size_full().bg(t.chrome).gap(8).items_center()
      // What the panel takes from the work column: the head, its padding and the root's divider.
      .on_size_change((size, cx) => { const root = layout(); notePanelWidth(size.width + (2 * headPad(root) + (root?.divider?.width ?? 0)) * z); if (this.headW !== size.width / z) { this.headW = size.width / z; cx.notify(); } })
      .child(div().id("surface-scroll").relative().flex_1().min_w(0).h_full().overflow_hidden()
        .on_size_change((size, cx) => { const w = size.width / zoomOf(); if (this.surfaceRoom !== w) { this.surfaceRoom = w; cx.notify(); } })
        .on_scroll_wheel((e, cx) => { stripWheel(strip, e); cx.notify(); })
        .child(h_flex().id("surface-strip").h_full().ml(-at).gap(4).items_center().children(s.tabs.map(page)).child(add))
        .children(stripFades(t.chrome, strip)))
      // T3's: together, only while the tabs overflow, each greyed at its end.
      .when(over, el => el.child(h_flex().id("surface-arrows").flex_none().gap(GROUP_GAP).items_center()
        .child(button("surface-back", "chevron-left", "Scroll tabs left", () => stripPage(strip, -1, room), { size: "xs", disabled: !ends.back }))
        .child(button("surface-next", "chevron-right", "Scroll tabs right", () => stripPage(strip, 1, room), { size: "xs", disabled: !ends.next }))))
      .child(h_flex().id("panel-controls").flex_none().gap(GROUP_GAP).items_center()
        .child(button("panel-wide", s.wide ? "minimize-2" : "maximize-2", s.wide ? "Restore panel" : "Expand panel", toggleWide))
        .child(button("panel-close", "panel-right", "Hide panel", hidePanel, { key: "t3-tabs.panel" })))
      .when(Boolean(window()?.buttons), el => el.child(h_flex().flex_none().items_center().children([["minimize", "−", "win-min"], ["maximize", window().maximized ? "❐" : "□", window().maximized ? "win-restore" : "win-max"], ["close", "×", "win-close"]].map(([cmd, text, icon]) => own(drawButton(t, `panel-window-${cmd}`, { size: "sm", label: `${cmd} window`, ...(window().platform === "windows" ? { icon: `mods/t3-chrome/icons/${icon}.svg` } : { text }) }).w(28).px(0).on_click(() => run(`window.${cmd}`))))))));
  }

  // The surface menus: the docked empty page (Open a surface), + 's popup, and a tab's right-click menu.
  surfaceView(t) {
    const p = props(), s = panelState(), empty = p.part === "surface-empty", context = p.part === "surface-context";
    const at = s.tabs.findIndex(tab => tab.id === p.target), tab = s.tabs[at];
    const finish = () => { if (!empty) closeOverlay(p.overlay); };
    const items = context ? [
      ...(tab?.path ? [{ label: "Copy path", act: cx => cx.write_to_clipboard(tab.path) }] : []),
      { label: "Close", act: () => closeSurface(p.target) },
      { label: "Close others", disabled: s.tabs.length < 2, act: () => closeSurface(p.target, "others") },
      { label: "Close to the right", disabled: at === s.tabs.length - 1, act: () => closeSurface(p.target, "right") },
      { label: "Close all", act: () => closeSurface(p.target, "all") },
    ] : [
      { label: "Files", key: "f", icon: "mods/t3-chrome/icons/folder-tree.svg", act: () => showPage("files") },
      ...(s.pages.includes("review") ? [{ label: "Review", key: "r", icon: image("mods/t3-chrome/icons/pulls-review.svg").size(16), disabled: Boolean(this.reviewReason), reason: this.reviewReason, act: () => showPage("review") }] : []),
    ];
    const choose = (i, cx) => { const it = items[i]; if (!it || it.disabled) return; if (context && p.space !== spaces().find(sp => sp.active)?.id) return finish(); finish(); it.act(cx); };
    // menu-row.js's rows. The docked empty page's are T3's RightPanelEmptyState list, as Home's: 32 tall, 10 in and apart,
    // radius 8, the key in a keycap.
    const list = v_flex().id("surface-list").w_full().max_w(empty ? 320 : MENU_W).p(4).gap(0).children(items.map((it, i) => menuRow(this, t, `surface-option-${i}`, {
      at: [this, "surfaceAt", i], label: it.label, icon: it.icon, disabled: it.disabled, hint: it.reason ?? "Not available",
      trail: it.key ? (empty ? keycap(t, it.key.toUpperCase()) : menuHint(t, it.key.toUpperCase())) : null, pick: (cx) => choose(i, cx),
      also: (el) => el.when(empty, (el) => el.h(32).px(10).gap(10).rounded(8)) })));
    return v_flex().id(empty ? "surface-empty" : "surface-menu").size_full().min_h(0).items_center()
      // Centred in the column, as T3's: 40 (the top bar) lifted off its bottom.
      .when(empty, el => el.justify_center().gap(12).px(24).pb(40)).when(!empty, el => el.bg(t.popover))
      .track_focus(this.surfaceKeys).on_mouse_down("left", () => this.surfaceKeys.focus())
      // A row's own key picks it; else list.js's menu keys over the rows that can be picked. Docked, Escape isn't this page's.
      .on_key_down((e, cx) => {
        if (e.keystroke === e.key && items.some(it => it.key === e.key)) { choose(items.findIndex(it => it.key === e.key), cx); cx.stop_propagation(); cx.notify(); }
        else if (!(empty && e.key === "escape")) menuKeys(this, items.map(it => it.label), choose, { at: "surfaceAt", close: finish, disabled: (i) => Boolean(items[i].disabled) })(e, cx);
      })
      .when(empty, el => el.child(div().text_size(14).font_medium().text_color(t.foreground).child("Open a surface")))
      .child(list);
  }
}
