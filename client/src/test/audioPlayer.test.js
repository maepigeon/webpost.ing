import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as player from '../utils/audioPlayer.js';

class FakeAudio {
  constructor() {
    this.paused = true; this.ended = false; this.currentTime = 0; this.duration = NaN;
    this.volume = 1; this.muted = false; this.src = ''; this.handlers = {};
  }
  addEventListener(ev, fn) { (this.handlers[ev] ||= []).push(fn); }
  removeAttribute() { this.src = ''; }
  load() {}
  fire(ev) { (this.handlers[ev] || []).forEach(f => f()); }
  play() { this.paused = false; this.fire('play'); return Promise.resolve(); }
  pause() { if (!this.paused) { this.paused = true; this.fire('pause'); } }
}

let fake;
beforeEach(() => {
  fake = new FakeAudio();
  player.__resetForTests(() => fake);
});

describe('audioPlayer', () => {
  it('starts empty', () => {
    expect(player.getState()).toMatchObject({ src: '', playing: false, currentTime: 0 });
  });

  it('plays a same-site upload', () => {
    player.play({ src: '/uploads/audio/a.mp3', title: 'A', postPath: '/u/1' });
    expect(player.getState()).toMatchObject({ src: '/uploads/audio/a.mp3', title: 'A', postPath: '/u/1', playing: true });
    expect(fake.src).toContain('/uploads/audio/a.mp3');
  });

  it('ignores anything that is not a same-site upload', () => {
    for (const src of ['https://evil.test/a.mp3', '//evil.test/a.mp3', '/uploads/../x.mp3', '/other/a.mp3', '', null]) {
      player.play({ src });
    }
    expect(player.getState().src).toBe('');
    expect(fake.paused).toBe(true);
  });

  it('toggles and pauses', () => {
    player.play({ src: '/uploads/a.mp3' });
    player.toggle();
    expect(player.getState().playing).toBe(false);
    player.toggle();
    expect(player.getState().playing).toBe(true);
    player.pause();
    expect(player.getState().playing).toBe(false);
  });

  it('a new track replaces the current one', () => {
    player.play({ src: '/uploads/a.mp3', title: 'A' });
    fake.currentTime = 30;
    player.play({ src: '/uploads/b.mp3', title: 'B' });
    expect(player.getState()).toMatchObject({ src: '/uploads/b.mp3', title: 'B', currentTime: 0, playing: true });
  });

  it('seeks within the duration', () => {
    player.play({ src: '/uploads/a.mp3' });
    fake.duration = 100; fake.fire('loadedmetadata');
    player.seek(40);
    expect(fake.currentTime).toBe(40);
    player.seek(500);
    expect(fake.currentTime).toBe(100);
    player.seek(-5);
    expect(fake.currentTime).toBe(0);
  });

  it('sets volume, clamped', () => {
    player.play({ src: '/uploads/a.mp3' });
    player.setVolume(2);
    expect(player.getState().volume).toBe(1);
    player.setVolume(0.4);
    expect(fake.volume).toBe(0.4);
    expect(player.getState().volume).toBe(0.4);
  });

  it('stop pauses and clears the track', () => {
    player.play({ src: '/uploads/a.mp3', title: 'A' });
    player.stop();
    expect(fake.paused).toBe(true);
    expect(player.getState()).toMatchObject({ src: '', title: '', playing: false });
  });

  it('notifies subscribers and stops after unsubscribe', () => {
    const fn = vi.fn();
    const off = player.subscribe(fn);
    player.play({ src: '/uploads/a.mp3' });
    expect(fn).toHaveBeenCalled();
    fn.mockClear();
    off();
    player.pause();
    expect(fn).not.toHaveBeenCalled();
  });

  it('throttles timeupdate', () => {
    player.play({ src: '/uploads/a.mp3' });
    const fn = vi.fn();
    player.subscribe(fn);
    for (let i = 0; i < 20; i++) fake.fire('timeupdate');
    expect(fn.mock.calls.length).toBeLessThanOrEqual(1);
  });

  it('ended reports not playing', () => {
    player.play({ src: '/uploads/a.mp3' });
    fake.paused = true; fake.ended = true; fake.fire('ended');
    expect(player.getState().playing).toBe(false);
  });
});
