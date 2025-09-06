import {UPDATE_POST, DELETE_POST, CREATE_POST} from '../../BasicTextPostServerApi.js'
import {useState, useRef, React} from 'react';
import { Link } from 'react-router-dom';
import './BasicTextPost.css'
import ContentEditable from 'react-contenteditable';


function BasicTextPost(props) {
    var postdata = props.postdata;
    var editMode = props.editMode;
    var hasModifyPermissions = props.hasModifyPermissions;
    
    const Modes = Object.freeze({
        VIEW: 0,
        EDIT: 1,
        NEW: 2
    });

    const [currentPostMode, setCurrentPostMode] = useState(editMode ? Modes.EDIT : Modes.VIEW);

    const goToPost = () => {
        console.log("Going to post # " + postdata.id)
    }

    const submitEditPost = () => {
        UPDATE_POST(postdata.id, titlehtml.current, descriptionhtml.current, postdata.published).then(
        () => {props.updatePostsFlagCallback();}
        );
        setCurrentPostMode(Modes.VIEW);
    }
    const submitNewPost = () => {
        CREATE_POST(postdata.id, titlehtml.current, descriptionhtml.current, postdata.published).then(
        () => {props.updatePostsFlagCallback();}
        );
        setCurrentPostMode(Modes.VIEW);
    }

    // Update the title or description data reference when the respective field is edited
    const titlehtml = useRef("Title");
    var handleEditTitle = event => {
        if (event.target.value) {
            titlehtml.current = event.target.value;
    }};
    const descriptionhtml = useRef("Description");
    var handleEditDescription = event => {
        if (event.target.value) {
            descriptionhtml.current = event.target.value;
    } };


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
                    {/*<p>{postdata.description}</p>*/}
                </>);
        }
        else if (postMode == Modes.EDIT) {
            return(
                <>
                    <Editable editEventHandler={handleEditTitle} 
                        typeTag="h1" initialContent={postdata.title}> 
                    </Editable>
                    <Editable editEventHandler={handleEditDescription} 
                        typeTag="p" initialContent={postdata.description}>
                     </Editable>
                </>);
        }
    }
    function goButtonRender() {
        if (postdata.id == 0) {
        return(
            <Link to={"/routes/RichTextViewer"} state={{postID: postdata.id}}>
                <button onClick={() => goToPost()}> Go </button>
            </Link>
            );
        } else {
            return(
                <Link to={"/routes/RichTextViewer/"+[postdata.id+""]} state={{postID: postdata.id}}>
                    <button onClick={() => goToPost()}> Go </button>
                </Link>
                );
        }
    }

     // Component for the delete button
     function deleteButtonRender() {
        if (!hasModifyPermissions) {
            return <></>
        }
        else {
            return(
                <button onClick={() => {
                        DELETE_POST(postdata.id).then( 
                        () => {
                            props.updatePostsFlagCallback();
                            window.location.reload();
                        }
                        );
                    }}> 
                    Delete
                </button>
                );
            }
        }


    // Component for the edit / cancel edit button
    function editButtonRender(postMode) {
        if (!hasModifyPermissions) {
            return <></>
        }
        if (postMode == Modes.VIEW) {
            if (postdata.id == 0) {
                return(
                    <Link to={"/routes/RichTextEditor"} state={{postID: postdata.id}}>
                        <button onClick={() => setCurrentPostMode(Modes.EDIT)}> Edit </button>
                    </Link>
                    );
            } else {
            return(
                <Link to={"/routes/RichTextEditor/"+postdata.id+""} state={{postID: postdata.id}}>
                    <button onClick={() => setCurrentPostMode(Modes.EDIT)}> Edit </button>
                </Link>
                );
            }
        }
        else if (postMode == Modes.EDIT) {
            return(
                <>
                    <button onClick={() => setCurrentPostMode(Modes.VIEW) }>Cancel Edit</button>
                    <button onClick={() => submitEditPost() }>Submit</button>
                </>
                );
        }
    }

    // Returns the BasicTextPost component
    return (
        <div className="post basicTextPost">
            <div className="datestring">
                <p>id: {postdata.id}, Date Uploaded: {postdata.date} (UTC)</p>
            </div>
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
                    {deleteButtonRender()}
                    { editButtonRender(currentPostMode) }
                    { goButtonRender(postdata.id) }
                </div>
            </div>
        </div>
    );
}

export default BasicTextPost;