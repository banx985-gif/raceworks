// Back navigation: the phone/browser Back button and Esc step back one level (close the open sheet, or leave a
// sub-screen) instead of leaving the app.
//   depth()  → how many levels are open right now (0 = home, nothing open)
//   back()   → step back one level; returns true if it did something
// While depth() > 0 one extra history entry is kept, so the phone's Back lands here. When the game closes the
// level itself (✕, a Back button), that entry is removed again. Call sync() once per frame.
export function createBackNav({ depth, back }) {
  let pending = false; // a history.back() we asked for has not arrived yet
  const ours = () => history.state?.raceworksBack === true;

  window.addEventListener('popstate', () => {
    if (pending) {
      pending = false; // our own clean-up: the level is already closed
      return;
    }
    if (depth() > 0) back();
  });
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && depth() > 0) back();
  });

  return {
    sync() {
      if (pending) return;
      if (depth() > 0 && !ours()) history.pushState({ raceworksBack: true }, '');
      else if (depth() === 0 && ours()) {
        pending = true;
        history.back();
      }
    },
  };
}
