import { useState, useEffect, React} from 'react';
import {CREATE_POST, READ_POSTS, READ_POSTS_BY_USER} from '../BasicTextPostServerApi.js'
import BasicTextPost from '../PostRenderer/BasicTextPost/BasicTextPost.jsx';
import '../PostWindow.css';
import {useParams} from "react-router-dom";


function PostsViewer() {
    const [postsArray, setPostsArray] = useState([]);  
    const { username } = useParams();


    useEffect(() => {
      refreshPosts();
    },[]);
    function refreshPosts() {
        console.log("refreshing state.")
        console.log("username from url: " + username);
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
          <button className="newPostButton" onClick={() => {
              CREATE_POST(1, "Default title", "Default description", false).then(() => {
                refreshPosts()})
              }}> Create New Post </button>
          <BasicTextPost postdata={{id: 1, title: "title", description: "description", published: false}} 
            updatePostsFlagCallback={()=>{refreshPosts()}} uploaded={false}/>
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