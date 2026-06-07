import { useState, useEffect, React} from 'react';
import {AUTHORIZE_SESSION, READ_POSTS_BY_USER, GET_USER_BACKGROUND, UPDATE_USER_BACKGROUND, GET_USER_BIO, UPDATE_USER_BIO, GET_USER_STORAGE} from '../BasicTextPostServerApi.js'
import BasicTextPost from '../PostRenderer/BasicTextPost/BasicTextPost.jsx';
import PatternPicker from '../../../PatternPicker/PatternPicker.jsx';
import FollowButton from '../../../Social/FollowButton.jsx';
import { patternToStyle } from '../../../PatternPicker/patterns.js';
import '../PostWindow.css';
import {useParams, Link} from "react-router-dom";

function Heading(props) {
 if (props.username != null && props.username != "") {
  return (<h1 className="windowHeader">
    {props.username}'s posts
  </h1>);
 } else {
  return( <h1 className="windowHeader">
    Invalid username in URL: "{props.username}"
  </h1>);
 }
}

function fmtBytes(n) {
  if (!n || n === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let i = 0, v = n;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(1)} ${units[i]}`;
}

function StorageBar({ storage }) {
  const uploadLimit = Number(storage.maxStorageBytes ?? -1);
  const uploadUsed = Number(storage.uploadBytes ?? 0);
  const pct = uploadLimit > 0 ? Math.min(100, (uploadUsed / uploadLimit) * 100) : null;
  return (
    <div style={{ marginTop: '12px', fontSize: '12px', color: '#555', textAlign: 'left' }}>
      <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', justifyContent: 'center', marginBottom: pct !== null ? '6px' : 0 }}>
        <span>Uploads: <strong>{fmtBytes(uploadUsed)}</strong>{uploadLimit > 0 ? ` / ${fmtBytes(uploadLimit)}` : ''}</span>
        <span>Post text: <strong>{fmtBytes(Number(storage.postTextBytes ?? 0))}</strong></span>
        <span>Posts: <strong>{storage.postCount ?? 0}</strong></span>
      </div>
      {pct !== null && (
        <div style={{ height: '4px', borderRadius: '2px', background: '#e0e0e0', overflow: 'hidden', maxWidth: '320px', margin: '0 auto' }}>
          <div style={{ height: '100%', width: `${pct}%`, background: pct > 85 ? '#d32f2f' : '#1a73e8', borderRadius: '2px', transition: 'width 0.3s' }} />
        </div>
      )}
    </div>
  );
}

function hasModifyPermissions(viewedUser) {
  const username = localStorage.getItem("userName");
  if (username != viewedUser) {return false;}
  return (username != null && username != "" && AUTHORIZE_SESSION());
}


// Loads a view of title cards for all posts by the user specified in the url
function PostsViewer() {
    const [postsArray, setPostsArray] = useState([]);
    const [bgPattern, setBgPattern] = useState('');
    const [showBgPicker, setShowBgPicker] = useState(false);
    const [bio, setBio] = useState('');
    const [editingBio, setEditingBio] = useState(false);
    const [bioInput, setBioInput] = useState('');
    const [bioError, setBioError] = useState('');
    const [storage, setStorage] = useState(null);
    const { username } = useParams();
    const canEdit = hasModifyPermissions(username);

    useEffect(() => {
      refreshPosts();
      GET_USER_BACKGROUND(username).then(p => setBgPattern(p || '')).catch(() => {});
      GET_USER_BIO(username).then(b => setBio(b || '')).catch(() => {});
      if (canEdit) {
        GET_USER_STORAGE(username).then(setStorage).catch(() => {});
      }
    },[username]);

    // Apply profile page background to body
    useEffect(() => {
      const style = patternToStyle(bgPattern);
      document.body.style.backgroundImage = style.backgroundImage || '';
      document.body.style.backgroundSize = style.backgroundSize || 'auto';
      document.body.style.backgroundPosition = style.backgroundPosition || 'initial';
      return () => {
        document.body.style.backgroundImage = '';
        document.body.style.backgroundSize = '';
        document.body.style.backgroundPosition = '';
      };
    }, [bgPattern]);

    function refreshPosts() {
      READ_POSTS_BY_USER(username).then(data => {
        setPostsArray(data.sort((a,b) => new Date(b.date) - new Date(a.date)));
      }).catch(err => console.log(err));
    }

    function handleBgChange(pattern) {
      setBgPattern(pattern);
      UPDATE_USER_BACKGROUND(username, pattern).catch(err => console.error('Failed to save background:', err));
    }

    function saveBio() {
      const trimmed = bioInput.trim();
      setBioError('');
      UPDATE_USER_BIO(username, trimmed)
        .then(() => { setBio(trimmed); setEditingBio(false); })
        .catch(err => setBioError(err?.response?.data || 'Failed to save bio. Try again.'));
    }

    // Only the owner sees drafts; visitors only see published posts
    const visiblePosts = canEdit ? postsArray : postsArray.filter(p => p.published);

    return (
      <div className="window" style={{ minHeight: '100vh' }}>
        <div className="postsViewerContainer">
          <div className="profile-header-card">
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap', justifyContent: 'center' }}>
              <Heading username={username}/>
              <FollowButton username={username} />
            </div>

            {/* Bio display / edit */}
            {editingBio ? (
              <div style={{ marginTop: '10px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' }}>
                <textarea
                  value={bioInput}
                  onChange={e => setBioInput(e.target.value)}
                  maxLength={500}
                  rows={3}
                  style={{ width: '100%', maxWidth: '480px', padding: '8px', borderRadius: '6px', border: '1px solid #ccc', fontFamily: 'inherit', fontSize: '14px', resize: 'vertical', boxSizing: 'border-box' }}
                  placeholder="Write a short bio..."
                />
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button type="button" onClick={saveBio} style={{ padding: '4px 14px', borderRadius: '6px', background: '#1a73e8', color: '#fff', border: 'none', cursor: 'pointer', fontSize: '13px' }}>Save</button>
                  <button type="button" onClick={() => { setEditingBio(false); setBioError(''); }} style={{ padding: '4px 14px', borderRadius: '6px', border: '1px solid #ccc', background: '#fff', cursor: 'pointer', fontSize: '13px' }}>Cancel</button>
                </div>
                {bioError && <p style={{ margin: '4px 0 0', color: '#d32f2f', fontSize: '12px' }}>{bioError}</p>}
              </div>
            ) : (
              <div style={{ marginTop: '8px' }}>
                {bio && <p style={{ margin: '0 0 6px', fontSize: '14px', color: '#444', whiteSpace: 'pre-wrap' }}>{bio}</p>}
                {canEdit && (
                  <button type="button" onClick={() => { setBioInput(bio); setEditingBio(true); }} style={{ background: 'none', border: 'none', color: '#888', cursor: 'pointer', fontSize: '12px', textDecoration: 'underline' }}>
                    {bio ? 'Edit bio' : '+ Add bio'}
                  </button>
                )}
              </div>
            )}

            {canEdit && (
              <div style={{ marginTop: '8px' }}>
                <button type="button" onClick={() => setShowBgPicker(o => !o)}>
                  {showBgPicker ? 'Hide' : 'Page Background'}
                </button>
                {showBgPicker && (
                  <div style={{ background: '#fff', border: '1px solid #ccc', borderRadius: '8px', padding: '12px', marginTop: '6px' }}>
                    <PatternPicker value={bgPattern} onChange={handleBgChange} />
                  </div>
                )}
              </div>
            )}

            {canEdit && storage && <StorageBar storage={storage} />}
          </div>
          {
           (!Array.isArray(visiblePosts) || !visiblePosts.length)
            ? <p>There are no posts, yet. Create one to get started.</p>
            : visiblePosts.map((record, index) => (
                <div className="PostContainer" key={index}>
                    <BasicTextPost postdata={record} updatePostsFlagCallback={()=>{refreshPosts()}}
                     uploaded={true} hasModifyPermissions={canEdit} ownerUsername={username}/>
                </div>
              ))
          }
        </div>
      </div>
    );
}

export default PostsViewer;