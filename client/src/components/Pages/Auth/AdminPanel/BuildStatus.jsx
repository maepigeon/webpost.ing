import { useEffect, useState } from 'react';
import { BUILD, REPO, compareWithMain } from '../../../../utils/build.js';

const short = (sha) => (sha ? sha.slice(0, 7) : 'unknown');
const day = (iso) => (iso ? new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '');

/**
 * Which build of the website is live, and whether the repository has a newer
 * one. It only reports: updating is done from the owner's computer (the
 * Webposting app's Deploy, or tools/deploy.sh), never from this page.
 */
export default function BuildStatus() {
  const [state, setState] = useState({ status: 'checking' });
  const check = () => {
    setState({ status: 'checking' });
    compareWithMain(BUILD.commit)
      .then(result => setState({ status: 'done', ...result }))
      .catch(() => setState({ status: 'failed' }));
  };
  useEffect(check, []);

  const { status, behind, latest } = state;
  let line;
  if (status === 'checking') line = 'Checking for a newer version…';
  else if (status === 'failed') line = 'Could not reach GitHub to check for a newer version.';
  else if (behind === 0) line = 'Up to date.';
  else if (behind > 0) line = `Update available: ${behind} newer commit${behind === 1 ? '' : 's'}.`;
  else line = 'This build is not on main, so it cannot be compared.';

  return (
    <div className={`admin-build${behind > 0 ? ' admin-build--behind' : ''}`} role="status">
      <div>
        <strong>Live build:</strong> <code>{short(BUILD.commit)}</code>
        {BUILD.time && <span className="admin-build-dim"> from {day(BUILD.time)}</span>}
      </div>
      <div>
        {line}{' '}
        {status !== 'checking' && <button type="button" className="admin-build-check" onClick={check}>Check again</button>}
      </div>
      {status === 'done' && behind !== 0 && latest && (
        <div className="admin-build-dim">
          Latest on main: <a href={`https://github.com/${REPO}/commit/${latest.sha}`} target="_blank" rel="noopener noreferrer"><code>{short(latest.sha)}</code></a>
          {' '}{latest.message}{latest.date && ` (${day(latest.date)})`}. To update, press Deploy in the Webposting app.
        </div>
      )}
    </div>
  );
}
