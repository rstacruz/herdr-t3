// Preloaded by check.sh into every mod check: while a mod's render() runs, the cx it was given refuses what Herdr refuses
// there (gpui-kit.d.ts: notify, new, focus_handle; InputState.new, VirtualListScrollHandle.new), and a FocusHandle made from
// it refuses focus(), so a check fails where Herdr would keep the view's last frame and show "This view could not be
// re-rendered". A check's fake cx doesn't know it's drawing; this does.
// It finds each view class a bundle run in a vm context sets (`Mod`, or whatever the check names it).
const vm = require("node:vm");

// How many renders are running: a handle's focus() then throws, as Herdr's does during render or layout.
let drawing = 0;
// The cx's focus handles, wherever the view keeps them, refuse focus() while any view draws.
function watch(cx) {
  if (!cx || typeof cx !== "object" || cx.__focusGuard || typeof cx.focus_handle !== "function") return;
  const make = cx.focus_handle;
  cx.focus_handle = function (...args) {
    const handle = make.apply(this, args);
    if (handle && typeof handle.focus === "function" && !handle.__focusGuard) {
      const focus = handle.focus;
      handle.focus = function (...a) {
        if (drawing) throw new Error("FocusHandle.focus() cannot run during render or layout");
        return focus.apply(this, a);
      };
      handle.__focusGuard = true;
    }
    return handle;
  };
  cx.__focusGuard = true;
}

function guard(ctx) {
  if (!ctx || typeof ctx !== "object") return;
  for (const key of Object.keys(ctx)) {
    const Mod = ctx[key];
    if (typeof Mod === "function" && typeof Mod.prototype?.render === "function") guardView(ctx, Mod);
  }
}

function guardView(ctx, Mod) {
  if (Mod.prototype.__renderGuard) return;
  const render = Mod.prototype.render, init = Mod.prototype.init;
  Mod.prototype.__renderGuard = true;
  if (typeof init === "function") Mod.prototype.init = function (props, cx, ...rest) { watch(cx); return init.call(this, props, cx, ...rest); };
  Mod.prototype.render = function (cx, ...rest) {
    watch(cx);
    if (!cx || typeof cx !== "object") { drawing++; try { return render.call(this, cx, ...rest); } finally { drawing--; } }
    const refuse = (what) => () => { throw new Error(`${what} is not allowed during the 'render' phase`); };
    const saved = {};
    for (const k of ["notify", "new", "focus_handle"]) if (typeof cx[k] === "function") { saved[k] = cx[k]; cx[k] = refuse(`cx.${k}()`); }
    const made = ["InputState", "VirtualListScrollHandle"].map(k => [k, ctx[k], ctx[k]?.new]).filter(([, , make]) => make);
    for (const [k, owner] of made) owner.new = refuse(`${k}.new()`);
    drawing++;
    try { return render.call(this, cx, ...rest); } finally { drawing--; Object.assign(cx, saved); for (const [, owner, make] of made) owner.new = make; }
  };
}

for (const name of ["runInContext", "runInNewContext"]) {
  const run = vm[name];
  vm[name] = function (code, ctx, ...rest) {
    const result = run.call(this, code, ctx, ...rest);
    guard(ctx);
    return result;
  };
}
