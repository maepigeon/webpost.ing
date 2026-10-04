import { check, login, assert, uniq, deletePostsTitled, findPostId, openSection, openEditor, sleep } from '../lib.mjs';

/** About a second of silence: MPEG-1 Layer III, 128 kbps, 44.1 kHz frames of zeros (417 bytes each). Needs no dependency. */
function silentMp3(frames = 40) {
  const frame = Buffer.alloc(417);
  frame[0] = 0xFF; frame[1] = 0xFB; frame[2] = 0x90; frame[3] = 0x00;
  return Buffer.concat(Array.from({ length: frames }, () => frame));
}

check('audio: upload an MP3, it shows in the editor and plays in the viewer', async t => {
  const { page } = t;
  await login(page, 'test');
  const title = uniq('smoke audio');
  t.onCleanup(() => deletePostsTitled(page, 'test', 'smoke audio'));

  await openEditor(page);
  await page.locator('.title-input').fill(title);
  await page.locator('.editor-contenteditable').first().click();
  await page.keyboard.type('Listen to this.');
  await openSection(page, 'Insert');
  await page.locator('input[type=file][accept=".mp3,audio/mpeg"]').setInputFiles({
    name: 'smoke-silence.mp3', mimeType: 'audio/mpeg', buffer: silentMp3(),
  });
  const block = page.locator('.audio-block').first();
  await block.waitFor();
  assert((await block.innerText()).includes('smoke-silence'), 'the audio block does not show the file name');

  // In the editor the block holds a real <audio>: the browser must be able to read the file.
  const src = await block.locator('audio').getAttribute('src');
  assert(/\/uploads\/audio\/.+\.mp3$/.test(src || ''), `the audio element points at "${src}"`);
  const r = await page.evaluate(u => fetch(u).then(r => r.status), src);
  assert(r === 200, `the uploaded audio file answers HTTP ${r}`);
  const end = Date.now() + 6000;
  let duration = 0;
  while (Date.now() < end && !(duration > 0)) { duration = await block.locator('audio').evaluate(a => a.duration || 0); await sleep(200); }
  assert(duration > 0, 'the browser could not read the uploaded MP3 (no duration)');
  assert(await block.locator('.audio-error').count() === 0, 'the editor says the audio could not be played');

  await page.getByRole('button', { name: 'Publish' }).click();
  await page.getByText(/Published|your post is live/).first().waitFor();
  const id = await findPostId(page, 'test', title);
  assert(id, 'the post with audio did not save');

  // The reader's block hands over to the shared mini player.
  await page.goto('/test/' + id);
  const viewer = page.locator('.audio-block').first();
  await viewer.waitFor();
  await viewer.getByRole('button', { name: 'Play' }).click();
  await page.locator('.mini-player').waitFor();
}, { area: 'audio' });
