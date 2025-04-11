import { useState, useEffect, React} from 'react';
import {READ_POST} from '../BasicTextPostServerApi.js'
import BasicTextPost from '../PostRenderer/BasicTextPost/BasicTextPost.jsx';
import '../PostWindow.css';
import { useLocation, Link } from 'react-router-dom';


function PostEditor() {
    const location = useLocation();
    const state = location.state; 

    const [post, setPost] = useState({});
    const [selectedPostID, setSelectedPostID] = useState({});
    if (location.state && post.id != state.postID) {
        selectPost(state.postID);
    }



    function selectPost(id) {
        console.log("Selecting post with id: " + id);
        READ_POST(id).then(data => {
            setPost(data);
          }).catch(err => console.log(response));
      }
    

    return (
      <div className="window">    
        <div className="postsViewerContainer">
          <h1 className="windowHeader">
              Edit Post
          </h1>
            <label for="postNumber">Post number (1-100):</label>
            <input type="number" id="postNumber" 
                onChange = {(e) => setSelectedPostID(e.target.value)} name="postNumber"
                 min="1" max="999" />
            <Link to={"/routes/PostEditor"} state={{postID: selectedPostID}}>
                <button onClick={() => {selectPost(selectedPostID);}}>
                        SUBMIT
                </button>
            </Link>
          {
            (!post) ? (console.log(post) &&
            <p> The selected post is invalid. Please select another post and contact the administrator.</p>)
            :  <div className="PostContainer">
                    <BasicTextPost postdata={post} updatePostsFlagCallback={()=>{console.log("RETURNING TO POST VIEW")}} editMode={true} />
                </div>
          } 
        </div> 
      </div>
    );
}

export default PostEditor;