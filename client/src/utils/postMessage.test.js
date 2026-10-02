import { describe, it, expect } from 'vitest';
import { postMessage, splitPosts, plainMessageText } from './postMessage.js';
import { packMessage } from './packMessage.js';

const PACK_ID = '0f8fad5b-d9cb-469f-a165-70867728950e';

describe('post messages', () => {
  it('round-trips a shared post', () => {
    const msg = postMessage('My grid', 42);
    expect(msg).toBe('Shared a post: My grid\n[[post:42]]');
    expect(splitPosts(msg)).toEqual({ text: 'Shared a post: My grid', postIds: ['42'] });
  });

  it("keeps the sender's note, and tidies a title with line breaks", () => {
    const msg = postMessage('Two\nlines', 7, '  look at this  ');
    expect(splitPosts(msg)).toEqual({ text: 'Shared a post: Two lines\nlook at this', postIds: ['7'] });
  });

  it('names an untitled post and cuts a very long title', () => {
    expect(postMessage('', 1).split('\n')[0]).toBe('Shared a post: Untitled');
    expect(postMessage('x'.repeat(200), 1).split('\n')[0].length).toBe('Shared a post: '.length + 80);
  });

  it('leaves ordinary text alone, including a post line inside other text', () => {
    expect(splitPosts('hello')).toEqual({ text: 'hello', postIds: [] });
    expect(splitPosts('see [[post:5]] here').postIds).toEqual([]);
    expect(splitPosts('[[post:abc]]').postIds).toEqual([]);
    expect(splitPosts('[[post:]]').postIds).toEqual([]);
    expect(splitPosts(null)).toEqual({ text: null, postIds: [] });
  });

  it('finds several posts, and previews cleanly beside a pack line', () => {
    const both = `${postMessage('A', 1)}\n[[post:2]]\r\n${packMessage('stickers', 'Dots', PACK_ID)}`;
    expect(splitPosts(both).postIds).toEqual(['1', '2']);
    expect(plainMessageText(both)).toBe('Shared a post: A\nShared a sticker pack: Dots');
  });
});
