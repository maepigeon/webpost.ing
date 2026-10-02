import { describe, it, expect } from 'vitest';
import { wrapWords, textGrid } from '../utils/gridText.js';
import { rowChars, linkAt } from '../components/Pages/Posts/PostRenderer/RichTextPost/TileGrid/tileGrid.js';

describe('text as a grid', () => {
  it('wraps words onto rows no longer than the width, breaking over-long words', () => {
    expect(wrapWords('one two three four', 9)).toEqual(['one two', 'three', 'four']);
    expect(wrapWords('abcdefghij', 4)).toEqual(['abcd', 'efgh', 'ij']);
    expect(wrapWords('   ', 5)).toEqual([]);
  });

  it('writes each row in the colour and font given, transparent behind', () => {
    const g = textGrid('Hi there', { cols: 3, color: '#102030', font: 'small' });
    expect(g.rows).toBe(2);
    const layer = g.layers[0];
    expect(rowChars(g, layer, 0).join('').trim()).toBe('Hi');
    expect(rowChars(g, layer, 1).join('').trim()).toBe('there');
    expect(layer.style['0,0']).toEqual({ color: '#102030', font: 'small' });
    expect(layer.paint).toBeNull();
  });

  it('links the first run of text it names, tile by tile', () => {
    const g = textGrid('visit Mae Pigeon today', { cols: 12, links: [{ text: 'Mae Pigeon', href: '/maepigeon' }] });
    expect(g.links).toHaveLength(1);
    expect(g.links[0].href).toBe('/maepigeon');
    expect(linkAt(g, 0, 3).href).toBe('/maepigeon');
    expect(linkAt(g, 0, 0)).toBeNull();
  });
});
