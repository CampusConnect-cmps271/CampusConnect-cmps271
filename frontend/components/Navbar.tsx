'use client'

import Link from 'next/link'
import { useState } from 'react'
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

  return (
    <header className="navbar">
      <div className="navbar-inner">
        <Link href="/" className="brand" onClick={close}>
          <span className="brand-mark" aria-hidden="true">C</span>
          CampusConnect
        </Link>

        <button
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
