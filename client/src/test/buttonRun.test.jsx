import { describe, it, expect, afterEach } from 'vitest';
import { render, act, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { LexicalComposer } from '@lexical/react/LexicalComposer';
import { RichTextPlugin } from '@lexical/react/LexicalRichTextPlugin';
import { ContentEditable } from '@lexical/react/LexicalContentEditable';
import { LexicalErrorBoundary } from '@lexical/react/LexicalErrorBoundary';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { $getRoot, $createParagraphNode } from 'lexical';
import { ButtonNode, $createButtonNode, $buttonRun } from '../components/Pages/Posts/PostRenderer/RichTextPost/ButtonNode.jsx';

const btn = (label, align) => $createButtonNode({ label, action: 'link', target: 'https://example.com', align });

let editorRef;
function Grab() {
  [editorRef] = useLexicalComposerContext();
  return null;
}

function mount(items) {
  const result = render(
    <MemoryRouter>
      <LexicalComposer initialConfig={{
        namespace: 'run-test', nodes: [ButtonNode], onError: (e) => { throw e; }, editable: false,
        editorState: () => {
          const root = $getRoot();
          items.forEach(([label, align]) => root.append(label ? btn(label, align) : $createParagraphNode()));
        },
      }}>
        <RichTextPlugin contentEditable={<ContentEditable />} placeholder={null} ErrorBoundary={LexicalErrorBoundary} />
        <Grab />
      </LexicalComposer>
    </MemoryRouter>
  );
  return result;
}

const blocks = (container) => [...container.querySelectorAll('.pb-block')];
const labelsIn = (el) => [...el.querySelectorAll('.pb-label')].map(n => n.textContent);

afterEach(cleanup);

describe('buttons in a row', () => {
  it('numbers each button within its run of the same alignment', async () => {
    mount([['a', 'center'], ['b', 'center'], ['c', 'right'], ['', ''], ['d', 'right']]);
    const runs = editorRef.getEditorState().read(() =>
      $getRoot().getChildren().map(n => (n.getType() === 'button' ? $buttonRun(n) : null)));
    const keys = editorRef.getEditorState().read(() => $getRoot().getChildren().map(n => n.getKey()));
    expect(runs[0]).toEqual({ leader: keys[0], index: 0 });
    expect(runs[1]).toEqual({ leader: keys[0], index: 1 });
    expect(runs[2]).toEqual({ leader: keys[2], index: 0 });   // another alignment starts a new run
    expect(runs[4]).toEqual({ leader: keys[4], index: 0 });   // a paragraph in between ends it
  });

  it('draws a run inside its first button and leaves the others empty', async () => {
    const { container } = mount([['One', 'right'], ['Two', 'right'], ['Three', 'right'], ['Far', 'left']]);
    await act(async () => {});
    const [first, second, third, other] = blocks(container);
    expect(first.dataset.run).toBe('lead');
    expect(labelsIn(first)).toEqual(['One', 'Two', 'Three']);
    expect(second.dataset.run).toBe('join');
    expect(third.dataset.run).toBe('join');
    expect(labelsIn(second)).toEqual([]);
    expect(other.dataset.run).toBe('lead');
    expect(labelsIn(other)).toEqual(['Far']);
    // Each button keeps its place in the row whatever order the portals mounted in.
    expect([...first.querySelectorAll('.pb-wrap')].map(w => w.style.order)).toEqual(['0', '1', '2']);
  });

  it('regroups when a button is removed or changes alignment', async () => {
    const { container } = mount([['One', 'center'], ['Two', 'center'], ['Three', 'center']]);
    await act(async () => {});
    // Changing the middle button splits the run in three.
    await act(async () => {
      editorRef.update(() => { $getRoot().getChildAtIndex(1).setData({ align: 'left' }); });
    });
    let [a, b, c] = blocks(container);
    expect([a, b, c].map(x => x.dataset.run)).toEqual(['lead', 'lead', 'lead']);
    expect(labelsIn(b)).toEqual(['Two']);
    // Removing the first leaves the next as the row.
    await act(async () => {
      editorRef.update(() => { $getRoot().getChildAtIndex(1).setData({ align: 'center' }); });
    });
    await act(async () => {
      editorRef.update(() => { $getRoot().getFirstChild().remove(); });
    });
    [b, c] = blocks(container);
    expect(b.dataset.run).toBe('lead');
    expect(labelsIn(b)).toEqual(['Two', 'Three']);
    expect(c.dataset.run).toBe('join');
  });
});
