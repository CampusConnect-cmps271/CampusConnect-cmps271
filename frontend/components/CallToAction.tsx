import Link from 'next/link'
import { ArrowRight } from 'lucide-react'

function CallToAction() {
  return (
    <section className="cta">
      <div className="cta-inner">
        <h2>Ready to feel at home on campus?</h2>
        <p>Your clubs, your questions and your people are waiting.</p>
        <Link href="/login" className="btn btn-light btn-lg">
          Log in to CampusConnect <ArrowRight size={18} aria-hidden="true" />
        </Link>
      </div>
    </section>
  )
}

export default CallToAction
