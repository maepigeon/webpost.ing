import {UPDATE_POST, DELETE_POST, CREATE_POST} from '../../BasicTextPostServerApi.js'
import {useState, useRef, React} from 'react';
import { Link } from 'react-router-dom';
import './BasicTextPost.css'
import ContentEditable from 'react-contenteditable';
import { useDialog } from '../../../../Dialog/Dialog.jsx';


function BasicTextPost(props) {
    const { confirm } = useDialog();
    var postdata = props.postdata;
    var editMode = props.editMode;
    var hasModifyPermissions = props.hasModifyPermissions;
    var ownerUsername = props.ownerUsername || '';

    const Modes = Object.freeze({
        VIEW: 0,
        EDIT: 1,
        NEW: 2
    });

    const [currentPostMode, setCurrentPostMode] = useState(editMode ? Modes.EDIT : Modes.VIEW);

    const viewPath = ownerUsername
        ? `/users/${ownerUsername}/${postdata.id}`
        : `/editor/${postdata.id}`;

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

    function renderPostDataFields(postMode) {
        if (postMode == Modes.VIEW) {
            return(
                <Link to={viewPath} className="post-title-link">
                    <h1>{postdata.title}</h1>
                </Link>
            );
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

    function deleteButtonRender() {
        if (!hasModifyPermissions) {
            return <></>
        }
        else {
            return(
                <button onClick={async () => {
                        if (!(await confirm('Are you sure you want to delete this post? This cannot be undone.'))) return;
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

    function editButtonRender(postMode) {
        if (!hasModifyPermissions) {
            return <></>
        }
        if (postMode == Modes.VIEW) {
            return(
                <Link to={`/editor/${postdata.id}`} state={{postID: postdata.id}}>
                    <button> Edit </button>
                </Link>
            );
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

    return (
        <div className="post basicTextPost">
            {currentPostMode === Modes.VIEW && (
                <Link to={viewPath} className="post-card-overlay" aria-label={postdata.title} tabIndex={-1} />
            )}
            <div className="datestring">
                <p>id: {postdata.id}, Date Uploaded: {postdata.date} (UTC)</p>
            </div>
            <div className="horizontalContentBox">
                <div className="rightContent">
                    {!postdata.published && (
                        <span className="draft-badge">DRAFT</span>
                    )}
                    {renderPostDataFields(currentPostMode)}
                </div>
            </div>
            {hasModifyPermissions && (
                <div className="bottom-nav">
                    <div className="editor">
                        {deleteButtonRender()}
                        {editButtonRender(currentPostMode)}
                    </div>
                </div>
            )}
        </div>
    );
}

export default BasicTextPost;
