import { useState, useEffect, React } from 'react';
import axios from "axios";

import './Tests.css';

function TestRestTutorial() {
    const [array, setArray] = useState([]);
    const fetchAPI = async () => {
      const response = await axios.get("http://localhost:8080/api/tutorials");
      console.log(response.data);
      const toJSON = response.data;
      console.log(toJSON);
      setArray(toJSON);
      toJSON.forEach(element => {
        console.log(JSON.stringify(element));
      });
    };
    
    useEffect(() => {
      fetchAPI();
    }, []);
  

    return (
        <div className="card">
            <h2>TestRestTutorial: All user-created records</h2>
            {array.map((record, index) => (
                <div key={index}>
                    <p>{JSON.stringify(record)} </p>
                </div>
            ))} 
        </div> 
    );
}

export default TestRestTutorial;