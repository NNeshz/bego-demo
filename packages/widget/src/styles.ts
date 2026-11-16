/**
 * Shadow DOM styles: nothing leaks in or out of the host page.
 * Hosts can theme the widget through CSS custom properties (they pierce the
 * shadow boundary) and ::part() selectors:
 *
 *   retorno-widget {
 *     --retorno-accent: #f3e23f;   --retorno-font: inherit;
 *     --retorno-radius: 18px;      --retorno-bg / --retorno-fg / --retorno-muted / --retorno-border
 *   }
 *   retorno-widget::part(card) { … }
 */
export const STYLES = /* css */ `
:host {
  --_accent: var(--retorno-accent, #f3e23f);
  --_accent-fg: var(--retorno-accent-fg, #12151b);
  --_money: var(--retorno-money, #5b5200);
  --_bg: var(--retorno-bg, #fffef5);
  --_card: var(--retorno-card, #ffffff);
  --_fg: var(--retorno-fg, #12151b);
  --_muted: var(--retorno-muted, #6b6f78);
  --_border: var(--retorno-border, rgba(18, 21, 27, 0.12));
  --_radius: var(--retorno-radius, 18px);
  display: block;
  font-family: var(--retorno-font, inherit);
  color: var(--_fg);
  container-type: inline-size;
}
:host([hidden]) { display: none; }
:host([theme="dark"]) {
  --_money: var(--retorno-money, #f3e23f);
  --_bg: var(--retorno-bg, #12151b);
  --_card: var(--retorno-card, #1b1f27);
  --_fg: var(--retorno-fg, #f6f4e6);
  --_muted: var(--retorno-muted, #a3a8b3);
  --_border: var(--retorno-border, rgba(255, 255, 255, 0.12));
}
@media (prefers-color-scheme: dark) {
  :host([theme="auto"]) {
    --_money: var(--retorno-money, #f3e23f);
    --_bg: var(--retorno-bg, #12151b);
    --_card: var(--retorno-card, #1b1f27);
    --_fg: var(--retorno-fg, #f6f4e6);
    --_muted: var(--retorno-muted, #a3a8b3);
    --_border: var(--retorno-border, rgba(255, 255, 255, 0.12));
  }
}
* { box-sizing: border-box; }
.root { background: var(--_bg); border: 1px solid var(--_border); border-radius: var(--_radius); padding: 16px; display: flex; flex-direction: column; gap: 12px; }
.head { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; flex-wrap: wrap; }
.title { font-size: 15px; font-weight: 600; margin: 0; }
.sub { font-size: 12px; color: var(--_muted); margin: 0; }
.baseline { font-size: 12px; color: var(--_muted); border: 1px dashed var(--_border); border-radius: calc(var(--_radius) * 0.6); padding: 8px 10px; display: flex; justify-content: space-between; gap: 8px; }
.list { display: flex; flex-direction: column; gap: 10px; list-style: none; margin: 0; padding: 0; }
.card { min-width: 0; grid-template-columns: minmax(0, 1fr); background: var(--_card); border: 1px solid var(--_border); border-radius: calc(var(--_radius) * 0.8); padding: 12px 14px; display: grid; gap: 8px; }
.card[data-best] { border-color: var(--_accent); box-shadow: 0 0 0 1px var(--_accent); }
.row { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.route { flex: 1; min-width: 0; font-size: 15px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.badge { font-size: 10px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; background: var(--_accent); color: var(--_accent-fg); border-radius: 999px; padding: 3px 8px; white-space: nowrap; }
.meta { font-size: 12px; color: var(--_muted); }
.gain { font-size: 24px; font-weight: 600; color: var(--_money); font-variant-numeric: tabular-nums; line-height: 1.1; }
.gain small { font-size: 12px; font-weight: 400; color: var(--_muted); margin-left: 6px; }
.chips { display: flex; flex-wrap: wrap; gap: 6px; }
.chip { font-size: 11px; border: 1px solid var(--_border); border-radius: 999px; padding: 3px 8px; }
.why { font-size: 13px; line-height: 1.45; margin: 0; padding: 8px 10px; border-radius: calc(var(--_radius) * 0.5); background: color-mix(in srgb, var(--_accent) 18%, transparent); }
.actions { display: flex; gap: 8px; }
button, select { font: inherit; color: inherit; }
.btn { flex: 1; min-height: 40px; border-radius: 999px; border: 1px solid var(--_border); background: transparent; cursor: pointer; font-size: 13px; font-weight: 600; padding: 0 14px; }
.btn:hover { border-color: var(--_fg); }
.btn-primary { background: var(--_accent); color: var(--_accent-fg); border-color: transparent; }
.btn-primary:hover { filter: brightness(0.96); border-color: transparent; }
.btn:focus-visible, select:focus-visible { outline: 2px solid var(--_accent); outline-offset: 2px; }
.btn[disabled] { opacity: .5; cursor: default; }
.done { font-size: 13px; font-weight: 600; color: var(--_money); }
.state { text-align: center; padding: 20px 8px; font-size: 13px; color: var(--_muted); display: grid; gap: 10px; justify-items: center; }
.skeleton { height: 120px; border-radius: calc(var(--_radius) * 0.8); background: linear-gradient(90deg, var(--_card), var(--_border), var(--_card)); background-size: 200% 100%; animation: shimmer 1.2s infinite linear; }
@keyframes shimmer { from { background-position: 200% 0; } to { background-position: -200% 0; } }
@media (prefers-reduced-motion: reduce) { .skeleton { animation: none; } }
form { display: grid; gap: 8px; }
label { display: grid; gap: 4px; font-size: 12px; color: var(--_muted); }
select { min-height: 40px; border-radius: 10px; border: 1px solid var(--_border); background: var(--_card); padding: 0 10px; font-size: 14px; }
.foot { font-size: 10px; color: var(--_muted); text-align: right; }
@container (min-width: 560px) {
  .list { display: grid; grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); }
  form { grid-template-columns: repeat(3, 1fr) auto; align-items: end; }
}
`;
