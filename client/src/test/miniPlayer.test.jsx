import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import * as player from '../utils/audioPlayer.js';
import MiniPlayer from '../components/AudioPlayer/MiniPlayer.jsx';

class FakeAudio {
  constructor() { this.paused = true; this.currentTime = 0; this.duration = 100; this.volume = 1; this.muted = false; this.src = ''; this.handlers = {}; }
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

const open = () => render(<MemoryRouter><MiniPlayer /></MemoryRouter>);
const start = () => act(() => { player.play({ src: '/uploads/audio/a.mp3', title: 'Song', postPath: '/u/song' }); });

describe('MiniPlayer', () => {
  it('shows nothing until a track is loaded', () => {
    const { container } = open();
    expect(container.firstChild).toBeNull();
  });

  it('uses the in-post player: pixel buttons and the audio range, no native-looking white box', () => {
    const { container } = open();
    start();
    expect(container.querySelectorAll('.mini-player button.gb').length).toBeGreaterThanOrEqual(3);
    expect(container.querySelector('input.audio-range.audio-seek')).not.toBeNull();
    expect(container.querySelector('input.audio-range.audio-volume')).not.toBeNull();
    expect(container.querySelector('.audio-time svg')).not.toBeNull();
    expect(screen.getByRole('link', { name: 'Song' })).toHaveAttribute('href', '/u/song');
  });

  it('pauses, seeks, sets the volume and closes', () => {
    open();
    start();
    fireEvent.click(screen.getByRole('button', { name: 'Pause' }));
    expect(fake.paused).toBe(true);
    expect(screen.getByRole('button', { name: 'Play' })).toBeInTheDocument();
    fireEvent.change(screen.getByRole('slider', { name: 'Seek' }), { target: { value: '42' } });
    expect(fake.currentTime).toBe(42);
    fireEvent.change(screen.getAllByRole('slider', { name: 'Volume' })[0], { target: { value: '0.5' } });
    expect(fake.volume).toBe(0.5);
    fireEvent.click(screen.getByRole('button', { name: 'Close player' }));
    expect(screen.queryByRole('region', { name: 'Audio player' })).toBeNull();
  });
});
