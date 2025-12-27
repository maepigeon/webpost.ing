import { useState, useEffect, React } from 'react';
import axios from "axios";
import Counter from "./Counter";
import './Tests.css';

function Test() {
    const [array, setArray] = useState([]);
    const fetchAPI = async () => {
      const response = await axios.get("http://localhost:8080/api/fruitArray");
      console.log(response.data.jsonFruitsArray);
      const toJSON = JSON.parse(response.data.jsonFruitsArray);
      console.log(toJSON);
      setArray(toJSON.fruits);
      console.log(toJSON.fruits);
    };
    
    useEffect(() => {
      fetchAPI();
    }, []);
  

    return (
        <>
          <div className="card">
            <h2>TestGetFruits: Fruits from the backend server</h2>
            {array.map((fruit, index) => (
                <div key={index}>
                    <p>{fruit} </p>
                </div>
            ))} 
        </div> 
            <Counter />
        </>
      
    );
}

export default Test;