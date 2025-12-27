import {$getRoot, $getSelection, $isRangeSelection} from 'lexical';
import {useEffect, useRef, useState} from 'react';
import './Editor.css'
import TitleBar from "./TitleBar"
 
import {exampleTheme} from './exampleTheme';
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
import {READ_POST, CREATE_POST, UPDATE_POST, GET_USER_FROM_POST} from '../../BasicTextPostServerApi.js';
import {useParams} from "react-router-dom";
import SubmitButton from './SubmitButton';


const initialConfig = localStorage.getItem("currentPostState") == null ? {
  namespace: 'MyEditor', 
  theme: exampleTheme, 
  onError,
  nodes: [HeadingNode, ListNode, ListItemNode],
} : {
  namespace: 'MyEditor', 
  theme: exampleTheme, 
  onError,
  nodes: [HeadingNode, ListNode, ListItemNode],
  editorState: localStorage.getItem("currentPostState")
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
    <button key={tag} onClick={() =>{onClick(tag)}}>{tag.toUpperCase()}</button>
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
// or throw them as needed. If you don't throw them, Lexical \ll
// try to recover gracefully without losing user data.
function onError(error) {
  console.error(error);
}
var hasLoadedEditor = false;
function LoadEditorStatePlugin() {
  const [editor] = useLexicalComposerContext();
  const onClick = () => {
    console.log("loading saved editor state");
    var loadedEditor = localStorage.getItem("currentPostData");
    if (loadedEditor != null) {
	console.log(loadedEditor)
    	const editorState = editor.parseEditorState(loadedEditor);
    	console.log("debugging, editorStateJSON: " + JSON.stringify(editorStateJSON));
    	editor.setEditorState(editorState);
    }
  }
  if (!hasLoadedEditor) {
    onClick();
    hasLoadedEditor = true;
  }
  return <button onClick = {onClick} >Load Editor State</button>;
}
/*
function SaveEditorStatePlugin() {
  const [editor] = useLexicalComposerContext();
  const onClick = () => {
    console.log("saving editor state");
    const editorStateRaw = editor.getEditorState();
    const editorState = JSON.stringify(editorStateRaw.toJSON());
    console.log(editorState);
    localStorage.setItem("currentPostState", editorState);
  }
  onClick();
  return <button onClick = {onClick} >Save Editor State</button>;
}*/

var loadedPost = false;

export default function RichTextEditor() {
  const [editorState, setEditorState] = useState();
  let { id } = useParams();
  const [postDate, setPostDate] = useState("");
  const [postPublished, setPostPublished] = useState(false);
  const titlehtml = useRef("Title");
  const [postAuthor, setPostAuthor] = useState("");
  
  

  //Called on page load - get the post data from the server
  useEffect(() => {
    let ignore = false;
    
    if (!ignore)  refreshPost()
    return () => { ignore = true; }
    },[]);
    

  function onChange(editorState) {
    if (editorState == null) {
	console.log("WARNING: EDITORSTATE IS NULL");
    } else {
	console.log("editorState not null: " + editorState);
    }

    try {
	    // Call toJSON on the EditorState object, which produces a serialization safe string
	    const editorStateString = JSON.stringify(editorState);
	    // However, we still have a JavaScript object, so we need to convert it to an actual string with JSON.stringify
	    console.log("debugging, editorStateString: " + editorStateString);	
	    setEditorState(JSON.parse(editorStateString));
    } catch ( e) {
	console.log("failed to load the editor in the richTextEditor module" + e);
    }
  }

  const refreshPost = () => {
    console.log("REFRESHING POST");
    READ_POST(id).then(
      (data) => {
        console.log("Post data: " + JSON.stringify(data));
        titlehtml.current = data.title;
        localStorage.setItem("currentPostTitle", data.title);
        setPostDate(data.date);
        setPostPublished(data.published);
        GET_USER_FROM_POST(id).then(
          (user_data) => {
            setPostAuthor(user_data);
          });
        localStorage.setItem("currentPostData", data.description);
        loadedPost = true;
        hasLoadedEditor = false;
        LoadEditorStatePlugin();
      }
      );
  }

  return (
      <>
        <div className='editor'>
          <TitleBar postdata={{id: id, title: titlehtml.current, published: postPublished, date: postDate, author: postAuthor}} 
              handleEditTitleCallback={(event)=>{
                if (event.target.value) {

                  titlehtml.current = event.target.value;
                  localStorage.setItem("currentPostTitle", titlehtml.current);
                  console.log("UPDATED POST TITLE: " + localStorage.getItem("currentPostTitle"));

                }}} editMode={true} />
        </div>
        <LexicalComposer initialConfig={initialConfig}>
              <button onClick = {refreshPost} >Refresh</button>
              <LoadEditorStatePlugin/>
              {/*<SaveEditorStatePlugin/>*/}
              <div className='editor'>
                <ToolbarPlugin/>
              </div>
              <ListPlugin/>
              <div className='editor'>
                <RichTextPlugin
                  contentEditable={<ContentEditable className='editor-contenteditable'/>}
                  placeholder={<div className='placeholder'>Enter some text...</div>}
                  ErrorBoundary={LexicalErrorBoundary}
                />
              </div>

              <HistoryPlugin />
              {<MyOnChangePlugin onChange={onChange}/>}
              <SubmitButton  postid={id}/>
  
        </LexicalComposer>
      </>
   );
}
