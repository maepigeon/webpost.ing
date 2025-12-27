import { combineReducers } from 'redux';

const counterInitialState = {
    counter: 0
};
const userdataInitialState = {
    username: "Guest"
};
  
  const counterReducer = (state = counterInitialState, action) => {
    switch (action.type) {
      case "INCREMENT":
        return { ...state, counter: state.counter + 1 };
      case "DECREMENT":
        return { ...state, counter: state.counter - 1 };
      default:
        return state;
    }
  };

  const userdataReducer = (state = userdataInitialState, action) => {
    switch (action.type) {
        case "SET_USERNAME":
            return {...state, username: action.username};
        default:
            return state;
    }
  }
  

  
// Combine Reducers
const rootReducer = combineReducers({
    counter: counterReducer,
    userdata: userdataReducer,
  });

export default rootReducer;