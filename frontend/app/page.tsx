import Navbar from '@/components/Navbar'
import Hero from '@/components/Hero'
import TrustBar from '@/components/TrustBar'
import HowItWorks from '@/components/HowItWorks'
import Vision from '@/components/Vision'
import Faq from '@/components/Faq'
import CallToAction from '@/components/CallToAction'
import Footer from '@/components/Footer'
import { unstable_rethrow } from 'next/navigation'
import { getCurrentUser } from '@/modules/auth'

/**
 * Signed-in state, or signed out when Supabase is unreachable or not configured.
 *
 * getCurrentUser() redirects a signed-in student whose email is not verified
 * to /verify-email, and Next.js implements redirect() by throwing. Rethrow
 * those framework errors first so the catch only swallows real failures.
 */
async function isSignedIn(): Promise<boolean> {
  try {
    return (await getCurrentUser()) !== null
  } catch (error) {
    unstable_rethrow(error)
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
