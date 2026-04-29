import './App.css'

function App() {
  return (
    <main className="app">
      <header className="topbar">
        <h1>Home</h1>
        <button type="button">Sync now</button>
      </header>

      <section className="panel">
        <h2>Inbox</h2>
        <p>No notifications synced yet.</p>
      </section>

      <section className="panel">
        <h2>Settings</h2>
        <p>Add Slack, GitHub, and Shortcut sources in the next milestone.</p>
      </section>
    </main>
  )
}

export default App
