import { useState } from 'react';
import { AuthProvider, useAuth } from './auth';
import { AppProvider, useApp } from './store';
import Sidebar from './components/shell/Sidebar';
import TopBar from './components/shell/TopBar';
import CommandPalette from './components/shell/CommandPalette';
import Overview from './pages/Overview';
import IPOEngine from './pages/IPOEngine';
import Portfolio from './pages/Portfolio';
import Accounts from './pages/Accounts';
import History from './pages/History';
import Automation from './pages/Automation';
import Notifications from './pages/Notifications';
import Settings from './pages/Settings';
import Login from './pages/Login';
import Signup from './pages/Signup';

function Shell() {
  const { currentPage, commandOpen } = useApp();

  const pages: Record<string, React.ReactNode> = {
    overview: <Overview />,
    ipo: <IPOEngine />,
    portfolio: <Portfolio />,
    accounts: <Accounts />,
    history: <History />,
    automation: <Automation />,
    notifications: <Notifications />,
    settings: <Settings />,
  };

  return (
    <div className="flex flex-col h-screen overflow-hidden" style={{ background: 'var(--bg)' }}>
      <TopBar />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        <main className="flex-1 overflow-hidden" style={{ background: 'var(--bg)' }}>
          <div className="h-full fade-in" key={currentPage}>
            {pages[currentPage] ?? <Overview />}
          </div>
        </main>
      </div>
      {commandOpen && <CommandPalette />}
    </div>
  );
}

function AuthGate() {
  const { user } = useAuth();
  const [showSignup, setShowSignup] = useState(false);

  if (!user) {
    return showSignup
      ? <Signup onSwitch={() => setShowSignup(false)} />
      : <Login onSwitch={() => setShowSignup(true)} />;
  }

  return (
    <AppProvider>
      <Shell />
    </AppProvider>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AuthGate />
    </AuthProvider>
  );
}
