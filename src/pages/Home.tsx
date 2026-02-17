/**
 * ClinicCortex — Home Page
 * Design: Dark Neon Biopunk — Full landing page composition
 * Sections: Navbar, Hero, Problem, Features, Demo, Ecosystem, Testimonials, Pricing, CTA, Footer
 */

import Navbar from "@/components/sections/Navbar";
import HeroSection from "@/components/sections/HeroSection";
import ProblemSection from "@/components/sections/ProblemSection";
import FeaturesSection from "@/components/sections/FeaturesSection";
import ProductDemoSection from "@/components/sections/ProductDemoSection";
import EcosystemSection from "@/components/sections/EcosystemSection";
import TestimonialsSection from "@/components/sections/TestimonialsSection";
import PricingSection from "@/components/sections/PricingSection";
import CTASection from "@/components/sections/CTASection";
import Footer from "@/components/sections/Footer";
import IntegrationsSection from "@/components/sections/IntegrationsSection";
import ThemeFloatingSwitcher from "@/components/sections/ThemeFloatingSwitcher";

export default function Home() {
  return (
    <div className="min-h-screen bg-[var(--cc-bg-base)] text-[var(--cc-text-body)] overflow-x-hidden">
      <Navbar />
      <HeroSection />
      <ProblemSection />
      <FeaturesSection />
      <ProductDemoSection />
      <EcosystemSection />
      <TestimonialsSection />
      <IntegrationsSection />
      <PricingSection />
      <CTASection />
      <Footer />
      <ThemeFloatingSwitcher />
    </div>
  );
}
