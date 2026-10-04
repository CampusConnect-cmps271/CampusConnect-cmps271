import Link from 'next/link'

function Footer() {
  return (
    <footer className="footer">
      <div className="footer-inner">
        <div>
          <p className="footer-brand">CampusConnect</p>
          <p className="footer-tagline">Built for students, by students at the American University of Beirut.</p>
        </div>
        <nav className="footer-links" aria-label="Footer">
          <a href="#how-it-works">How it works</a>
          <a href="#faq">FAQ</a>
          <Link href="/login">Log in</Link>
        </nav>
      </div>
      <p className="footer-copy">&copy; 2026 CampusConnect · CMPS 271</p>
    </footer>
  )
}

export default Footer
