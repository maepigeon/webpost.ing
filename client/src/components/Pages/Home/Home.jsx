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
        setUsersArray(data);
      }).catch(err => console.log(err));
    }
    return (
        <div id="homePage" className="page" style={{ minHeight: 'calc(100vh - 48px)', display: 'flex', flexDirection: 'column' }}>
            <h1>
                Welcome to webpost.ing
            </h1>
            <h2>All Users</h2>
            <div className="user-list" style={{ flex: 1 }}>
            {
            /* Display all users, with links to their profiles */
           (!usersArray || !Array.isArray(usersArray) || !usersArray.length || usersArray.length == 0)
            ? (<p> No users found. The server could be down. Please contact Mae if you think this page is broken.</p>)
            : usersArray.map((record, index) => (
                <Link className='userProfileLink' key={index} to={"/users/"+record.username}>
                    {record.username}
                </Link>
              ))
          }
            </div>
            <footer style={{ padding: '16px 0 24px', borderTop: '1px solid rgba(0,0,0,0.1)', fontSize: '0.85rem' }}>
                <p style={{ color: '#888', margin: 0 }}>
                    Created by <a href="https://www.maepigeon.com" style={{ color: '#555' }}>Mae Pigeon</a>
                    {' · '}
                    <a href="https://github.com/maepigeon/webpost.ing/" style={{ color: '#555' }}>GitHub</a>
                </p>
            </footer>
        </div>
    );
}

export default Home;
