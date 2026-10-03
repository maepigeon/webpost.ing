import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../utils/fontLoader.js', () => ({ ensureFontsIn: vi.fn(() => Promise.resolve()) }));

import { applyCodeDisplay, CODE_FONTS } from '../utils/codeDisplay.js';
import { ensureFontsIn } from '../utils/fontLoader.js';

beforeEach(() => { ensureFontsIn.mockClear(); });

describe('applyCodeDisplay', () => {
  it('sets the font and size on the page', () => {
    applyCodeDisplay({ codeFont: 'courier', codeFontSize: 99 });
    expect(document.documentElement.style.getPropertyValue('--code-font')).toBe(CODE_FONTS.courier.stack);
    expect(document.documentElement.style.getPropertyValue('--code-font-size')).toBe('24px');
  });

  it('asks for the chosen font\'s web font, which now loads only on demand', () => {
    applyCodeDisplay({ codeFont: 'jetbrains' });
    expect(ensureFontsIn).toHaveBeenCalledWith(CODE_FONTS.jetbrains.stack);
    applyCodeDisplay({ codeFont: 'ibm-plex' });
    expect(ensureFontsIn).toHaveBeenLastCalledWith(CODE_FONTS['ibm-plex'].stack);
  });
});
