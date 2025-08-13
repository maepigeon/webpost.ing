import './App.css';
import {AUTHORIZE_SESSION} from "./components/Pages/Posts/BasicTextPostServerApi"


import { Routes, Route, Navigate } from 'react-router-dom';

import Navbar from './components/NavBar/Navbar';
import Login from './components/Pages/Auth/Login/Login'
import Registration from './components/Pages/Auth/Registration/Registration'
import Logout from './components/Pages/Auth/Logout/Logout'
import AdminPanel from './components/Pages/Auth/AdminPanel/AdminPanel'
import UserSettingsEditor from './components/Pages/UserSettingsEditor/UserSettingsEditor'
import PostEditor from './components/Pages/Posts/PostsViewer/PostEditor';
import PostsViewer from './components/Pages/Posts/PostsViewer/PostsViewer';
import RichTextEditor from './components/Pages/Posts/PostRenderer/RichTextPost/Editor';
import RichTextViewer from './components/Pages/Posts/PostRenderer/RichTextPost/Viewer';
import Test from './components/Pages/Test/Test';
import Home from './components/Pages/Home/Home';

import axios from 'axios'


function App() {
  axios.defaults.withCredentials = true;
  if (  localStorage.getItem("userName") != null) {
    AUTHORIZE_SESSION();
  }
  console.log("loading authorized session...")

  return (
    <div id="appBody">      
      <Navbar /> 

      <Routes>
        <Route index element={ <Home />} />
        <Route path="/routes" element={<Home />} />
        <Route path="/routes/PostEditor" element={<PostEditor />} />
        <Route path="/routes/PostsViewer" element={<PostsViewer />} />
        <Route path="/routes/PostsViewer/:username" element={<PostsViewer />} />
        <Route path="/routes/RichTextViewer" element={<RichTextViewer />} />
        <Route path="/routes/RichTextViewer/:id" element={<RichTextViewer />} />
        <Route path="/routes/RichTextEditor" element={<RichTextEditor />} />
        <Route path="/routes/RichTextEditor/:id" element={<RichTextEditor />} />
        <Route path="/routes/UserSettingsEditor" element={<UserSettingsEditor />} />
        <Route path="/routes/Login" element={<Login />} />
        <Route path="/routes/Logout" element={<Logout />} />
        <Route path="/routes/AdminPanel" element={<AdminPanel />} />
        <Route path="/routes/NewAccount" element={<Registration />} />
        <Route path="/routes/Test" element={<Test /> } />
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </div>
  )
}

export default App
