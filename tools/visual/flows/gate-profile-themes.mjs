// gate-profile: the owner profile on Neon (dark) and Newspaper (serif): top, folder popover, arrange, bio editor, banner editor, visitor view.
// (Corkboard is the account's own theme and is covered by the other flows.) The theme is restored at the end.
import { sleep } from '../lib.mjs';
import { MASKS, DARK, saveTheme, fonts, CONTROLS } from './gate-profile-lib.mjs';

async function pass(v, tag) {
  const { page } = v;
  await v.goto('/test');
  await page.locator('.profile-tab').first().waitFor();
  await sleep(500);
  await v.shot(`${tag}-top`, { dynamic: true, mask: MASKS });
  await v.shot(`${tag}-full`, { fullPage: true, dynamic: true, mask: MASKS });
  if (!await v.noSideScroll()) throw new Error(`${tag}: profile scrolls sideways`);
  await fonts(v, tag, CONTROLS);
  await v.click(page.locator('.profile-post-folder-btn').first());
  await page.locator('.profile-post-folder-menu').waitFor();
  await sleep(300);
  await v.shot(`${tag}-folder`, { dynamic: true, keepPointer: true, mask: MASKS });
  await page.mouse.move(30, 300, { steps: 3 }); await page.mouse.click(30, 300); await sleep(250);
  await v.click(page.getByRole('button', { name: 'Arrange posts' }).first());
  await page.locator('section.arrange').waitFor();
  await sleep(500);
  await v.shot(`${tag}-arrange`, { dynamic: true, mask: MASKS });
  await v.click(page.locator('.arrange-done'));
  await sleep(400);
  await v.click(page.getByRole('button', { name: /^(Edit bio|\+ Bio)$/ }));
  await page.getByPlaceholder('Write a short bio...').waitFor();
  await sleep(300);
  await v.shot(`${tag}-bio`, { dynamic: true, mask: MASKS });
  await v.click(page.getByRole('button', { name: 'Cancel' }).first());
  await sleep(300);
  await v.click(page.getByRole('button', { name: /^(Edit banner|\+ Banner)$/ }));
  await page.locator('.banner-editor').waitFor();
  await sleep(900);
  await v.shot(`${tag}-banner`, { dynamic: true, mask: MASKS });
  await v.click(page.locator('.banner-editor-actions').getByRole('button', { name: 'Cancel' }));
  await sleep(500);
  await v.click(page.getByRole('button', { name: 'View as visitor' }));
  await page.getByText('Viewing your profile as a visitor').waitFor();
  await sleep(500);
  await v.shot(`${tag}-visitor`, { dynamic: true, mask: MASKS });
  await v.click(page.getByRole('button', { name: 'Back to editing' }));
  await sleep(300);
  v.step(`${tag}: top, folder popover, arrange, bio, banner, visitor`);
}

export default {
  name: 'gate-profile-themes',
  async run(v) {
    await v.login('test');
    await saveTheme(v);
    let r = await v.api('PUT', '/api/users/test/theme', { theme: DARK });
    if (!r.ok) throw new Error('could not set neon: HTTP ' + r.status);
    await pass(v, 'neon');
    r = await v.api('PUT', '/api/users/test/theme', { theme: null });
    if (!r.ok) throw new Error('could not set the default (newspaper): HTTP ' + r.status);
    await pass(v, 'newspaper');
  },
};
