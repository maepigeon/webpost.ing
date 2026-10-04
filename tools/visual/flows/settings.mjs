// Flow 6: Settings. Every section opened one by one (each starts collapsed), with a burst as it opens.
import { sleep } from '../lib.mjs';

const slug = s => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

export default {
  name: 'settings',
  async run(v) {
    const { page } = v;
    await v.login('test');
    await v.goto('/settings');
    const heads = page.locator('summary.settings-section-title');
    const n = await heads.count();
    const names = await heads.allInnerTexts();
    v.note(`${n} sections: ${names.join(' | ')}`);
    await v.shot('collapsed', { fullPage: true });
    // every section starts collapsed
    const open = await page.locator('details[open]').count();
    if (open) throw new Error(`${open} Settings section(s) start open (rule: Settings fold away)`);
    v.step('all sections start collapsed');
    for (let i = 0; i < n; i++) {
      const head = heads.nth(i);
      const name = slug(names[i]);
      await v.click(head);
      await sleep(150);
      await v.burst(`open-${name}`, { frames: 4, gap: 90, fullPage: true });
      v.step(`opened ${names[i]}`);
      if (!await v.noSideScroll()) throw new Error(`sideways scroll with "${names[i]}" open`);
      await v.click(head);   // fold it again so the next one is judged alone
      await sleep(200);
    }
  },
};
