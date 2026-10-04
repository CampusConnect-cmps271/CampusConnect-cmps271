'use client'

import Link from 'next/link'
import { useState } from 'react'
import { Menu, X } from 'lucide-react'

const LINKS = [
  { href: '#how-it-works', label: 'How it works' },
  { href: '#faq', label: 'FAQ' },
]

function Navbar() {
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

        <nav id="nav-links" className={`nav-links ${isOpen ? 'open' : ''}`}>
          {LINKS.map((link) => (
            <a key={link.href} href={link.href} onClick={close}>{link.label}</a>
          ))}
          <Link href="/login" className="btn btn-primary btn-sm" onClick={close}>Log in</Link>
        </nav>
      </div>
    </header>
  )
}

export default Navbar
