const QUESTIONS = [
  {
    q: 'Who can join CampusConnect?',
    a: 'Any student with a university email account. Signing in with your university email keeps the community limited to students.',
  },
  {
    q: 'How is this different from our group chats?',
    a: 'Group chats are scattered and easy to miss. CampusConnect puts clubs, events, questions and skill exchanges in one searchable place, with moderation and verified club information.',
  },
  {
    q: 'Can I trust the campus assistant’s answers?',
    a: 'The assistant links its answers to official university sources so you can check them yourself, and student opinions are always labeled separately from verified facts.',
  },
  {
    q: 'How are elective recommendations made?',
    a: 'Recommendations are based on your goals and preferences, and each one explains why it was suggested. You stay in control of the decision.',
  },
  {
    q: 'I forgot my password. What do I do?',
    a: 'Use “Reset your password” on the login page. We’ll email you a code so you can choose a new password.',
  },
]

function Faq() {
  return (
    <section className="section faq" id="faq">
      <div className="section-head">
        <p className="eyebrow">Questions</p>
        <h2>Good to know</h2>
      </div>

      <div className="faq-list">
        {QUESTIONS.map(({ q, a }) => (
          <details className="faq-item" key={q}>
            <summary>{q}</summary>
            <p>{a}</p>
          </details>
        ))}
      </div>
    </section>
  )
}

export default Faq
