
// src/app/about/page.tsx
import { PageHeader } from '@/components/layout/page-header';
import { Icons } from '@/components/icons';
import Image from 'next/image';
import Link from 'next/link';
import { Button } from '@/components/ui/button';

export default function AboutUsPage() {
  return (
    <div className="bg-gradient-to-br from-primary/5 via-background to-background min-h-screen">
      <PageHeader
        title="About AgriAssist"
        description="Cultivating the Future of Farming, Together."
        icon={Icons.Users}
      />
      <div className="container mx-auto px-4 py-8 md:px-6 md:py-12">
        <section className="bg-card p-8 md:p-12 rounded-xl shadow-xl">
          <div className="grid md:grid-cols-2 gap-8 md:gap-12 items-center">
            <div>
              <h2 className="text-3xl font-bold tracking-tight text-foreground mb-4">Our Mission</h2>
              <p className="text-lg text-muted-foreground mb-6">
                At AgriAssist, our mission is to empower small to medium-sized farms with accessible, affordable, and user-friendly technology. We believe that data-driven insights and sustainable practices are key to unlocking the full potential of modern agriculture, ensuring profitability and environmental stewardship for generations to come.
              </p>
              <h2 className="text-3xl font-bold tracking-tight text-foreground mb-4">Our Vision</h2>
              <p className="text-lg text-muted-foreground mb-6">
                We envision a future where every farmer, regardless of scale or technical expertise, can leverage the power of AgTech to optimize their operations, improve yields, conserve resources, and contribute to a more sustainable global food system. AgriAssist aims to be a trusted partner on this journey.
              </p>
               <Button asChild size="lg" className="mt-4 shadow-md hover:shadow-lg transition-shadow">
                <Link href="/contact">Get in Touch</Link>
              </Button>
            </div>
            <div className="relative aspect-square w-full h-auto overflow-hidden rounded-lg shadow-lg">
              <Image
                src="https://placehold.co/600x600.png" 
                alt="Diverse team working on agricultural technology"
                layout="fill"
                objectFit="cover"
                className="rounded-lg"
                data-ai-hint="team agriculture technology"
              />
            </div>
          </div>
        </section>

        <section className="py-12 md:py-20 text-center">
            <h2 className="text-3xl font-bold tracking-tight text-foreground mb-6">Why We Built AgriAssist</h2>
            <p className="text-lg text-muted-foreground max-w-3xl mx-auto mb-8">
                The agricultural landscape is evolving rapidly. Farmers face increasing pressure to produce more with less, navigate volatile markets, and adapt to changing environmental conditions. We saw a gap for a tool that not only helps manage the complexities of modern farming but also makes advanced technologies like AI and precision agriculture approachable and affordable. AgriAssist is built by a team passionate about agriculture and technology, dedicated to supporting the hardworking individuals who feed our world.
            </p>
        </section>

         <section className="text-center py-12 md:py-16 bg-muted/30 rounded-xl p-8">
          <h2 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">Join Our Growing Community</h2>
          <p className="mt-4 max-w-2xl mx-auto text-lg text-muted-foreground">
            Be part of a platform that understands the challenges and opportunities in today's agriculture.
          </p>
          <div className="mt-8 flex justify-center gap-4">
            <Button size="lg" asChild className="shadow-lg hover:shadow-primary/30 transition-shadow">
              <Link href="/register">Start Your Free Trial</Link>
            </Button>
            <Button size="lg" variant="outline" asChild className="shadow-lg hover:shadow-accent/30 transition-shadow">
              <Link href="/features">Learn More About Features</Link>
            </Button>
          </div>
        </section>
      </div>
    </div>
  );
}


    