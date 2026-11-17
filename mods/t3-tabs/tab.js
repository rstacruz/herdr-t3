// A closable tab, as T3's panel tab: the tab bar's terminal tabs and the space panel head's surface tabs (docs/internals/specs/
// tab-bar.md, space-panel.md). scripts/sync.sh copies this to both mods.
import { div } from "gpui-kit";
import { h_flex } from "gpui-base";
import { tip, glow, keptHover } from "./tip.js";
import { stop, within } from "./focus.js";
import { button, tint as ghostTint } from "./button.js";
import { nameText, measuredTooltip } from "./measured-text.js";

/**
 * 24 high, radius 6, 6 in on the left and 8 on the right, 2 between, 12px words; the tab shown on `chrome`'s on fill, another
 * hovered on its hover fill (t3-tokens「按钮」). A 16 slot leads with the 12px `icon`; hovered or keyboard-focused, × covers
 * it, as T3's. `mark` (a status) sits in a 16 slot at the end and stays there hovered; `slot` keeps that slot with no mark, so
 * the tab's width doesn't move with its state. × and a middle press call `close`, a right press `menu(cx)`. A name cut short
 * says itself whole in a label below (t3-tokens P5); any press hides it, `quiet` keeps it down (a drag). `mod` is the mod's
 * folder, holding icons/x.svg. `extend(el)` adds what only one bar does (a size, a drag, a click) before the wrappers.
 * @param {any} view @param {any} t @param {string} id
 * @param {{ mod: string, label: string, icon: any, active?: boolean, width?: number, maxW?: number, mark?: any, slot?: boolean, close: () => void, menu: (cx: any) => void, closeLabel?: string, closeAction?: string, quiet?: boolean, enter?: () => void }} o
 * @param {(el: any) => any} [extend]
 */
export function tab(view, t, id, { mod, label, icon, active = false, width, maxW, mark, slot = false, close, menu, closeLabel = `Close ${label}`, closeAction, quiet = false, enter }, extend = (el) => el) {
  const closeId = `${id}-close`, over = view.overTab === id || within(view, [id, closeId]), kept = keptHover(view, "overTab", id);
  const hush = (_e, cx) => { cx.stop_propagation(); if (view.hot === id) view.hot = null; };
  // A keyboard stop only while it shows, with the keyboard on the tab. Its label waits longer than the name's 150ms, so a
  // straight click never meets it.
  const x = tip(view, t, closeId, closeLabel, button(t, closeId, { size: "tiny", surface: "tab", label: `Close ${label}`, hot: over, icon: over ? `${mod}/icons/x.svg` : undefined })
    .when(!over, (el) => el.child(icon))
    .on_hover(glow(view, closeId))
    .on_mouse_down("left", (_e, cx) => cx.stop_propagation()).on_click((_e, cx) => { cx.stop_propagation(); close(); })
    .when(over, (el) => stop(view, t, closeId, el, 4)), { action: closeAction, below: true, delay: 500 });
  const el = h_flex().id(id).relative().h(24).when(width != null, (e) => e.w(width)).when(maxW != null, (e) => e.max_w(maxW)).pl(6).pr(8).gap(2)
    .flex_none().items_center().rounded(6).text_size(12)
    .bg(active ? ghostTint(t, "chrome", true) : t.chrome).text_color(active || over ? t.foreground : t.muted)
    .when(!active, (e) => e.hover((s) => s.bg(ghostTint(t, "chrome", false))))
    .role("tab").accessibility_label(label)
    // The name's label goes by view.hot, × by overTab, which outlasts a leave Herdr never reports (tip.js keptHover).
    .on_hover((on, cx) => { glow(view, id)(on, cx); kept.hover(on, cx); })
    .on_mouse_move(kept.move)
    .on_mouse_down("left", hush)
    .on_mouse_down("middle", (e, cx) => { hush(e, cx); close(); })
    .on_mouse_down("right", (e, cx) => { hush(e, cx); menu(cx); })
    .child(x)
    .child(nameText(view, id, label).flex_1().whitespace_nowrap())
    .when(Boolean(mark) || slot, (e) => e.child(div().size(16).flex_none().flex().items_center().justify_center().when(Boolean(mark), (s) => s.child(mark))));
  return measuredTooltip(view, t, id, label, stop(view, t, id, extend(el), 6, { enter }), { below: true, off: quiet });
}
