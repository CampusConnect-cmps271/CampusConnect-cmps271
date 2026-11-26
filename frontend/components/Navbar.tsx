'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { Menu, X } from 'lucide-react'
import { LogoutButton } from '@/modules/auth/components/LogoutButton'
import { DEFAULT_SIGNED_IN_PATH, LOGIN_PATH, REGISTER_PATH } from '@/modules/auth/navigation'

const LINKS = [
  { href: '#how-it-works', label: 'How it works' },
  { href: '#faq', label: 'FAQ' },
]

function Navbar({ signedIn }: { signedIn: boolean }) {
  const [isOpen, setIsOpen] = useState(false)
  const close = () => setIsOpen(false)
  const headerRef = useRef<HTMLElement>(null)
  const toggleRef = useRef<HTMLButtonElement>(null)

  // While the mobile menu is open: Escape closes it and returns focus to the
  // toggle, a tap outside the header closes it, and widening past the mobile
  // breakpoint resets it so it cannot reopen stuck when the window shrinks again.
  useEffect(() => {
    if (!isOpen) return

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      setIsOpen(false)
      toggleRef.current?.focus()
    }
    const onPointerDown = (event: PointerEvent) => {
      if (event.target instanceof Node && !headerRef.current?.contains(event.target)) {
        setIsOpen(false)
      }
    }
    const desktop = window.matchMedia('(min-width: 769px)')
    const onBreakpoint = (event: MediaQueryListEvent) => {
      if (event.matches) setIsOpen(false)
    }

    document.addEventListener('keydown', onKeyDown)
    document.addEventListener('pointerdown', onPointerDown)
    desktop.addEventListener('change', onBreakpoint)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('pointerdown', onPointerDown)
      desktop.removeEventListener('change', onBreakpoint)
    }
  }, [isOpen])

  return (
    <header className="navbar" ref={headerRef}>
      <div className="navbar-inner">
        <Link href="/" className="brand" onClick={close}>
          <span className="brand-mark" aria-hidden="true">C</span>
          CampusConnect
        </Link>

        <button
          ref={toggleRef}
          type="button"
          className="nav-toggle"
          aria-label={isOpen ? 'Close menu' : 'Open menu'}
          aria-expanded={isOpen}
          aria-controls="nav-links"
          onClick={() => setIsOpen((open) => !open)}
        >
          {isOpen ? <X size={24} /> : <Menu size={24} />}
        </button>

        <nav id="nav-links" className={`nav-links ${isOpen ? 'open' : ''}`} aria-label="Main">
          {LINKS.map((link) => (
            <a key={link.href} href={link.href} onClick={close}>{link.label}</a>
          ))}
          {signedIn ? (
            <>
              <Link href={DEFAULT_SIGNED_IN_PATH} className="btn btn-primary btn-sm" onClick={close}>Go to home</Link>
              <LogoutButton className="btn btn-ghost btn-sm nav-logout" />
            </>
          ) : (
            <>
              <Link href={LOGIN_PATH} className="btn btn-ghost btn-sm" onClick={close}>Log in</Link>
              <Link href={REGISTER_PATH} className="btn btn-primary btn-sm" onClick={close}>Sign up</Link>
            </>
          )}
        </nav>
      </div>
    </header>
  )
}

export default Navbar
