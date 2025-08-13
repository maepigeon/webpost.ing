import {useEffect, useState} from 'react';
import './Editor.css'
import {exampleTheme} from './exampleTheme';
import {LexicalComposer} from '@lexical/react/LexicalComposer';
import {useLexicalComposerContext} from '@lexical/react/LexicalComposerContext';
import {RichTextPlugin} from '@lexical/react/LexicalRichTextPlugin';
import {ContentEditable} from '@lexical/react/LexicalContentEditable';
import {HistoryPlugin} from '@lexical/react/LexicalHistoryPlugin';
import {LexicalErrorBoundary} from '@lexical/react/LexicalErrorBoundary';
import { HeadingNode } from '@lexical/rich-text';
import {ListNode, ListItemNode} from '@lexical/list';
import TitleBar from './TitleBar';
import {useParams} from "react-router-dom";




const initialConfig = localStorage.getItem("currentPostState") == null ? {
  namespace: 'MyEditor', 
  editable: false,
  theme: exampleTheme, 
  onError,
  nodes: [HeadingNode, ListNode, ListItemNode],
} : {
  namespace: 'MyEditor', 
  editable: false,
  theme: exampleTheme, 
  onError,
  nodes: [HeadingNode, ListNode, ListItemNode],
  editorState: localStorage.getItem("currentPostState")
};


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

function LoadEditorStatePlugin() {
  let { id } = useParams();
  console.log("URL ID: " + id);
  const [editor] = useLexicalComposerContext();
  const onClick = () => {
    console.log("loading saved editor state");
    var loadedEditor = localStorage.getItem("currentPostState");
    console.log(loadedEditor)
    const editorState = editor.parseEditorState(loadedEditor);
    editor.setEditorState(editorState);
  }
  return <button onClick = {onClick} >Load Editor State</button>;
}
export default function RichTextViewer() {
  const [editorState, setEditorState] = useState();
  function onChange(editorState) {
    // Call toJSON on the EditorState object, which produces a serialization safe string
    const editorStateJSON = editorState.toJSON();
    // However, we still have a JavaScript object, so we need to convert it to an actual string with JSON.stringify
    setEditorState(JSON.stringify(editorStateJSON));
  }

  return (
    <>
        <div className='editor'>
          <TitleBar postdata={{id: 1, title: localStorage.getItem("currentPostTitle"), published: true}} 
              updatePostsFlagCallback={()=>{console.log("RETURNING TO POST VIEW")}} editMode={false} />
        </div>
        <LexicalComposer initialConfig={initialConfig}>
                <LoadEditorStatePlugin/>
                <div className='editor'>
                    <RichTextPlugin
                        contentEditable={<ContentEditable className='editor-contenteditable'/>}
                        placeholder={<div className='placeholder'>Enter some text...</div>}
                        ErrorBoundary={LexicalErrorBoundary}
                    />
                </div>

                <HistoryPlugin />
                {<MyOnChangePlugin onChange={onChange}/>}
        </LexicalComposer>
    </>);
}