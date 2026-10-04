import Navbar from '@/components/Navbar'
import Hero from '@/components/Hero'
import TrustBar from '@/components/TrustBar'
import HowItWorks from '@/components/HowItWorks'
import Vision from '@/components/Vision'
import Faq from '@/components/Faq'
import CallToAction from '@/components/CallToAction'
import Footer from '@/components/Footer'

export default function Home() {
  return (
    <>
      <Navbar />
      <main>
        <Hero />
        <TrustBar />
        <HowItWorks />
        <Vision />
        <Faq />
        <CallToAction />
      </main>
      <Footer />
    </>
  )
}
