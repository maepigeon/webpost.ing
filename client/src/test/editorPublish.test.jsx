import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, waitFor, fireEvent, act } from '@testing-library/react';
import { useState, useEffect } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { LexicalComposer } from '@lexical/react/LexicalComposer';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { $getRoot, $createParagraphNode, $createTextNode } from 'lexical';
import { DialogProvider } from '../components/Dialog/Dialog.jsx';

vi.mock('../components/Pages/Posts/BasicTextPostServerApi.js', async (original) => {
  const real = await original();
  const quiet = Object.fromEntries(Object.keys(real).map(k => [k, vi.fn(() => Promise.resolve({}))]));
  return { ...quiet, CREATE_POST: vi.fn(() => Promise.resolve(42)), UPDATE_POST: vi.fn(() => Promise.resolve({})) };
});
vi.mock('axios', () => {
  const answer = () => Promise.resolve({ data: {} });
  const client = { get: vi.fn(answer), post: vi.fn(answer), put: vi.fn(answer), delete: vi.fn(answer), patch: vi.fn(answer) };
  return { default: { ...client, create: () => client, defaults: { headers: { common: {} } }, interceptors: { request: { use: vi.fn() }, response: { use: vi.fn() } } } };
});

import { SaveToolbarPlugin } from '../components/Pages/Posts/PostRenderer/RichTextPost/Editor.jsx';
import { CREATE_POST, UPDATE_POST } from '../components/Pages/Posts/BasicTextPostServerApi.js';

afterEach(() => { cleanup(); vi.clearAllMocks(); });

// Lexical commits an update a moment after it is made.
const settle = () => act(async () => { await new Promise(r => setTimeout(r, 20)); });

function Seed() {
  const [editor] = useLexicalComposerContext();
  useEffect(() => {
    editor.update(() => {
      const p = $createParagraphNode();
      p.append($createTextNode('Some words'));
      $getRoot().append(p);
    });
  }, [editor]);
  return null;
}

// The parent's half of the contract: it owns whether the post is published,
// exactly as the real editor does.
function Harness({ startPublished = false, postid }) {
  const [published, setPublished] = useState(startPublished);
  return (
    <MemoryRouter>
      <DialogProvider>
        <LexicalComposer initialConfig={{ namespace: 't', onError: e => { throw e; } }}>
          <Seed />
          <SaveToolbarPlugin postid={postid} backgroundPattern="" postPublished={published}
            onPublishedChange={setPublished} titleRef={{ current: 'Hello' }} onSaved={() => {}}
            username="mae" folder="" features={null} slug={null} summary="" section="profile"
            bus={{ current: new Set() }} localSavedAt={null} onAutoSaved={() => {}} onCreated={() => {}} />
        </LexicalComposer>
      </DialogProvider>
    </MemoryRouter>
  );
}

describe('first Publish of a new post', () => {
  it('leaves the editor in the state a published post opens in', async () => {
    render(<Harness />);
    await settle();
    fireEvent.click(screen.getByRole('button', { name: 'Publish' }));
    await waitFor(() => expect(CREATE_POST).toHaveBeenCalled());
    // Same buttons as when a published post is opened for editing.
    expect(await screen.findByRole('button', { name: 'Unpublish' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Save draft' })).toBeNull();
    expect(screen.getByText('Published.')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(/^Saved /);
  });

  it('a later save keeps it published instead of unpublishing it', async () => {
    render(<Harness />);
    await settle();
    fireEvent.click(screen.getByRole('button', { name: 'Publish' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(UPDATE_POST).toHaveBeenCalled());
    expect(UPDATE_POST.mock.calls[0][0]).toBe(42);
    expect(UPDATE_POST.mock.calls[0][3]).toBe(true);
  });

  it('a first Save draft stays a draft', async () => {
    render(<Harness />);
    await settle();
    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }));
    await waitFor(() => expect(CREATE_POST).toHaveBeenCalled());
    expect(await screen.findByText('Draft saved.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save draft' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Publish' })).toBeInTheDocument();
  });
});
