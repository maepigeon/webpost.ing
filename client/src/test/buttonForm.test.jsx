import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, act, cleanup, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { LexicalComposer } from '@lexical/react/LexicalComposer';
import { RichTextPlugin } from '@lexical/react/LexicalRichTextPlugin';
import { ContentEditable } from '@lexical/react/LexicalContentEditable';
import { LexicalErrorBoundary } from '@lexical/react/LexicalErrorBoundary';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { $getRoot, $createParagraphNode, $createTextNode } from 'lexical';
import { ButtonNode, $createButtonNode } from '../components/Pages/Posts/PostRenderer/RichTextPost/ButtonNode.jsx';

// Newer Node has a global localStorage that is undefined without a file: use a plain one.
const store = new Map();
vi.stubGlobal('localStorage', {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => { store.set(k, String(v)); },
  removeItem: (k) => { store.delete(k); },
  clear: () => store.clear(),
});

let editorRef;
function Grab() {
  [editorRef] = useLexicalComposerContext();
  return null;
}

// An editable post: a new button (no target yet) followed by a paragraph.
function mount(data = {}) {
  return render(
    <MemoryRouter>
      <LexicalComposer initialConfig={{
        namespace: 'form-test', nodes: [ButtonNode], onError: (e) => { throw e; }, editable: true,
        editorState: () => {
          const p = $createParagraphNode();
          p.append($createTextNode('after'));
          $getRoot().append($createButtonNode(data), p);
        },
      }}>
        <RichTextPlugin contentEditable={<ContentEditable />} placeholder={null} ErrorBoundary={LexicalErrorBoundary} />
        <Grab />
      </LexicalComposer>
    </MemoryRouter>
  );
}

const form = (c) => c.querySelector('.pb-form');
const address = (c) => c.querySelector('input[type="url"]');
const savedTarget = () => editorRef.getEditorState().read(() => $getRoot().getFirstChild().getData().target);

/** Types one character at a time, as a person does: each change re-renders before the next. */
async function typeSlowly(input, text) {
  let value = '';
  for (const ch of text) {
    value += ch;
    await act(async () => { fireEvent.change(input, { target: { value } }); });
  }
}

afterEach(cleanup);

describe('Button block form while typing an address', () => {
  it('stays open and keeps the whole address when the text becomes valid part-way', async () => {
    const { container } = mount();
    await act(async () => {});
    expect(form(container)).not.toBeNull();   // new button: open
    const input = address(container);
    await act(async () => { input.focus(); });
    await typeSlowly(input, 'https://example.com/page');
    expect(form(container)).not.toBeNull();
    expect(address(container).value).toBe('https://example.com/page');
    expect(savedTarget()).toBe('https://example.com/page');
  });

  it('closes on Escape', async () => {
    const { container } = mount();
    await act(async () => {});
    const input = address(container);
    await typeSlowly(input, 'https://example.com');
    expect(form(container)).not.toBeNull();
    await act(async () => { fireEvent.keyDown(input, { key: 'Escape' }); });
    expect(form(container)).toBeNull();
  });

  it('closes when focus leaves to elsewhere in the post, but not when it moves within the form', async () => {
    const { container } = mount();
    await act(async () => {});
    const input = address(container);
    await act(async () => { input.focus(); });
    await typeSlowly(input, 'https://example.com');
    // Another field of the same form: still open.
    const label = container.querySelector('.pb-form input[type="text"]');
    await act(async () => { label.focus(); });
    expect(form(container)).not.toBeNull();
    // A click inside the form on something that cannot take focus: still open.
    await act(async () => {
      fireEvent.mouseDown(container.querySelector('.pb-form'));
      fireEvent.blur(label, { relatedTarget: null });
    });
    expect(form(container)).not.toBeNull();
    await act(async () => { fireEvent.mouseUp(window); });
    // Focus goes to the paragraph after the button.
    await act(async () => { fireEvent.blur(label, { relatedTarget: container.querySelector('p') }); });
    expect(form(container)).toBeNull();
  });

  it('opens again when the block is selected', async () => {
    const { container } = mount();
    await act(async () => {});
    await typeSlowly(address(container), 'https://example.com');
    await act(async () => { fireEvent.keyDown(address(container), { key: 'Escape' }); });
    expect(form(container)).toBeNull();
    await act(async () => { fireEvent.click(container.querySelector('.pb-wrap')); });
    expect(form(container)).not.toBeNull();
    expect(address(container).value).toBe('https://example.com');
  });

  it('keeps a new button open while its target is still invalid, even after focus leaves', async () => {
    const { container } = mount();
    await act(async () => {});
    const input = address(container);
    await act(async () => { input.focus(); });
    await typeSlowly(input, 'htt');
    await act(async () => { fireEvent.blur(input, { relatedTarget: container.querySelector('p') }); });
    expect(form(container)).not.toBeNull();
  });
});
