import {READ_POST, CREATE_POST, UPDATE_POST, GET_USER_FROM_POST} from '../../BasicTextPostServerApi.js';
import {$getRoot, $getSelection, $isRangeSelection} from 'lexical';
import {useEffect, useRef, useState} from 'react';
import './Editor.css'
import {LexicalComposer} from '@lexical/react/LexicalComposer';
import {useLexicalComposerContext} from '@lexical/react/LexicalComposerContext';

export default function SubmitButton(props) {
    const [editor] = useLexicalComposerContext();
    var postid = props.postid;
    console.log("POST ID");
    console.log("postid: " + postid);
    const onClick = () => {
      const editorStateRaw = editor.getEditorState();
      const editorState = JSON.stringify(editorStateRaw.toJSON());
      const postTitle = localStorage.getItem("currentPostTitle");
      console.log("Uploading/Editing post: " + postTitle);
  
      const username = localStorage.getItem("userName");
      if (postid > 0) {
        console.log("editing post: " + postid);
        UPDATE_POST(postid, postTitle, editorState, true).then(
          () => {console.log("Post edited.")}
          );
      } else {
        CREATE_POST(1, postTitle, editorState, true).then(
          () => {console.log("Post uploaded.")}
          );
        }
      }
      
    return <button type="submit" className='submitButton' onClick={ onClick }>Upload</button>
  
}
