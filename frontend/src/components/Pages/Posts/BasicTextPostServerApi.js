import axios from 'axios';

//update
export function UPDATE_POST(id, titleField, descriptionField, publishedField) {
  console.log("updating post with id: " + id) 
  const promise = axios.put("http://localhost:8080/api/posts/" + id,
  {
      id: id,
      title: titleField,
      description: descriptionField,
      published: publishedField
  });
  const dataPromise = promise.then((response) => response.data);
  return dataPromise;
}

//delete
export function DELETE_POST(id) {
  console.log("deleting post with id: " + id)
  const promise = axios.delete("http://localhost:8080/api/posts/" + id);
  const dataPromise = promise.then((response) => response.data);
  return dataPromise;
}

export function AUTHORIZE_SESSION() {
  console.log("attempting to authorize session");
  const promise = axios.post("http://localhost:8080/api/authorizeSession");
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


//get posts created by a specified user
export function READ_POSTS_BY_USER(username) {
  const promise = axios.get("http://localhost:8080/api/user/" + username + "");
  const dataPromise = promise.then((response) => response.data);
  console.log("reading all posts");
  return dataPromise;
};


//read
export function READ_POSTS() {
  const promise = axios.get("http://localhost:8080/api/posts");
  const dataPromise = promise.then((response) => response.data);
  console.log("reading all posts");
  return dataPromise;
};

//get a post by its id in the database
export function READ_POST(id) {
  const promise = axios.get("http://localhost:8080/api/posts/" + id + "");
  const dataPromise = promise.then((response) => response.data);
  console.log("reading post " + id);
  return dataPromise;
}


//create
export function CREATE_POST(id, titleField, descriptionField, publishedField) {
  console.log("creating a new post") ;
  const promise = axios.post("http://localhost:8080/api/posts",
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