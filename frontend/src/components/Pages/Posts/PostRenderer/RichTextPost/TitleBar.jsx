import {useState, useRef, React} from 'react';
import { Link } from 'react-router-dom';
import './Title.css'
import ContentEditable from 'react-contenteditable';


function TitleBar(props) {
    var postdata = props.postdata;
    var editMode = props.editMode;
    
    const Modes = Object.freeze({
        VIEW: 0,
        EDIT: 1,
        NEW: 2
    });

    const [currentPostMode, setCurrentPostMode] = useState(editMode ? Modes.EDIT : Modes.VIEW);

    // Update the title  data reference when the respective field is edited
    const titlehtml = useRef("Title");
    var handleEditTitle = event => {
        if (event.target.value) {
            titlehtml.current = event.target.value;
            localStorage.setItem("currentPostTitle", event.target.value);
    }};

    const Editable = ({editEventHandler, typeTag, initialContent}) => {
        const content = initialContent;
        return (
            <ContentEditable
                onChange={editEventHandler}
                onBlur={editEventHandler}
                html={content}
                tagName={typeTag}/>
        )
    }

    // Renders the heading and paragraph for the post
    function renderPostDataFields(postMode) {
        if (postMode == Modes.VIEW) {
            return( 
                <>
                    <h1>{postdata.title}</h1>
                </>);
        }
        else if (postMode == Modes.EDIT) {
            return(
                <>
                    <Editable editEventHandler={handleEditTitle} 
                        typeTag="h1" initialContent={postdata.title}> 
                    </Editable>
                </>);
        }
    }


    // Returns the Title component
    return (
        <div className="post basicTextPost">
            {/*<div className="datestring">
                <p>id: {postdata.id}, Date Uploaded: {postdata.date} (UTC)</p>
    </div>*/}
            <div className="horizontalContentBox">
                <div className="rightContent">
                    {renderPostDataFields(currentPostMode)}
                </div>
            </div>
            <div className="bottom-nav">
                <div className="editor">
                    <p>
                        Published: {JSON.stringify(postdata.published)}
                    </p>
                </div>
            </div>
        </div>
    );
}
export default TitleBar;