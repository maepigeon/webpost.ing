import { useState, useEffect, React} from 'react';
import {AUTHORIZE_SESSION, READ_POSTS, READ_POSTS_BY_USER} from '../BasicTextPostServerApi.js'
import BasicTextPost from '../PostRenderer/BasicTextPost/BasicTextPost.jsx';
import '../PostWindow.css';
import {useParams, Link} from "react-router-dom";


// Loads a view of title cards for all posts by the user specified in the url
function PostsViewer() {
    const [postsArray, setPostsArray] = useState([]);  
    const { username } = useParams();


    useEffect(() => {
      refreshPosts();
    },[username]);
    function refreshPosts() {
      //Loads the list of all posts created by the specified user
      READ_POSTS_BY_USER(username).then(data => {
        setPostsArray(data.sort(
          function(a,b) {
            return new Date(b.date) - new Date(a.date);
          }
        ));
      }).catch(err => console.log(response));
    }

    return (
      <div className="window">    
        <div className="postsViewerContainer">
          <h1 className="windowHeader">
              Your posts
          </h1>
          <Link to={"/routes/RichTextEditor"} state={{postID: 1}}>
            <button> Create New Post </button>
          </Link>
          {
           (!Array.isArray(postsArray) || !postsArray.length) 
            ? (console.log(postsArray) && <p> There are no posts, yet. Create one to get started.</p>)
            : postsArray.map((record, index) => (
                <div className="PostContainer" key={index}>
                    <BasicTextPost postdata={record} updatePostsFlagCallback={()=>{refreshPosts()}} uploaded={true} />
                </div>
              ))

          } 
        </div> 
      </div>
    );
}

export default PostsViewer;