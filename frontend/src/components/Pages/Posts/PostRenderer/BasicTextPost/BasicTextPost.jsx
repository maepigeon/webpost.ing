import {UPDATE_POST, DELETE_POST} from '../../BasicTextPostServerApi.js'
import {useState, useRef, React} from 'react';
import './BasicTextPost.css'
import sanitizeHtml from 'sanitize-html';
import ContentEditable from 'react-contenteditable';


function BasicTextPost(props) {
    var postdata = props.postdata;

    const Modes = Object.freeze({
        VIEW: 0,
        EDIT: 1,
    });

    const [currentPostMode, setCurrentPostMode] = useState(Modes.VIEW);

    const submitEditPost = () => {
        UPDATE_POST(postdata.id, titlehtml.current, descriptionhtml.current, postdata.published).then(
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
        console.log("Initial Content: " + initialContent);
        const content = initialContent;
    
       /*const onContentChange = useCallback(evt => {
            const sanitizeConf = {
                allowedTags: ["b", "i", "a", "p", "h1"],
                allowedAttributes: { a: ["href"] }
            };
            var sanitizedHTML = sanitizeHtml(evt.currentTarget.innerHTML, sanitizeConf);
            setContent(sanitizedHTML);
            setEditableField(sanitizedHTML);
        }, [])*/
    
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
                    <p>{postdata.description}</p>
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

    // Component for the edit / cancel edit button
    function editButtonRender(postMode) {
        if (postMode == Modes.VIEW) {
            return(<button onClick={() => setCurrentPostMode(Modes.EDIT) }>Edit</button>);
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
            <div className="horizontalContentBox">
                <div className="leftContent">
                    <p>id: {postdata.id}</p>
                </div>

                <div className="rightContent">
                    {renderPostDataFields(currentPostMode)}
                </div>
            </div>
            <div className="bottom-nav">
                <div className="editor">
                    <p>
                        Published: {JSON.stringify(postdata.published)}
                    </p>
                    <button onClick={() => {
                            DELETE_POST(postdata.id).then( 
                            () => {props.updatePostsFlagCallback();}
                            );
                        }}> 
                        Delete
                    </button>
                    { editButtonRender(currentPostMode) }
                </div>
            </div>
        </div>
    );
}

export default BasicTextPost;