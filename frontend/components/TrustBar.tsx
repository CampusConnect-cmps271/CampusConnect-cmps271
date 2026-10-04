import { BadgeCheck, Lock, ShieldCheck, Sparkles } from 'lucide-react'

const POINTS = [
  { icon: Lock, text: 'University email sign-in only' },
  { icon: ShieldCheck, text: 'Moderated, respectful community' },
  { icon: BadgeCheck, text: 'Verified club information' },
  { icon: Sparkles, text: 'AI answers that cite their sources' },
]

function TrustBar() {
  return (
    <section className="trust" aria-label="Why students can trust CampusConnect">
      <ul className="trust-list">
        {POINTS.map(({ icon: Icon, text }) => (
          <li key={text}>
            <Icon size={18} aria-hidden="true" />
            {text}
          </li>
        ))}
      </ul>
    </section>
  )
}

export default TrustBar
