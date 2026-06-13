import {useState, React} from 'react';
import { Link } from 'react-router-dom';
import './Title.css'

function stripHtml(str) {
    return (str || '').replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ').replace(/&quot;/g, '"');
}

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

    // Renders the heading and paragraph for the post
    function renderPostDataFields(postMode, handleEditTitleCallback) {
        if (postMode == Modes.VIEW) {
            return(
                <>
                    <h1>{stripHtml(postdata.title)}</h1>
                    <Link to={"/users/"+postdata.author}>
                        <h3> Author: {postdata.author}</h3>
                    </Link>
                </>);
        }
        else if (postMode == Modes.EDIT) {
            return(
                <>
                    <input
                        className="title-input"
                        type="text"
                        defaultValue={stripHtml(postdata.title)}
                        placeholder="Type a title…"
                        maxLength={200}
                        spellCheck={false}
                        autoCorrect="off"
                        onKeyDown={e => { if (e.key === 'Enter') e.preventDefault(); }}
                        onChange={handleEditTitleCallback}
                    />
                    <Link to={"/users/"+postdata.author}>
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
