import { check, login, assert, noHorizontalScroll, waitForIdle } from '../lib.mjs';

check('settings: sections start folded, open on click', async t => {
  const { page } = t;
  await login(page, 'test');
  await page.goto('/settings');
  await page.locator('.settings-section').first().waitFor();
  const sections = page.locator('details.settings-section');
  const n = await sections.count();
  assert(n >= 6, `only ${n} settings sections`);
  const open = await sections.evaluateAll(els => els.filter(e => e.open).map(e => e.id));
  assert(open.length === 0, `settings sections open on a first visit: ${open.join(', ')}`);
  for (const label of ['Email', 'Password', 'Security', 'Delete account'])
    assert(await page.locator('summary.settings-section-title', { hasText: label }).count() > 0, `no "${label}" section`);
  await page.locator('summary.settings-section-title', { hasText: 'Password' }).click();
  await page.locator('#settings-password .settings-input').first().waitFor();
  assert(await noHorizontalScroll(page), 'settings scrolls sideways');
}, { area: 'settings' });

check('settings: a wrong current password is refused', async t => {
  // test3, so a failed guess never touches the main test account.
  const page = await t.newUser('test3');
  await page.goto('/settings');
  await page.locator('summary.settings-section-title', { hasText: 'Password' }).click();
  const form = page.locator('.settings-password-form').first();
  await form.waitFor();
  const inputs = form.locator('input[type=password]');
  await inputs.nth(0).fill('definitely-wrong-1');
  await inputs.nth(1).fill('Another-Pass-9988!');
  await inputs.nth(2).fill('Another-Pass-9988!');
  await form.getByRole('button', { name: 'Change password' }).click();
  await form.locator('[role=alert]').first().waitFor();
  assert(page.url().includes('/settings'), 'a wrong password sent the user away from Settings');
  // Still signed in with the old password: the session survived.
  const r = await page.evaluate(() => fetch('/api/admin/me', { credentials: 'include' }).then(r => r.status));
  assert(r === 200, `session lost after a refused password change (HTTP ${r})`);
}, { area: 'settings' });

check('settings: Security and Delete account sections exist (delete is never run)', async t => {
  const { page } = t;
  await login(page, 'test3');
  await page.goto('/settings');
  await page.locator('summary.settings-section-title', { hasText: 'Security' }).click();
  await page.locator('#settings-security .security-heading').first().waitFor();
  await page.locator('summary.settings-section-title', { hasText: 'Delete account' }).click();
  const del = page.locator('#settings-delete-account form');
  await del.waitFor();
  const btn = del.locator('button[type=submit]');
  assert(await btn.isDisabled(), 'the Delete account button is enabled before the password and name are typed');
}, { area: 'settings' });
