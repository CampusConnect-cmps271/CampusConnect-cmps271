import Link from 'next/link'
import { ArrowRight, BadgeCheck, CalendarDays, Repeat } from 'lucide-react'

function Hero() {
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
          <div className="hero-actions">
            <Link href="/login" className="btn btn-primary btn-lg">
              Log in with your AUB email <ArrowRight size={18} aria-hidden="true" />
            </Link>
            <a href="#how-it-works" className="btn btn-ghost btn-lg">See how it works</a>
          </div>
          <p className="hero-help">
            Locked out? <Link href="/forgot-password">Reset your password</Link>
          </p>
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
