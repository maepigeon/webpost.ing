import {READ_POST, CREATE_POST, UPDATE_POST, GET_USER_FROM_POST} from '../../BasicTextPostServerApi.js';
import {$getRoot, $getSelection, $isRangeSelection} from 'lexical';
import {useEffect, useRef, useState} from 'react';
import './Editor.css'
import {LexicalComposer} from '@lexical/react/LexicalComposer';
import {useLexicalComposerContext} from '@lexical/react/LexicalComposerContext';

export default function SubmitButton(props) {
    const [editor] = useLexicalComposerContext();
    var postid = props.postid;
    const onClick = () => {
      const editorStateRaw = editor.getEditorState();
      const editorState = JSON.stringify(editorStateRaw.toJSON());
      const postTitle = localStorage.getItem("currentPostTitle");

      if (postid > 0) {
        UPDATE_POST(postid, postTitle, editorState, true);
      } else {
        CREATE_POST(1, postTitle, editorState, true);
      }
    }

    return <button type="submit" className='submitButton' onClick={ onClick }>Upload</button>
}
