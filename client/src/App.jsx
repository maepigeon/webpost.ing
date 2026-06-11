import './App.css';
import { useEffect } from 'react';
import { AUTHORIZE_SESSION, SEND_HEARTBEAT } from "./components/Pages/Posts/BasicTextPostServerApi"

import { Routes, Route, Navigate } from 'react-router-dom';

import Navbar from './components/Navbar/Navbar';
import Login from './components/Pages/Auth/Login/Login'
import Registration from './components/Pages/Auth/Registration/Registration'
import Logout from './components/Pages/Auth/Logout/Logout'
import AdminPanel from './components/Pages/Auth/AdminPanel/AdminPanel'
import PostEditor from './components/Pages/Posts/PostsViewer/PostEditor';
import PostsViewer from './components/Pages/Posts/PostsViewer/PostsViewer';
import RichTextEditor from './components/Pages/Posts/PostRenderer/RichTextPost/Editor';
import RichTextViewer from './components/Pages/Posts/PostRenderer/RichTextPost/Viewer';
import Test from './components/Pages/Test/Test';
import Home from './components/Pages/Home/Home';
import ScrollToTop from './components/ScrollToTop/ScrollToTop';
import InboxPage from './components/Social/InboxPage.jsx';
import MessagesPage from './components/Social/MessagesPage.jsx';
import DiscussionPage from './components/Social/DiscussionPage.jsx';
import SearchPage from './components/Pages/Search/SearchPage.jsx';
import ActivityPage from './components/Pages/Activity/ActivityPage.jsx';

import axios from 'axios'


function App() {
  axios.defaults.withCredentials = true;
  if (localStorage.getItem("userName") != null) {
    AUTHORIZE_SESSION();
  }

  // Heartbeat: keep online status fresh every 2 minutes
  useEffect(() => {
    const username = localStorage.getItem('userName');
    if (!username) return;
    SEND_HEARTBEAT(username);
    const id = setInterval(() => {
      const u = localStorage.getItem('userName');
      if (u) SEND_HEARTBEAT(u);
    }, 2 * 60 * 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <div id="appBody">
      <Navbar />
      <ScrollToTop />

      <Routes>
        <Route index element={ <Home />} />
        <Route path="/routes" element={<Home />} />
        <Route path="/users/:username" element={<PostsViewer />} />
        <Route path="/users/:username/:id" element={<RichTextViewer />} />
        <Route path="/users/:username/:id/discussion" element={<DiscussionPage />} />
        <Route path="/editor" element={<RichTextEditor />} />
        <Route path="/editor/:id" element={<RichTextEditor />} />
        {/* Legacy redirects — keep old URLs working */}
        <Route path="/routes/PostsViewer/:username" element={<PostsViewer />} />
        <Route path="/routes/RichTextViewer/:id" element={<RichTextViewer />} />
        <Route path="/routes/RichTextEditor/:id" element={<RichTextEditor />} />
        <Route path="/routes/RichTextEditor" element={<RichTextEditor />} />
        <Route path="/routes/Login" element={<Login />} />
        <Route path="/routes/Logout" element={<Logout />} />
        <Route path="/routes/AdminPanel" element={<AdminPanel />} />
        <Route path="/routes/NewAccount" element={<Registration />} />
        <Route path="/routes/Test" element={<Test /> } />
        <Route path="/inbox" element={<InboxPage />} />
        <Route path="/messages" element={<MessagesPage />} />
        <Route path="/search" element={<SearchPage />} />
        <Route path="/activity/:username" element={<ActivityPage />} />
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </div>
  )
}

export default App
