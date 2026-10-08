import '@fontsource-variable/big-shoulders';
import '@fontsource-variable/newsreader';
import './style.css';
import { startGame } from './game.js';
startGame().catch(error => {
  console.error('[eva]', error);
  const note = document.createElement('p');
  note.style.cssText = 'position:fixed;bottom:24px;left:24px;right:24px;z-index:100;color:#f2dcc1;background:#12202b;padding:18px;font:16px sans-serif';
  note.textContent = 'Kepler-9 EVA n’a pas pu démarrer. WebGL 2 doit être disponible. Recharge la page pour réessayer.';
  document.body.append(note);
});
