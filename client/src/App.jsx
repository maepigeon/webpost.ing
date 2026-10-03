import './App.css';
import { useEffect, Fragment, lazy, Suspense } from 'react';
import { AUTHORIZE_SESSION } from "./components/Pages/Posts/BasicTextPostServerApi"

import { Routes, Route, Navigate, useParams, useLocation } from 'react-router-dom';

import Navbar from './components/Navbar/Navbar';
import Login from './components/Pages/Auth/Login/Login'
import Registration from './components/Pages/Auth/Registration/Registration'
import Logout from './components/Pages/Auth/Logout/Logout'
const AdminPanel = lazy(() => import('./components/Pages/Auth/AdminPanel/AdminPanel'));
const PostsViewer = lazy(() => import('./components/Pages/Posts/PostsViewer/PostsViewer'));
const RichTextEditor = lazy(() => import('./components/Pages/Posts/PostRenderer/RichTextPost/Editor'));
const RichTextViewer = lazy(() => import('./components/Pages/Posts/PostRenderer/RichTextPost/Viewer'));
import Home from './components/Pages/Home/Home';
import ScrollToTop from './components/ScrollToTop/ScrollToTop';
import MiniPlayer from './components/AudioPlayer/MiniPlayer.jsx';
const InboxPage = lazy(() => import('./components/Social/InboxPage.jsx'));
const FollowingPage = lazy(() => import('./components/Social/FollowingPage.jsx'));
const DiscoverPage = lazy(() => import('./components/Pages/Discover/DiscoverPage.jsx'));
const MessagesPage = lazy(() => import('./components/Social/MessagesPage.jsx'));
const DiscussionPage = lazy(() => import('./components/Social/DiscussionPage.jsx'));
const SearchPage = lazy(() => import('./components/Pages/Search/SearchPage.jsx'));
const ActivityPage = lazy(() => import('./components/Pages/Activity/ActivityPage.jsx'));
const SettingsPage = lazy(() => import('./components/Pages/Settings/SettingsPage.jsx'));
const CustomizePage = lazy(() => import('./components/Pages/Settings/CustomizePage.jsx'));
const StickerCenterPage = lazy(() => import('./components/TileArt/StickerCenter.jsx'));
const EmailActionPage = lazy(() => import('./components/Pages/Settings/EmailActionPage.jsx'));
const ForgotPasswordPage = lazy(() => import('./components/Pages/Settings/ForgotPasswordPage.jsx'));

import { installSessionInterceptor } from './utils/session.js'
import AppErrorBoundary from './components/ErrorBoundary/AppErrorBoundary.jsx'
import SiteBackground from './components/SiteBackground/SiteBackground.jsx'
import { DocumentThemeLayers } from './components/PageTheme/PageTheme.jsx';


// Pages past the first screen load when first visited, so the home page and
// sign-in don't download the editors (Lexical, KaTeX) and the rest up front.

// Installed once at module load, before any component can issue a request.
installSessionInterceptor();

/**
 * Starts the page afresh when its URL parameters change. Router reuses the
 * mounted page when only a parameter changes — going from one profile to
 * another, or from editing a post to a new one — so it kept the last page's
 * state, and a slow reply for the old page could land in the new one.
 */
function Fresh({ children }) {
  const params = useParams();
  return <Fragment key={JSON.stringify(params)}>{children}</Fragment>;
}

function App() {
  const location = useLocation();
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

  // (No heartbeat timer: the Navbar's unread-count poll tells the server the user is active.)

  return (
    <div id="appBody">
      <Navbar />
      <ScrollToTop />

      <DocumentThemeLayers />
      <SiteBackground />

      <AppErrorBoundary resetKey={location.pathname}>

      <Suspense fallback={<p className="page-loading" role="status">Loading…</p>}>
        <Routes>
          <Route index element={ <Home />} />
          <Route path="/editor" element={<Fresh><RichTextEditor /></Fresh>} />
          <Route path="/editor/:id" element={<Fresh><RichTextEditor /></Fresh>} />
          <Route path="/routes/Login" element={<Login />} />
          <Route path="/routes/Logout" element={<Logout />} />
          <Route path="/routes/AdminPanel" element={<AdminPanel />} />
          <Route path="/routes/NewAccount" element={<Registration />} />
          <Route path="/inbox" element={<InboxPage />} />
          <Route path="/following" element={<FollowingPage />} />
          <Route path="/discover" element={<DiscoverPage />} />
          <Route path="/messages" element={<MessagesPage />} />
          <Route path="/search" element={<SearchPage />} />
          <Route path="/activity/:username" element={<Fresh><ActivityPage /></Fresh>} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/customize" element={<CustomizePage />} />
          <Route path="/stickers" element={<StickerCenterPage />} />
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
          <Route path="/:username" element={<Fresh><PostsViewer /></Fresh>} />
          <Route path="/:username/:id" element={<Fresh><RichTextViewer /></Fresh>} />
          <Route path="/:username/:id/discussion" element={<Fresh><DiscussionPage /></Fresh>} />
  
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </Suspense>
        </AppErrorBoundary>

      {/* Outside the routes so a playing track survives navigation. */}
      <MiniPlayer />
    </div>
  )
}

export default App
