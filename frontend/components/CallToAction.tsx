import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { DEFAULT_SIGNED_IN_PATH, REGISTER_PATH } from '@/modules/auth/navigation'

function CallToAction({ signedIn }: { signedIn: boolean }) {
  return (
    <section className="cta">
      <div className="cta-inner">
        <h2>{signedIn ? 'Welcome back' : 'Ready to feel at home on campus?'}</h2>
        <p>Your clubs, your questions and your people are waiting.</p>
        {signedIn ? (
          <Link href={DEFAULT_SIGNED_IN_PATH} className="btn btn-light btn-lg">
            Go to your home <ArrowRight size={18} aria-hidden="true" />
          </Link>
        ) : (
          <Link href={REGISTER_PATH} className="btn btn-light btn-lg">
            Create your account <ArrowRight size={18} aria-hidden="true" />
          </Link>
        )}
      </div>
    </section>
  )
}

export default CallToAction
