import {useState, React} from 'react';
import { Link } from 'react-router-dom';
import './Title.css'
import ContentEditable from 'react-contenteditable';


function TitleBar(props) {
    var postdata = props.postdata;
    var editMode = props.editMode;
    var handleEditTitleCallback = props.handleEditTitleCallback;
    
    const Modes = Object.freeze({
        VIEW: 0,
        EDIT: 1,
        NEW: 2
    });

    const [currentPostMode, setCurrentPostMode] = useState(editMode ? Modes.EDIT : Modes.VIEW);

    // Update the title  data reference when the respective field is edited
    var handleEditTitle = event => {
        if (event.target.value) {
            titlehtml.current = event.target.value;
            localStorage.setItem("currentPostTitle", event.target.value);
    }};

    const Editable = ({handleEditTitleCallback, typeTag, initialContent}) => {
        const content = initialContent;
        return (
            <ContentEditable
                onChange={handleEditTitleCallback}
                onBlur={handleEditTitleCallback}
                html={content}
                tagName={typeTag}/>
        )
    }

    // Renders the heading and paragraph for the post
    function renderPostDataFields(postMode, handleEditTitleCallback) {
        console.log("AUTHOR: " + postdata.author);
        if (postMode == Modes.VIEW) {
            return( 
                <>
                    <h1>{postdata.title}</h1>
                    <Link to={"/routes/PostsViewer/"+postdata.author+""}>
                        <h3> Author: {postdata.author}</h3>
                    </Link>
                </>);
        }
        else if (postMode == Modes.EDIT) {
            return(
                <>
                    <Editable handleEditTitleCallback={handleEditTitleCallback} 
                        typeTag="h1" initialContent={postdata.title}> 
                    </Editable>
                    <Link to={"/routes/PostsViewer/"+postdata.author+""}>
                        <h3> Author: {postdata.author}</h3>
                    </Link>
                </>);
        }
    }


    // Returns the Title component
    return (
        <div className="post basicTextPost">
            <div className="datestring">
                <p>id: {postdata.id}, Date Uploaded: {postdata.date} (UTC)</p>
             </div>
            <div className="horizontalContentBox">
                <div className="rightContent">
                    {renderPostDataFields(currentPostMode, handleEditTitleCallback)}
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
