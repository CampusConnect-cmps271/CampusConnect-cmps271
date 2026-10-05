import Navbar from '@/components/Navbar'
import Hero from '@/components/Hero'
import TrustBar from '@/components/TrustBar'
import HowItWorks from '@/components/HowItWorks'
import Vision from '@/components/Vision'
import Faq from '@/components/Faq'
import CallToAction from '@/components/CallToAction'
import Footer from '@/components/Footer'
import { getCurrentUser } from '@/modules/auth'

/** Signed-in state, or signed out when Supabase is unreachable or not configured. */
async function isSignedIn(): Promise<boolean> {
  try {
    return (await getCurrentUser()) !== null
  } catch {
    return false
  }
}

export default async function Home() {
  const signedIn = await isSignedIn()

  return (
    <div className="cc-page">
      <Navbar signedIn={signedIn} />
      <main>
        <Hero signedIn={signedIn} />
        <TrustBar />
        <HowItWorks />
        <Vision />
        <Faq />
        <CallToAction signedIn={signedIn} />
      </main>
      <Footer />
    </div>
  )
}
