import { useState, useEffect, React} from 'react';
import {CREATE_POST, READ_POSTS} from '../BasicTextPostServerApi.js'
import BasicTextPost from '../PostRenderer/BasicTextPost/BasicTextPost.jsx';
import '../PostWindow.css';


function PostsViewer() {
    const [postsArray, setPostsArray] = useState([]);    

    useEffect(() => {
      refreshPosts();
    },[]);
    function refreshPosts() {
        console.log("refreshing state.")
        READ_POSTS().then(data => {
          setPostsArray(data);
        }).catch(err => console.log(response));
    }

    return (
      <div className="window">    
        <div className="postsViewerContainer">
          <h1 className="windowHeader">
              Your posts
          </h1>
          <button className="newPostButton" onClick={() => {
              CREATE_POST().then(() => {
                refreshPosts()})
              }}> Create New Post </button>
          {
           (!Array.isArray(postsArray) || !postsArray.length) 
            ? (console.log(postsArray) && <p> There are no posts, yet. Create one to get started.</p>)
            : postsArray.map((record, index) => (
                  <div className="PostContainer" key={index}>
                      <BasicTextPost postdata={record} updatePostsFlagCallback={()=>{refreshPosts()}} />
                  </div>
              ))

          } 
        </div> 
      </div>
    );
}

export default PostsViewer;