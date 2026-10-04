// gate-dialogs: do the buttons on inbox, activity, search, discussion and a themed post page still look like buttons?
// Measures every visible button (background, text colour, contrast, font, border, radius) and takes unmasked shots.
import { sleep } from '../lib.mjs';
import { loginOnce, raw } from './gate-dialogs-helpers.mjs';

async function buttonFacts(page) {
  return page.evaluate(() => {
    const parse = c => { const m = c.match(/rgba?\(([^)]+)\)/); if (!m) return [0, 0, 0, 0]; const p = m[1].split(/[ ,\/]+/).filter(Boolean).map(Number); return [p[0], p[1], p[2], p.length > 3 ? p[3] : 1]; };
    const lum = ([r, g, b]) => { const f = x => { x /= 255; return x <= .03928 ? x / 12.92 : ((x + .055) / 1.055) ** 2.4; }; return .2126 * f(r) + .7152 * f(g) + .0722 * f(b); };
    // effective background: walk up until an opaque colour
    const bgOf = e => { let acc = [255, 255, 255]; const chain = []; for (let n = e; n; n = n.parentElement) chain.push(n); for (const n of chain.reverse()) { const [r, g, b, a] = parse(getComputedStyle(n).backgroundColor); if (a > 0) acc = acc.map((x, i) => Math.round(x * (1 - a) + [r, g, b][i] * a)); } return acc; };
    const out = [];
    for (const e of document.querySelectorAll('button, a[role=button], [role=tab], input[type=submit]')) {
      if (!e.offsetParent) continue; const r = e.getBoundingClientRect(); if (r.width < 8 || r.height < 8) continue;
      const s = getComputedStyle(e); const bg = bgOf(e); const fg = parse(s.color);
      const l1 = lum(fg.slice(0, 3)), l2 = lum(bg); const cr = (Math.max(l1, l2) + .05) / (Math.min(l1, l2) + .05);
      out.push({ label: (e.innerText || e.getAttribute('aria-label') || e.title || '').trim().slice(0, 20), cls: String(e.className).split(' ')[0], font: s.fontFamily.split(',')[0].replace(/"/g, ''), bg: bg.join(','), fg: fg.slice(0, 3).join(','), contrast: Math.round(cr * 10) / 10, border: s.borderTopWidth + ' ' + s.borderTopStyle, radius: s.borderTopLeftRadius, shadow: s.boxShadow === 'none' ? '' : 'sh', w: Math.round(r.width), h: Math.round(r.height), ring: s.outlineStyle + ' ' + s.outlineWidth });
    }
    return out;
  });
}

const PAGES = [
  ['inbox', '/inbox'],
  ['activity', '/activity/test3'],
  ['search', '/search?q=test'],
  ['discussion-neon', '/test2/audio-review/discussion'],
  ['post-neon', '/test2/audio-review'],
  ['post-cork', '/test/grid'],
  ['messages', '/messages'],
];

export default {
  name: 'gate-dialogs-buttons',
  async run(v) {
    const { page } = v;
    await loginOnce(v);
    const low = [];
    for (const [id, url] of PAGES) {
      await v.goto(url);
      if (id === 'search') { const q = page.locator('input[type=search], input[type=text]').first(); if (await q.count()) { await v.click(q); await v.type('test'); await page.keyboard.press('Enter'); await sleep(1200); } }
      await raw(v, 'btn-' + id);
      const f = await buttonFacts(page);
      const fonts = [...new Set(f.map(b => b.font))];
      const sigs = {}; for (const b of f) { const k = `${b.bg}|${b.fg}|${b.border}|${b.radius}|${b.shadow}`; (sigs[k] ||= []).push(b.label || b.cls); }
      v.note(`[${id}] ${f.length} buttons; fonts: ${fonts.join(' / ')}; contrast<3: ${f.filter(b => b.contrast < 3).map(b => `${b.label || b.cls}(${b.contrast})`).join(', ') || 'none'}`);
      v.note(`[${id}] styles: ` + Object.entries(sigs).map(([k, n]) => `${k} => ${n.slice(0, 6).join('/')}`).join(' ;; '));
      for (const b of f.filter(b => b.contrast < 3)) low.push(`${id}: ${b.label || b.cls} contrast ${b.contrast}`);
      if (!await v.noSideScroll()) v.note(`[${id}] page scrolls sideways`);
    }
    if (low.length) throw new Error('low contrast buttons: ' + low.join('; ').slice(0, 600));
  },
};
