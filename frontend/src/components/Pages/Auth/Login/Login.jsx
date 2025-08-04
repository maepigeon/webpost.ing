import React, { useState } from 'react';
import axios from 'axios';



function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = (event) => {
    event.preventDefault();
    // Basic validation (replace with your actual authentication logic)
    if (username === '' || password === '') {
      setError('Please fill in all the fields and try again.');
      return;
    }
    // Send login request to your backend here 
    LOGIN_ATTEMPT(username, password);
  };
  function LOGIN_ATTEMPT(username, password) {
    const promise = axios.post("http://localhost:8080/api/loginSessionAttempt",
    {
      username: username,
      password: password
    },
    {
        withCredentials: true
    });
    const dataPromise = promise.then(
      (response) => {
        localStorage.setItem("userName", username);
        window.location.reload();
        response.data;
      })
    .catch(error => {
      console.log("Failed to log in user " + username + ". " + error);
    });
    return dataPromise;
  }
  

  return (
    <div className="form-container">
      <h2>Login</h2>
      <form onSubmit={handleSubmit}>
        <div className='form-group'>
          <label htmlFor="username">Username:</label>
          <input 
            type="text" 
            id="username" 
            value={username} 
            onChange={(e) => setUsername(e.target.value)} 
            required
          />
        </div>
        <div className='form-group'>
          <label htmlFor="password">Password:</label>
          <input 
            type="password" 
            id="password" 
            value={password} 
            onChange={(e) => setPassword(e.target.value)} 
            required
          />
        </div>
        {error && <p className="error">{error}</p>}
        <button type="submit">Login</button>
      </form>
    </div>
  );
}

export default Login;