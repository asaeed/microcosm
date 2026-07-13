// Net — the page's only talk-path to the server. Plain global, no modules (no build step).
const Net = {
  input(data) {
    return fetch('/input', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data),
    });
  },
  physics(updates) {
    return fetch('/physics', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ updates }),
    });
  },
  listen({ onSnapshot, onCommands, onDirector }) {
    const es = new EventSource('/events'); // auto-reconnects
    es.addEventListener('snapshot', (e) => onSnapshot(JSON.parse(e.data)));
    es.addEventListener('commands', (e) => onCommands(JSON.parse(e.data)));
    es.addEventListener('director', (e) => onDirector && onDirector(JSON.parse(e.data)));
    return es;
  },
};
