import { Heart } from 'lucide-react'

function Vision() {
  return (
    <section className="vision" aria-labelledby="vision-title">
      <div className="vision-inner">
        <Heart size={28} aria-hidden="true" className="vision-icon" />
        <h2 id="vision-title">Connect campus life with confidence</h2>
        <p>
          Starting university is a lot. CampusConnect exists so that every student, especially
          those who are new, can find reliable information, take part in student life, learn from
          one another, and make better academic choices through one safe and transparent platform.
        </p>
      </div>
    </section>
  )
}

export default Vision
