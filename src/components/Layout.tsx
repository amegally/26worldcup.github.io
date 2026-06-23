import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import { useI18n } from '../i18n'
import type { IconName } from './Icon'
import Freshness from './Freshness'
import LeadLine from './LeadLine'

// primary navigation — the bracket builder leads as the call to action
const NAV: { to: string; key: string; icon: IconName; cta?: boolean }[] = [
  { to: '/predict', key: 'navPredict', icon: 'target', cta: true },
  { to: '/schedule', key: 'navSchedule', icon: 'calendar' },
  { to: '/groups', key: 'navGroups', icon: 'table' },
]

// secondary pages: still fully functional, reached from the footer link list
const FOOTER_NAV: { to: string; key: string }[] = [
  { to: '/bracket', key: 'navBracket' },
  { to: '/teams', key: 'navTeams' },
  { to: '/venues', key: 'navVenues' },
  { to: '/watch', key: 'navWatch' },
  { to: '/stats', key: 'navStats' },
  { to: '/forecast', key: 'navSim' },
  { to: '/settings', key: 'navSettings' },
]

export default function Layout() {
  const { t } = useI18n()
  const headerRef = useRef<HTMLElement>(null)
  const location = useLocation()

  // mobile menu (hamburger): full nav, closed on navigation / outside click / Escape
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const toggleRef = useRef<HTMLButtonElement>(null)
  // biome-ignore lint/correctness/useExhaustiveDependencies: close the menu whenever the route changes
  useEffect(() => {
    setMenuOpen(false)
  }, [location.pathname])
  useEffect(() => {
    if (!menuOpen) return
    const onDown = (e: MouseEvent) => {
      const tgt = e.target as Node
      if (
        menuRef.current &&
        !menuRef.current.contains(tgt) &&
        toggleRef.current &&
        !toggleRef.current.contains(tgt)
      ) {
        setMenuOpen(false)
      }
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [menuOpen])

  // sticky children (day headers, filter bars) offset themselves by the real
  // header height — it grows when the nav wraps to a second line
  useEffect(() => {
    const el = headerRef.current
    if (!el) return
    const apply = () => document.documentElement.style.setProperty('--hdr-h', `${el.offsetHeight}px`)
    apply()
    const ro = new ResizeObserver(apply)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // content-driven nav breakpoint: show the top nav only when every label fits
  // on one line, else fall back to the bottom tab bar
  const navRef = useRef<HTMLElement>(null)
  useLayoutEffect(() => {
    const nav = navRef.current
    if (!nav) return
    const update = () => {
      let needed = 0
      // fractional rect widths: summed integer offsetWidths under-report by a few px
      for (const child of nav.children) needed += (child as HTMLElement).getBoundingClientRect().width
      needed += (nav.children.length - 1) * 2 // column gap
      // 1px slack against integer rounding clipping the first item in borderline languages
      document.documentElement.classList.toggle('nav-fits', needed <= nav.clientWidth + 1)
    }
    update()
    const ro = new ResizeObserver(update)
    ro.observe(nav)
    window.addEventListener('resize', update)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', update)
    }
  }, [])

  // split the localized "by {name}" around the author link (word order varies)
  const [builtPre, builtPost] = t('footerBuiltBy', { name: '~~' }).split('~~')
  const [origPre, origPost] = t('footerOriginalBy', { name: '~~' }).split('~~')

  return (
    <>
      <header className="shell-header" ref={headerRef}>
        <div className="shell-header-in">
          <NavLink to="/" className="masthead" aria-label={`${t('appName')} — ${t('appSub')}`}>
            <img className="masthead-logo" src="/logo.png" alt={t('appName')} width={132} height={44} />
          </NavLink>
          <nav className="top-nav" ref={navRef}>
            {NAV.map((n) => (
              <NavLink key={n.to} to={n.to} end={n.to === '/'} className={n.cta ? 'nav-cta' : undefined}>
                {t(n.key)}
              </NavLink>
            ))}
          </nav>
          <button
            type="button"
            className="nav-toggle"
            ref={toggleRef}
            aria-label={t('navMore')}
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((o) => !o)}
          >
            <span className="nav-toggle-bars" aria-hidden="true" />
          </button>
        </div>
        {menuOpen && (
          <div className="nav-menu" ref={menuRef}>
            <nav className="nav-menu-in" aria-label={t('navMore')}>
              {NAV.map((n) => (
                <NavLink
                  key={n.to}
                  to={n.to}
                  end={n.to === '/'}
                  className={n.cta ? 'nav-menu-cta' : undefined}
                >
                  {t(n.key)}
                </NavLink>
              ))}
              <hr className="nav-menu-rule" />
              {FOOTER_NAV.map((l) => (
                <NavLink key={l.to} to={l.to}>
                  {t(l.key)}
                </NavLink>
              ))}
            </nav>
          </div>
        )}
      </header>

      <main className="shell-main">
        <Outlet />
      </main>

      <footer className="shell-footer">
        <nav className="footer-nav" aria-label={t('navMore')}>
          {FOOTER_NAV.map((l) => (
            <Link key={l.to} to={l.to}>
              {t(l.key)}
            </Link>
          ))}
        </nav>
        <div className="shell-footer-meta">
          <Freshness />
        </div>
        <p className="shell-footer-built">
          {builtPre}
          <a href="https://www.instagram.com/alfred.makes" target="_blank" rel="noreferrer">
            alfred
          </a>
          {builtPost}
        </p>
        <LeadLine className="shell-footer-lead" />
        <div className="shell-footer-links">
          <a href="https://github.com/amegally/26worldcup.github.io" target="_blank" rel="noreferrer">
            GitHub
          </a>
          <span aria-hidden="true">·</span>
          <span>
            {origPre}
            <a href="https://github.com/tomchen" target="_blank" rel="noreferrer">
              Tom Chen
            </a>
            {origPost}
          </span>
          <span aria-hidden="true">·</span>
          <a
            href="https://github.com/amegally/26worldcup.github.io/blob/main/COPYRIGHT.md"
            target="_blank"
            rel="noreferrer"
          >
            {t('footerLicense')}
          </a>
          <span aria-hidden="true">·</span>
          <Link to="/privacy">{t('navPrivacy')}</Link>
          <span aria-hidden="true">·</span>
          <Link to="/terms">{t('navTerms')}</Link>
        </div>
      </footer>
    </>
  )
}
