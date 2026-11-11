// A space's labels, opened as a dialog from its menu (t3-menu) with props { space }. Click a label to put it on or
// take it off; type a new one and press Enter to add it. Changes save at once. Esc or Done closes.
import { View, div, svg } from "gpui-kit";
import { v_flex, h_flex, InputState, Input } from "gpui-base";
import { props, closeOverlay, theme, spaces } from "herdr";
import { labelsOf, knownLabels, loadLabels, saveLabels } from "./labels.js";

export default class SpaceLabels extends View {
  init(_props, cx) {
    this.input = InputState.new({ placeholder: "New label" });
    this.input.on("submit", (_e, cx) => { this.add(this.input.value()); cx.notify(); });
    this.input.focus();
    cx.timer.after(600, () => this.input.focus());
    this.handle = cx.focus_handle();
    // Its machine's file first, so a write starts from what's there, not from what this screen last read.
    this.ready = false;
    const s = this.space();
    cx.spawn(async (cx) => {
      await loadLabels([s?.machine ?? null]).catch(() => {});
      this.ready = true;
      cx.notify();
    });
  }

  space() { return spaces().find((s) => s.id === props()?.space); }

  toggle(label) {
    const s = this.space();
    if (!s || !this.ready) return;
    const now = labelsOf(s);
    saveLabels(s, now.includes(label) ? now.filter((l) => l !== label) : [...now, label]);
  }

  add(text) {
    const s = this.space(), typed = text.trim().replace(/\s+/g, " ").slice(0, 32);
    if (!s || !this.ready || !typed) return;
    // A label that's there already in another case is that one.
    const label = knownLabels(spaces()).find((l) => l.toLowerCase() === typed.toLowerCase()) ?? typed;
    if (!labelsOf(s).includes(label)) saveLabels(s, [...labelsOf(s), label]);
    this.input.set_value("");
  }

  render() {
    const t = theme(), s = this.space(), overlay = props()?.overlay;
    const mine = s ? labelsOf(s) : [];
    const list = [...new Set([...knownLabels(spaces()), ...mine])].sort((a, b) => a.localeCompare(b));
    const row = (label, i) => {
      const on = mine.includes(label);
      return h_flex().id(`label-${i}`).h(30).px(8).gap(10).flex_none().items_center().rounded(6).cursor_pointer()
        .hover((st) => st.bg(t.hover))
        .role("check_box").accessibility_label(label)
        .on_click((_e, cx) => { this.toggle(label); cx.notify(); })
        .child(h_flex().size(16).flex_none().items_center().justify_center().rounded(4).border_1()
          .border_color(on ? t.accent : t.input).when(on, (el) => el.bg(t.accent))
          .when(on, (el) => el.child(svg("mods/t3-labels/icons/check.svg").size(12).text_color(t.accent_foreground))))
        .child(div().flex_1().min_w(0).truncate().text_color(t.foreground).child(label))
        .child(div().flex_none().text_size(12).text_color(t.dim)
          .child(String(spaces().filter((x) => labelsOf(x).includes(label)).length)));
    };
    return v_flex().id("space-labels").track_focus(this.handle).size_full().min_h(0).p(18).gap(12)
      .bg(t.popover).text_color(t.foreground).text_size(13)
      .on_key_down((e, cx) => { if (e.key === "escape") { closeOverlay(overlay); cx.stop_propagation(); } })
      .child(h_flex().items_center().gap(8)
        .child(div().flex_1().min_w(0).truncate().text_size(15).font_semibold().child(s ? `Labels: ${s.name}` : "Labels"))
        .child(div().flex_none().text_size(11).text_color(t.dim).child("Esc")))
      .child(Input.new(this.input).h(34).px(10).flex_none().rounded(8).border_1().border_color(t.input).bg(t.background)
        .text_size(13).text_color(t.foreground))
      .child(v_flex().id("space-labels-list").flex_1().min_h(0).overflow_y_scroll().gap(1)
        .when(!s, (el) => el.child(div().p(8).text_color(t.dim).child("This space is gone.")))
        .when(Boolean(s) && list.length === 0, (el) => el.child(div().p(8).text_color(t.dim).child("No labels yet. Type one above and press Enter.")))
        .when(Boolean(s), (el) => el.children(list.map(row))))
      .child(h_flex().flex_none().justify_end()
        .child(h_flex().id("space-labels-done").h(30).px(14).items_center().rounded(8).bg(t.solid).text_color(t.solid_foreground)
          .text_size(12.5).font_medium().cursor_pointer().hover((st) => st.opacity(0.88))
          .on_click(() => closeOverlay(overlay)).child("Done")));
  }
}
