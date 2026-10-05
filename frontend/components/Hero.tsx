import Link from 'next/link'
import { ArrowRight, BadgeCheck, CalendarDays, Repeat } from 'lucide-react'
import {
  DEFAULT_SIGNED_IN_PATH,
  FORGOT_PASSWORD_PATH,
  LOGIN_PATH,
  REGISTER_PATH,
} from '@/modules/auth/navigation'

function Hero({ signedIn }: { signedIn: boolean }) {
  return (
    <section className="hero">
      <div className="hero-inner">
        <div className="hero-copy">
          <p className="eyebrow">Made for AUB students</p>
          <h1>
            Your campus, <em>all in one place.</em>
          </h1>
          <p className="hero-lead">
            Find your clubs, get trusted answers, swap skills with classmates, and choose electives
            with confidence, alongside students who&apos;ve been exactly where you are.
          </p>

          {signedIn ? (
            <div className="hero-actions">
              <Link href={DEFAULT_SIGNED_IN_PATH} className="btn btn-primary btn-lg">
                Go to your home <ArrowRight size={18} aria-hidden="true" />
              </Link>
            </div>
          ) : (
            <>
              <div className="hero-actions">
                <Link href={REGISTER_PATH} className="btn btn-primary btn-lg">
                  Join with your AUB email <ArrowRight size={18} aria-hidden="true" />
                </Link>
                <Link href={LOGIN_PATH} className="btn btn-ghost btn-lg">I already have an account</Link>
              </div>
              <p className="hero-help">
                Locked out? <Link href={FORGOT_PASSWORD_PATH}>Reset your password</Link>
              </p>
            </>
          )}
        </div>

        {/* Illustrative preview of the app. Decorative, so hidden from screen readers. */}
        <div className="hero-preview" aria-hidden="true">
          <div className="preview-card preview-event">
            <div className="preview-icon"><CalendarDays size={18} /></div>
            <div>
              <p className="preview-kicker">This Thursday · 5:00 PM</p>
              <p className="preview-title">Welcome Fair: meet campus clubs</p>
              <span className="preview-pill">Add to my schedule</span>
            </div>
          </div>

          <div className="preview-card preview-question">
            <p className="preview-kicker">Asked in Q&amp;A</p>
            <p className="preview-title">When is the last day to drop a course?</p>
            <p className="preview-answer">
              <BadgeCheck size={16} /> Answer linked to the official academic calendar
            </p>
          </div>

          <div className="preview-card preview-swap">
            <div className="preview-icon"><Repeat size={18} /></div>
            <div>
              <p className="preview-kicker">SkillSwap match</p>
              <p className="preview-title">Python basics ⇄ Arabic calligraphy</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

export default Hero
