import {DELETE_POST} from '../../BasicTextPostServerApi.js'
import {useMemo} from 'react';
import { Link, useNavigate } from 'react-router-dom';
import './BasicTextPost.css'
import { useDialog } from '../../../../Dialog/Dialog.jsx';
import { postPath } from '../../../../../utils/postUrl.js';
import { cardGridOf } from '../../../../../utils/gridPost.js';
import TileGrid from '../RichTextPost/TileGrid/TileGrid.jsx';
import { postDateline } from '../../../../../utils/postDate.js';


function BasicTextPost(props) {
    const { confirm } = useDialog();
    var postdata = props.postdata;
    var hasModifyPermissions = props.hasModifyPermissions;
    var ownerUsername = props.ownerUsername || '';

    const navigate = useNavigate();
    // The card previews the post's first grid, unless its author turned that off.
    const grid = useMemo(() => cardGridOf(postdata),
        [postdata.cardGrid, postdata.preview, postdata.description]);
    // Taller than half its width, the grid is cut off: the card is a preview.
    const gridCropped = grid && grid.rows / grid.cols > 0.5;

    const viewPath = ownerUsername
        ? postPath(ownerUsername, postdata)
        : `/editor/${postdata.id}`;

    function deleteButtonRender() {
        if (!hasModifyPermissions) {
            return <></>
        }
        else {
            return(
                <button type="button" className="post-delete-btn" onClick={async () => {
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

    function editButtonRender() {
        if (!hasModifyPermissions) {
            return <></>
        }
        return(
            // A button that navigates, not a button inside a link (invalid
            // HTML, and two tab stops for one control).
            <button type="button" onClick={() => navigate(`/editor/${postdata.id}`, { state: { postID: postdata.id } })}>Edit</button>
        );
    }

    const dateline = postDateline(postdata.date);

    return (
        <div className="post basicTextPost" data-post-id={postdata.id}>
            <Link to={viewPath} className="post-card-overlay" aria-label={postdata.title} tabIndex={-1} />
            <div className="datestring">
                {dateline.text && <p><time dateTime={dateline.iso} title={dateline.full}>{dateline.text}</time></p>}
            </div>
            <div className="horizontalContentBox">
                <div className="rightContent">
                    {!postdata.published && (
                        <span className="draft-badge">DRAFT</span>
                    )}
                    <Link to={viewPath} className="post-title-link">
                        <h1>{postdata.title}</h1>
                    </Link>
                    {postdata.summary && (
                        <p className="post-card-summary">{postdata.summary}</p>
                    )}
                    {grid && (
                        <div className="post-card-grid">
                            <div className={`post-card-grid-window${gridCropped ? ' is-cropped' : ''}`}>
                                <TileGrid data={grid} editable={false} onChange={() => {}} linksActive={false} />
                            </div>
                        </div>
                    )}
                </div>
            </div>
            {hasModifyPermissions && (
                <div className="bottom-nav">
                    <div className="editor">
                        {editButtonRender()}
                        {deleteButtonRender()}
                    </div>
                </div>
            )}
        </div>
    );
}

export default BasicTextPost;
