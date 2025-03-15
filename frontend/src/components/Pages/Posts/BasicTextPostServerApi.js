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


//read
export function READ_POSTS () {
  const promise = axios.get("http://localhost:8080/api/posts");
  const dataPromise = promise.then((response) => response.data);
  console.log("reading all posts");
  return dataPromise;
};



//update
export function CREATE_POST() {
  console.log("creating a new post") ;
  const promise = axios.post("http://localhost:8080/api/posts",
  {
    id: 1,
    title: "Title",
    description: "Description",
    published: false
  });
  const dataPromise = promise.then((response) => response.data);
  console.log("created POST");
  return dataPromise;
}