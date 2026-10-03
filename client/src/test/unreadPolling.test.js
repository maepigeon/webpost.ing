import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  POLL_MS, SLOW_POLL_MS, UNCHANGED_BEFORE_SLOW,
  pollDelay, countsPageChanged, createCounterPoller,
} from '../components/Navbar/useUnreadCounts.js';

describe('pollDelay', () => {
  it('is 45 s until five polls in a row have found nothing new, then 2 min', () => {
    expect(pollDelay(0)).toBe(POLL_MS);
    expect(pollDelay(UNCHANGED_BEFORE_SLOW - 1)).toBe(POLL_MS);
    expect(pollDelay(UNCHANGED_BEFORE_SLOW)).toBe(SLOW_POLL_MS);
    expect(POLL_MS).toBe(45000);
    expect(SLOW_POLL_MS).toBe(120000);
  });
});

describe('countsPageChanged', () => {
  it('recounts only when entering or leaving Messages or Inbox', () => {
    expect(countsPageChanged('/', '/messages')).toBe(true);
    expect(countsPageChanged('/inbox', '/')).toBe(true);
    expect(countsPageChanged('/messages', '/inbox')).toBe(true);
    expect(countsPageChanged('/', '/discover')).toBe(false);
    expect(countsPageChanged('/discover', '/editor/3')).toBe(false);
    expect(countsPageChanged('/messages', '/messages')).toBe(false);
  });
});

describe('createCounterPoller', () => {
  let hidden;
  let load;
  let seen;
  let poller;
  const make = () => createCounterPoller({
    load, onCounts: d => seen.push(d), isHidden: () => hidden,
  });

  beforeEach(() => {
    vi.useFakeTimers();
    hidden = false;
    seen = [];
    load = vi.fn().mockResolvedValue({ messages: 1, notifications: 2 });
  });
  afterEach(() => { poller?.stop(); vi.useRealTimers(); });

  it('loads at once, then every 45 s', async () => {
    poller = make();
    poller.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(load).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(44999);
    expect(load).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(load).toHaveBeenCalledTimes(2);
    expect(seen).toHaveLength(2);
  });

  it('slows to 2 minutes after five unchanged polls and speeds up on a change', async () => {
    poller = make();
    poller.start();
    await vi.advanceTimersByTimeAsync(0);              // poll 1 (first sight)
    for (let i = 0; i < UNCHANGED_BEFORE_SLOW; i++) await vi.advanceTimersByTimeAsync(POLL_MS);
    expect(load).toHaveBeenCalledTimes(1 + UNCHANGED_BEFORE_SLOW);
    // Now unchanged = 5: the next wait is 2 minutes.
    await vi.advanceTimersByTimeAsync(POLL_MS);
    expect(load).toHaveBeenCalledTimes(1 + UNCHANGED_BEFORE_SLOW);
    await vi.advanceTimersByTimeAsync(SLOW_POLL_MS - POLL_MS);
    expect(load).toHaveBeenCalledTimes(2 + UNCHANGED_BEFORE_SLOW);
    // A new count resets the pace.
    load.mockResolvedValue({ messages: 4, notifications: 2 });
    await vi.advanceTimersByTimeAsync(SLOW_POLL_MS);
    const n = load.mock.calls.length;
    await vi.advanceTimersByTimeAsync(POLL_MS);
    expect(load).toHaveBeenCalledTimes(n + 1);
  });

  it('makes no request while the tab is hidden and recounts once when it returns', async () => {
    poller = make();
    poller.start();
    await vi.advanceTimersByTimeAsync(0);
    hidden = true;
    await vi.advanceTimersByTimeAsync(POLL_MS * 10);
    expect(load).toHaveBeenCalledTimes(1);
    hidden = false;
    poller.visible();
    await vi.advanceTimersByTimeAsync(0);
    expect(load).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(POLL_MS);
    expect(load).toHaveBeenCalledTimes(3);
  });

  it('does not recount for a hidden tab on refresh or visible()', async () => {
    poller = make();
    hidden = true;
    poller.refresh();
    poller.visible();
    await vi.advanceTimersByTimeAsync(0);
    expect(load).not.toHaveBeenCalled();
  });

  it('refresh recounts now and keeps one timer going', async () => {
    poller = make();
    poller.start();
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(10000);
    poller.refresh();
    await vi.advanceTimersByTimeAsync(0);
    expect(load).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(POLL_MS);
    expect(load).toHaveBeenCalledTimes(3);
  });

  it('survives a failed request and tries again on schedule', async () => {
    load.mockRejectedValueOnce(new Error('offline'));
    poller = make();
    poller.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(seen).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(POLL_MS);
    expect(seen).toHaveLength(1);
  });

  it('stop ends the schedule', async () => {
    poller = make();
    poller.start();
    await vi.advanceTimersByTimeAsync(0);
    poller.stop();
    await vi.advanceTimersByTimeAsync(POLL_MS * 5);
    expect(load).toHaveBeenCalledTimes(1);
  });
});
