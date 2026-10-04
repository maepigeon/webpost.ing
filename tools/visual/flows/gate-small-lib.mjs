// Helpers for the gate-small flows (account vt4). No default export: not a flow.
import { readFileSync } from 'node:fs';
const ACCOUNTS = '/private/tmp/claude-501/-Users-mae-workspace-webposting--claude-worktrees-kind-driscoll-e5fb5f/87be1c04-857d-4336-9a7a-4bd52c5ce943/scratchpad/run/gate-accounts.txt';
export function vt4Password() {
  const line = readFileSync(ACCOUNTS, 'utf8').split('\n').find(l => l.startsWith('vt4'));
  return line.split(/\s+/)[2];
}
/** Signs in as vt4 (the password comes from the accounts file, never printed). */
export async function loginVt4(v) {
  const r = await v.context.request.post(v.base + '/api/loginSessionAttempt', { data: { username: 'vt4', password: vt4Password() } });
  if (!r.ok()) throw new Error('login as vt4 failed: HTTP ' + r.status());
  await v.context.addInitScript(u => { try { localStorage.setItem('userName', u); localStorage.setItem('isAdmin', '0'); } catch {} }, 'vt4');
}
export const FONT_PROBE = sel => {
  const els = [...document.querySelectorAll(sel)].slice(0, 12);
  return els.map(e => e.tagName + '.' + (e.className?.toString().split(' ')[0] || '') + ' ' + getComputedStyle(e).fontFamily.split(',')[0].trim());
};
export async function fontReport(v, sel, label) {
  const rows = await v.page.evaluate(FONT_PROBE, sel);
  const set = [...new Set(rows.map(r => r.split(' ').slice(1).join(' ')))];
  v.note('fonts ' + label + ': ' + set.join(' / '));
  return set;
}
export async function widths(page, sel) {
  return page.evaluate(s => [...document.querySelectorAll(s)].map(e => { const r = e.getBoundingClientRect(); return [Math.round(r.x), Math.round(r.width)]; }), sel);
}
