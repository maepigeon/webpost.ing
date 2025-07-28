import React, { useState } from 'react';
import Editor from '../../Posts/PostRenderer/RichTextPost/Editor.jsx'
import '../Profile.css'

function ProfileEditor() {
    return (
        <div className='editor'>
            <h1>
                Edit a profile Here
            </h1>
            <Editor/>
        </div>
    );
}

export default ProfileEditor;