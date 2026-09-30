import './App.css';
import { useEffect } from 'react';
import { AUTHORIZE_SESSION, SEND_HEARTBEAT } from "./components/Pages/Posts/BasicTextPostServerApi"

import { Routes, Route, Navigate } from 'react-router-dom';

import Navbar from './components/Navbar/Navbar';
import Login from './components/Pages/Auth/Login/Login'
import Registration from './components/Pages/Auth/Registration/Registration'
import Logout from './components/Pages/Auth/Logout/Logout'
import AdminPanel from './components/Pages/Auth/AdminPanel/AdminPanel'
import PostsViewer from './components/Pages/Posts/PostsViewer/PostsViewer';
import RichTextEditor from './components/Pages/Posts/PostRenderer/RichTextPost/Editor';
import RichTextViewer from './components/Pages/Posts/PostRenderer/RichTextPost/Viewer';
import Home from './components/Pages/Home/Home';
import ScrollToTop from './components/ScrollToTop/ScrollToTop';
import CursorGlow from './components/CursorGlow/CursorGlow.jsx';
import InboxPage from './components/Social/InboxPage.jsx';
import MessagesPage from './components/Social/MessagesPage.jsx';
import DiscussionPage from './components/Social/DiscussionPage.jsx';
import SearchPage from './components/Pages/Search/SearchPage.jsx';
import ActivityPage from './components/Pages/Activity/ActivityPage.jsx';
import SettingsPage from './components/Pages/Settings/SettingsPage.jsx';
import EmailActionPage from './components/Pages/Settings/EmailActionPage.jsx';
import ForgotPasswordPage from './components/Pages/Settings/ForgotPasswordPage.jsx';

import { installSessionInterceptor } from './utils/session.js'
import AppErrorBoundary from './components/ErrorBoundary/AppErrorBoundary.jsx'
import SiteBackground from './components/SiteBackground/SiteBackground.jsx'
import { DocumentThemeLayers } from './components/PageTheme/PageTheme.jsx';


// Installed once at module load, before any component can issue a request.
installSessionInterceptor();

function App() {
  // Confirm the stored session is still good. Sessions live in memory on the
  // server, so a restart invalidates every one of them while the browser still
  // believes it is signed in; a 401 here is turned into a sign-out by the
  // interceptor above.
  //
  // In an effect, not the render body: this is a side effect, and running it
  // inline fired on every re-render (and twice under StrictMode).
  useEffect(() => {
    if (localStorage.getItem("userName")) AUTHORIZE_SESSION().catch(() => {});
  }, []);

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
      <CursorGlow />
      <Navbar />
      <ScrollToTop />

      <DocumentThemeLayers />
      <SiteBackground />

      <AppErrorBoundary>

      <Routes>
        <Route index element={ <Home />} />
        <Route path="/editor" element={<RichTextEditor />} />
        <Route path="/editor/:id" element={<RichTextEditor />} />
        <Route path="/routes/Login" element={<Login />} />
        <Route path="/routes/Logout" element={<Logout />} />
        <Route path="/routes/AdminPanel" element={<AdminPanel />} />
        <Route path="/routes/NewAccount" element={<Registration />} />
        <Route path="/inbox" element={<InboxPage />} />
        <Route path="/messages" element={<MessagesPage />} />
        <Route path="/search" element={<SearchPage />} />
        <Route path="/activity/:username" element={<ActivityPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        {/* Opened from links in emails, so these must work while signed out. */}
        <Route path="/verify-email" element={<EmailActionPage mode="verify" />} />
        <Route path="/unsubscribe" element={<EmailActionPage mode="unsubscribe" />} />
        <Route path="/reset-password" element={<EmailActionPage mode="reset" />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        {/* Canonical profile and post URLs, at the top level.
            These come last so every static route above wins: React Router ranks
            by specificity, and a literal segment always beats a dynamic one, so
            /settings can never be read as a profile called "settings".
            ReservedUsernames additionally stops such a name being registered. */}
        <Route path="/:username" element={<PostsViewer />} />
        <Route path="/:username/:id" element={<RichTextViewer />} />
        <Route path="/:username/:id/discussion" element={<DiscussionPage />} />

        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
        </AppErrorBoundary>
    </div>
  )
}

export default App
