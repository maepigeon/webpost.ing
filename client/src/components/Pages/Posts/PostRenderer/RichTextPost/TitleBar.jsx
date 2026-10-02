
import { Link } from 'react-router-dom';
import './Title.css'
import { postDateline } from '../../../../../utils/postDate.js';

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

    const currentPostMode = editMode ? Modes.EDIT : Modes.VIEW;

    // Renders the heading and paragraph for the post
    function renderPostDataFields(postMode, handleEditTitleCallback) {
        if (postMode == Modes.VIEW) {
            return(
                <>
                    <h1>{stripHtml(postdata.title)}</h1>
                    <Link to={"/"+postdata.author}>
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
                    <Link to={"/"+postdata.author}>
                        <h3> Author: {postdata.author}</h3>
                    </Link>
                </>);
        }
    }


    const dateline = postDateline(postdata.date);

    // In the editor the title and author are in the app's own font, like the
    // controls around them; on the post's page they take its theme's fonts.
    return (
        <div className={`post basicTextPost${editMode ? ' title-bar--editing' : ' th-scope'}`}>
            <div className="datestring">
                {dateline.text && <p><time dateTime={dateline.iso} title={dateline.full}>{dateline.text}</time></p>}
             </div>
            <div className="horizontalContentBox">
                <div className="rightContent">
                    {renderPostDataFields(currentPostMode, handleEditTitleCallback)}
                </div>
            </div>
            <div className="bottom-nav">
                <div className="editor">
                    {postdata.id && !postdata.published && <p>Draft — only you can see it.</p>}
                </div>
            </div>
        </div>
    );
}
export default TitleBar;
