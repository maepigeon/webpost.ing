import axios from 'axios';



//var baseUrl = "http://localhost:8080";
var baseUrl = "/api";


//delete
export function DELETE_POST(id) {
  console.log("deleting post with id: " + id)
  const promise = axios.delete(baseUrl + "/api/posts/" + id);
  const dataPromise = promise.then((response) => response.data);
  return dataPromise;
}

export function AUTHORIZE_SESSION() {
  console.log("attempting to authorize session");
  const promise = axios.post(baseUrl + "/api/authorizeSession");
  const dataPromise = promise.then((response) => response.data);
  promise.then((response) => {
    if (response.data == null || response.data == "") {
      console.log("Session is NOT authorized.");
      localStorage.removeItem("userName");
      window.location.reload();
    } else {
      console.log("Session is authorized: " + response.data)
    }
  });
  return dataPromise;
};

// Gets a list of all users, including user name, user id, and account creation date
export function GET_ALL_USERS() {
  const promise = axios.get(baseUrl + "/api/getAllUsers");
  console.log("reading all posts");

  const dataPromise = promise.then(
    (response) => {
    console.log(response);
    return response.data
    });
  return dataPromise;
}


//get posts created by a specified user
export function READ_POSTS_BY_USER(username) {
  const promise = axios.get(baseUrl + "/api/user/" + username + "");
  const dataPromise = promise.then((response) => response.data);
  console.log("reading all posts");
  return dataPromise;
};


//read
export function READ_POSTS() {
  const promise = axios.get(baseUrl + "/api/posts");
  const dataPromise = promise.then((response) => response.data);
  console.log("reading all posts");
  return dataPromise;
};

//get a post by its id in the database
export function READ_POST(id) {
  const promise = axios.get(baseUrl + "/api/posts/" + id + "");
  const dataPromise = promise.then((response) => response.data);
  console.log("reading post " + id);
  return dataPromise;
}
//get a post by its id in the database
export function GET_USER_FROM_POST(id) {
  const promise = axios.get(baseUrl + "/api/UserFromPostID/" + id + "");
  const dataPromise = promise.then((response) => 
  {
    console.log("got user " + response + " from post id " + id);
    return response.data;
  });
  return dataPromise;
}


//create
export function CREATE_POST(id, titleField, descriptionField, publishedField) {
  console.log("creating a new post, title:" + titleField);
  if (titleField == "undefined") {titleField = "Undefined title";}
  const promise = axios.post(baseUrl + "/api/posts",
  {
    id: id,
    title: titleField,
    description: descriptionField,
    published: publishedField
  });
  const dataPromise = promise.then((response) => response.data);
  console.log("created POST");
  return dataPromise;
}
//update
export function UPDATE_POST(id, titleField, descriptionField, publishedField) {
  console.log("updating post with id: " + id) 
  const promise = axios.put(baseUrl + "/api/posts/" + id,
  {
      id: id,
      title: titleField,
      description: descriptionField,
      published: publishedField
  });
  const dataPromise = promise.then((response) => response.data);
  return dataPromise;
}
