const STEPS = [
  {
    title: 'Sign in with your university email',
    description: 'No new username to remember. Your AUB account keeps the community students-only.',
  },
  {
    title: 'Tell us what you’re into',
    description: 'Pick a few interests (clubs, topics, skills) and we’ll suggest communities to start with.',
  },
  {
    title: 'Get a feed made for you',
    description: 'See the events, clubs and conversations that matter to you, and add events to your schedule.',
  },
]

function HowItWorks() {
  return (
    <section className="section how" id="how-it-works">
      <div className="section-head">
        <p className="eyebrow">Getting started</p>
        <h2>Settle in within minutes</h2>
      </div>

      <ol className="steps">
        {STEPS.map((step, i) => (
          <li className="step" key={step.title}>
            <span className="step-number" aria-hidden="true">{i + 1}</span>
            <h3>{step.title}</h3>
            <p>{step.description}</p>
          </li>
        ))}
      </ol>
    </section>
  )
}

export default HowItWorks
