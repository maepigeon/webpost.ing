import {$getRoot, $getSelection, $isRangeSelection} from 'lexical';
import {useEffect, useState} from 'react';
import './Editor.css'
import {exampleTheme} from './exampleTheme';
import {AutoFocusPlugin} from '@lexical/react/LexicalAutoFocusPlugin';
import {LexicalComposer} from '@lexical/react/LexicalComposer';
import {useLexicalComposerContext} from '@lexical/react/LexicalComposerContext';
import {RichTextPlugin} from '@lexical/react/LexicalRichTextPlugin';
import {ContentEditable} from '@lexical/react/LexicalContentEditable';
import {HistoryPlugin} from '@lexical/react/LexicalHistoryPlugin';
import {LexicalErrorBoundary} from '@lexical/react/LexicalErrorBoundary';
import {$setBlocksType} from '@lexical/selection';
import {$createHeadingNode} from '@lexical/rich-text';
import { HeadingNode } from '@lexical/rich-text';
import {ListPlugin} from '@lexical/react/LexicalListPlugin';
import {INSERT_ORDERED_LIST_COMMAND, INSERT_UNORDERED_LIST_COMMAND, ListNode, ListItemNode} from '@lexical/list';

const initialConfig = {
  namespace: 'MyEditor', 
  theme: exampleTheme, 
  onError,
  nodes: [HeadingNode, ListNode, ListItemNode]
};

function ListToolbarPlugin() {
  const [editor] = useLexicalComposerContext();
  const listTags = ['ol', 'ul'];
  const onClick = (tag) => {
    if (tag === 'ol') {
      editor.dispatchCommand(INSERT_ORDERED_LIST_COMMAND, undefined);
      return;
    }
    editor.dispatchCommand(INSERT_UNORDERED_LIST_COMMAND, undefined);
  };
  return <>{listTags.map((tag) => (
    <button onClick={() =>{onClick(tag)}}>{tag.toUpperCase()}</button>
    ))}</>;
}

function HeadingToolbarPlugin() {
  const [editor] = useLexicalComposerContext();
  //tag: 'h1' | 'h2' | 'h3' 
  const onClick = (tag) => {
    editor.update(() => {
      const selection = $getSelection();
      if ($isRangeSelection(selection)) {
        $setBlocksType(selection, () => $createHeadingNode(tag));
      }
    });
  };
  return <div>{['h1', 'h2', 'h3'].map((tag) => (
    <button onClick = {() => {onClick(tag)}} key={tag}>{tag.toUpperCase()}</button>
  ))}</div>;
}

function ToolbarPlugin() {
  return <div className='toolbar-wrapper'>
    <HeadingToolbarPlugin/>
    <ListToolbarPlugin/>
  </div>
}

// When the editor changes, you can get notified via the
// OnChangePlugin!
function MyOnChangePlugin({ onChange }) {
    // Access the editor through the LexicalComposerContext
    const [editor] = useLexicalComposerContext();
    // Wrap our listener in useEffect to handle the teardown and avoid stale references.
    useEffect(() => {
      // most listeners return a teardown function that can be called to clean them up.
      return editor.registerUpdateListener(({editorState}) => {
        // call onChange here to pass the latest state up to the parent.
        onChange(editorState);
      });
    }, [editor, onChange]);
    return null;
}



// Catch any errors that occur during Lexical updates and log them
// or throw them as needed. If you don't throw them, Lexical will
// try to recover gracefully without losing user data.
function onError(error) {
  console.error(error);
}

export default function Editor() {
  const [editorState, setEditorState] = useState();
  function onChange(editorState) {
    // Call toJSON on the EditorState object, which produces a serialization safe string
    const editorStateJSON = editorState.toJSON();
    // However, we still have a JavaScript object, so we need to convert it to an actual string with JSON.stringify
    setEditorState(JSON.stringify(editorStateJSON));
  }
  return (
    <LexicalComposer initialConfig={initialConfig}>
      <ToolbarPlugin/>
      <ListPlugin/>
      <RichTextPlugin
        contentEditable={<ContentEditable className='editor-contenteditable'/>}
        placeholder={<div className='placeholder'>Enter some text...</div>}
        ErrorBoundary={LexicalErrorBoundary}
      />
      <HistoryPlugin />
      {/*<MyOnChangePlugin onChange={onChange}/>*/}
    </LexicalComposer>
  );
}