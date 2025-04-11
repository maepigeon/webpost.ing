import reactLogo from './assets/react.svg';
import viteLogo from '/vite.svg';

import './App.css';

import { Routes, Route, Navigate } from 'react-router-dom';

import Navbar from './components/NavBar/Navbar';
import Login from './components/Pages/Auth/Login/Login'
import Registration from './components/Pages/Auth/Registration/Registration'
import Logout from './components/Pages/Auth/Logout/Logout'
import AdminPanel from './components/Pages/Auth/AdminPanel/AdminPanel'
import UserSettingsEditor from './components/Pages/UserSettingsEditor/UserSettingsEditor'
import PostEditor from './components/Pages/Posts/PostsViewer/PostEditor';
import PostsViewer from './components/Pages/Posts/PostsViewer/PostsViewer';
import ProfileEditor from './components/Pages/Profile/ProfileEditor/ProfileEditor';
import ProfileViewer from './components/Pages/Profile/ProfileViewer/ProfileViewer';
import Test from './components/Pages/Test/Test';
import Home from './components/Pages/Home/Home';

function App() {

  return (
    <div id="appBody">      
      <Navbar /> 

      <Routes>
        <Route index element={ <Home />} />
        <Route path="/routes" element={<Home />} />
        <Route path="/routes/PostEditor" element={<PostEditor />} />
        <Route path="/routes/PostsViewer" element={<PostsViewer />} />
        <Route path="/routes/ProfileViewer" element={<ProfileViewer />} />
        <Route path="/routes/ProfileEditor" element={<ProfileEditor />} />
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
