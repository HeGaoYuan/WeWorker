import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom'
import { useEffect, useState } from 'react'
import SiteBackground from './components/SiteBackground.jsx'
import CursorGlow from './components/CursorGlow.jsx'
import CommandPalette from './components/CommandPalette.jsx'
import Navbar from './components/Navbar.jsx'
import Footer from './components/Footer.jsx'
import Landing from './pages/Landing.jsx'
import Docs from './pages/Docs.jsx'
import Download from './pages/Download.jsx'
import Stats from './pages/Stats.jsx'
import { CommandPaletteProvider } from './lib/CommandPaletteContext.jsx'
import { THEME_STORAGE_KEY, applyTheme, getInitialTheme } from './lib/theme.js'
import { reportVisit } from './lib/visits.js'

function ScrollToTop() {
  const { pathname } = useLocation()
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [pathname])
  return null
}

function VisitReporter() {
  const { pathname } = useLocation()
  useEffect(() => {
    reportVisit(pathname)
  }, [pathname])
  return null
}

function AppShell({ theme, onToggleTheme }) {
  const { pathname } = useLocation()
  const isHome = pathname === '/'

  return (
    <div className="page-shell min-h-screen flex flex-col bg-bg text-[rgb(var(--color-text))]">
      <SiteBackground variant={isHome ? 'home' : 'plain'} />
      <CursorGlow />
      <Navbar theme={theme} onToggleTheme={onToggleTheme} />
      <main className="flex-1 pt-14">
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/download" element={<Download />} />
          <Route path="/docs" element={<Docs />} />
          <Route path="/docs/:slug" element={<Docs />} />
          <Route path="/stats" element={<Stats />} />
        </Routes>
      </main>
      <Footer />
      <CommandPalette />
    </div>
  )
}

export default function App() {
  const [theme, setTheme] = useState(getInitialTheme)

  useEffect(() => {
    applyTheme(theme)
    window.localStorage.setItem(THEME_STORAGE_KEY, theme)
  }, [theme])

  return (
    <BrowserRouter>
      <CommandPaletteProvider>
        <ScrollToTop />
        <VisitReporter />
        <AppShell
          theme={theme}
          onToggleTheme={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
        />
      </CommandPaletteProvider>
    </BrowserRouter>
  )
}
