import { useEffect, useState } from 'react';
import { getState, subscribe } from '../../utils/audioPlayer.js';

/** The app-wide player's state, re-rendering on every change. */
export function useAudioPlayer() {
  const [state, setState] = useState(getState);
  useEffect(() => {
    setState(getState());
    return subscribe(setState);
  }, []);
  return state;
}
