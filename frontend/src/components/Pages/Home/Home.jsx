import React from 'react';
import {GET_ALL_USERS} from '../Posts/BasicTextPostServerApi.js';
import {useEffect, useState} from 'react';
import {Link} from 'react-router-dom';
import '../../../App.css'

function Home() {

    const [usersArray, setUsersArray] = useState([]);  
    useEffect(() => {
      refreshUsers();
    },[]);
    function refreshUsers() {
      //Loads the list of all posts created by the specified user, sorted by date
      GET_ALL_USERS().then(data => {
        console.log(data);
        setUsersArray(data.sort(
          function(a,b) {
            return new Date(b.registration_date) - new Date(a.registration_date);
          }
        ));
      }).catch(err => console.log(response));
    }
    return (
        <div id="homePage" className="page">
            <h1>
                Welcome to webpost.ing
            </h1>
            <p>
                Created by Mae Pigeon - <a href="https://www.maepigeon.com">www.maepigeon.com</a>

            </p>
            <br/>
            <h2>All Users (Select a user from the list below to view their profile)</h2>
            {
            /* Display all the posts by the user */
           (!Array.isArray(usersArray) || !usersArray.length) 
            ? (console.log(usersArray) && <p> There are no posts, yet. Create one to get started.</p>)
            : usersArray.map((record, index) => (
                <div className='userProfileLink' key={index}>
                    <Link to={"/routes/PostsViewer/"+record.username+""}>
                        <p> {record.username}</p>
                    </Link>
                </div>
              ))

          } 
        </div>
    );
}

export default Home;