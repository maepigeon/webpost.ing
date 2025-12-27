import { useState, useEffect, React} from 'react';
import {AUTHORIZE_SESSION, READ_POSTS, READ_POSTS_BY_USER} from '../BasicTextPostServerApi.js'
import BasicTextPost from '../PostRenderer/BasicTextPost/BasicTextPost.jsx';
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

function hasModifyPermissions(viewedUser) {
  const username = localStorage.getItem("userName");
  if (username != viewedUser) {return false;}
  return (username != null && username != "" && AUTHORIZE_SESSION());
}


// Loads a view of title cards for all posts by the user specified in the url
function PostsViewer() {
    const [postsArray, setPostsArray] = useState([]);  
    const { username } = useParams();
    
    useEffect(() => {
      refreshPosts();
    },[username]);
    function refreshPosts() {
      //Loads the list of all posts created by the specified user, sorted by date
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

         <Heading username={username}/>
          {
            /* Display all the posts by the user */
           (!Array.isArray(postsArray) || !postsArray.length) 
            ? (console.log(postsArray) && <p> There are no posts, yet. Create one to get started.</p>)
            : postsArray.map((record, index) => (
                <div className="PostContainer" key={index}>
                    <BasicTextPost postdata={record} updatePostsFlagCallback={()=>{refreshPosts()}}
                     uploaded={true} hasModifyPermissions={hasModifyPermissions(username)}/>
                </div>
              ))

          } 
        </div> 
      </div>
    );
}

export default PostsViewer;