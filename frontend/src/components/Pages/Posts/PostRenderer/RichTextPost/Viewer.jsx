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
import {READ_POST, CREATE_POST, GET_USER_FROM_POST} from '../../BasicTextPostServerApi.js';





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
  const [editor] = useLexicalComposerContext();
  const onClick = () => {
    console.log("loading saved editor state");
    var loadedEditor = localStorage.getItem("currentPostData");
    console.log(loadedEditor)
    const editorState = editor.parseEditorState(loadedEditor);
    editor.setEditorState(editorState);
  }
  onClick();
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

  let { id } = useParams();
  const [postTitle, setPostTitle] = useState("DEFAULT POST TITLE");
  const [postDate, setPostDate] = useState("");
  const [postPublished, setPostPublished] = useState(false);
  const [postAuthor, setPostAuthor] = useState("");
  //const [editor] = useLexicalComposerContext();

  console.log("URL ID: " + id);
  const refreshPost = () => {
    console.log("loading saved editor state");
    READ_POST(id).then(
      (data) => {
        console.log("Post data: " + JSON.stringify(data));
        console.log("TITLE: " + data.title);
        setPostTitle(data.title);
        console.log("DATE: " + data.date);
        setPostDate(data.date);
        setPostPublished(data.published);
        GET_USER_FROM_POST(id).then(
          (user_data) => {
            console.log("USER: " + user_data);
            setPostAuthor(user_data);
          });
         localStorage.setItem("currentPostData", data.description);

         
        //  const loadedEditor = data.description;
        //  const editorState = editor.parseEditorState(loadedEditor);
        //  editor.setEditorState(editorState);
      }
      );
  }

  refreshPost();
  return (
    <>
        <div className='editor'>
          <TitleBar postdata={{id: id, title: postTitle, published: postPublished, date: postDate, author: postAuthor}} 
              updatePostsFlagCallback={()=>{console.log("RETURNING TO POST VIEW")}} editMode={false} />
        </div>
        <LexicalComposer initialConfig={initialConfig}>
              <button onClick = {refreshPost} >Refresh</button>
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