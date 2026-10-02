import { describe, it, expect } from 'vitest';
import { packMessage, splitPacks } from './packMessage.js';

const ID = '0f8fad5b-d9cb-469f-a165-70867728950e';

describe('pack messages', () => {
  it('round-trips a shared pack', () => {
    const msg = packMessage('stickers', 'Dots', ID);
    expect(msg.split('\n')[0]).toBe('Shared a sticker pack: Dots');
    expect(splitPacks(msg)).toEqual({ text: 'Shared a sticker pack: Dots', packIds: [ID] });
  });

  it('leaves ordinary text alone, including a pack line inside other text', () => {
    expect(splitPacks('hello')).toEqual({ text: 'hello', packIds: [] });
    expect(splitPacks(`see [[pack:${ID}]] here`).packIds).toEqual([]);
    expect(splitPacks('[[pack:not-an-id]]').packIds).toEqual([]);
  });
});
