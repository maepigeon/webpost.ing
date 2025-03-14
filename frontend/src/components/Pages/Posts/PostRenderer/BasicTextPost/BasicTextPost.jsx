import {UPDATE_POST, DELETE_POST} from '../../BasicTextPostServerApi.js'
import {useState, useCallback, React} from 'react';
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
        UPDATE_POST(postdata.id, titleField, descriptionField, postdata.published).then(
        () => {props.updatePostsFlagCallback();}
        );
        setCurrentPostMode(Modes.VIEW);
    }

    const [titleField, setTitleField] = useState("The post's title")
    const onTitleFieldChanged = event => {
        setTitleField(event.target.value);
    }
    const [descriptionField, setDescriptionField] = useState("The post's description")
    const onDescriptionFieldChanged = event => {
        setDescriptionField(event.target.value);
    }

    const Editable = () => {
        const [content, setContent] = useState("")
    
        const onContentChange = useCallback(evt => {
            const sanitizeConf = {
                allowedTags: ["b", "i", "a", "p"],
                allowedAttributes: { a: ["href"] }
            };
    
            setContent(sanitizeHtml(evt.currentTarget.innerHTML, sanitizeConf))
        }, [])
    
        return (
            <ContentEditable
                onChange={onContentChange}
                onBlur={onContentChange}
                html={content} />
        )
    }

  
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
                    <input onChange={onTitleFieldChanged} value = {titleField}/>
                    <input onChange={onDescriptionFieldChanged} value = {descriptionField}/>
                    <h1 contentEditable="true" suppressContentEditableWarning={true}
                        onInput={e => console.log('Text inside div', e.currentTarget.textContent)}>
                        {postdata.title}
                    </h1>
                    <p contentEditable="true" suppressContentEditableWarning={true}
                        onInput={e => console.log('Text inside div', e.currentTarget.textContent)}>
                        {postdata.description}
                    </p>
                    <Editable> </Editable>
                </>);
        }
    }
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