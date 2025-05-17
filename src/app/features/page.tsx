
// src/app/features/page.tsx
import { PageHeader } from '@/components/layout/page-header';
import { Icons } from '@/components/icons';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import Image from 'next/image';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { PublicPageLayout } from '@/components/layout/public-page-layout'; // Import the layout

interface FeatureDetailProps {
  icon: React.ElementType;
  title: string;
  description: string;
  imageUrl?: string;
  imageAlt?: string;
  imageHint?: string;
  details: string[];
  linkToAppSection?: string;
  linkText?: string;
}

const featureDetails: FeatureDetailProps[] = [
  {
    icon: Icons.Dashboard,
    title: "Intuitive Farm Dashboard",
    description: "Get a bird's-eye view of your entire farm operation in one place.",
    imageUrl: "https://placehold.co/600x400.png",
    imageAlt: "AgriAssist Dashboard Screenshot",
    imageHint: "dashboard farm analytics",
    details: [
      "Real-time weather updates for your farm's location.",
      "Key performance indicators: total acreage, active crops, upcoming harvests.",
      "At-a-glance summaries of crop yields and upcoming tasks.",
      "Proactive AI-driven insights to identify opportunities and risks.",
      "Quick actions to log new data or consult the AI Farm Expert."
    ],
    linkToAppSection: "/dashboard",
    linkText: "Explore Dashboard",
  },
  {
    icon: Icons.DataManagement,
    title: "Comprehensive Data Management",
    description: "Centralize all your farm records for easy access and analysis.",
    imageUrl: "https://placehold.co/600x400.png",
    imageAlt: "Data Management Interface",
    imageHint: "farm data management software",
    details: [
      "Log planting, harvesting, soil tests, fertilizer & irrigation applications.",
      "Track farm inputs (seeds, pesticides) and equipment inventory with maintenance logs.",
      "Manage financial records with dedicated expense and revenue logging.",
      "Define and visualize field boundaries (textual and upcoming visual mapping).",
      "Keep detailed records for livestock including registry, health, breeding, feed, and weight."
    ],
    linkToAppSection: "/data-management",
    linkText: "Manage Your Data",
  },
  {
    icon: Icons.AIExpert,
    title: "AI Farm Expert",
    description: "Leverage artificial intelligence for smarter farming decisions.",
    imageUrl: "https://placehold.co/600x400.png",
    imageAlt: "AI Farm Expert Interface",
    imageHint: "AI agriculture technology",
    details: [
      "Ask general farming questions and get concise answers.",
      "Diagnose plant health issues by uploading photos and describing symptoms.",
      "Receive AI-recommended treatment plans for crop diseases and pests.",
      "Get tailored optimization strategies based on your farm's data.",
      "Obtain advice on optimal planting/harvesting windows and sustainable practices.",
      "Interpret soil test results with AI-driven insights and recommendations."
    ],
    linkToAppSection: "/ai-expert",
    linkText: "Consult AI Expert",
  },
  {
    icon: Icons.Analytics,
    title: "In-Depth Analytics & Reporting",
    description: "Understand your farm's performance and make data-driven improvements.",
    imageUrl: "https://placehold.co/600x400.png",
    imageAlt: "Farm Analytics Charts",
    imageHint: "agricultural data analytics",
    details: [
      "Visualize historical yield comparisons by crop and year.",
      "Track monthly fertilizer and water usage trends.",
      "Generate financial overviews with profit/loss summaries.",
      "Filter reports by date ranges, crop types, and task statuses for granular insights.",
      "Future: Advanced custom reports and data export capabilities (CSV/PDF)."
    ],
    linkToAppSection: "/analytics", 
    linkText: "View Analytics",
  },
  {
    icon: Icons.Users,
    title: "Staff Collaboration & Roles",
    description: "Manage your farm team effectively with role-based access.",
    imageUrl: "https://placehold.co/600x400.png",
    imageAlt: "Team collaboration on farm",
    imageHint: "farm team management",
    details: [
      "Invite staff members to your farm account.",
      "Assign roles (Admin, Editor, Viewer) to control data access and feature permissions.",
      "Securely share farm data and collaborate on tasks.",
      "Maintain oversight as a farm owner with full administrative control."
    ],
    linkToAppSection: "/profile",
    linkText: "Manage Staff (Profile)",
  },
   {
    icon: Icons.Map,
    title: "Visual Field Mapping",
    description: "Define, view, and draw your field boundaries on an interactive map.",
    imageUrl: "https://placehold.co/600x400.png",
    imageAlt: "Farm map with field boundaries",
    imageHint: "field mapping GIS",
    details: [
      "View your farm and fields on a satellite map.",
      "Define fields with names, sizes, and GeoJSON boundary data.",
      "Display individual field polygons or markers on the map.",
      "Integrated drawing and editing tools for field boundaries directly on the map."
    ],
    linkToAppSection: "/map",
    linkText: "View Farm Map",
  },
];

export default function FeaturesPage() {
  return (
    <PublicPageLayout>
      <PageHeader
        title="AgriAssist Features"
        description="Discover the powerful tools AgriAssist offers to revolutionize your farm management."
        icon={Icons.ListChecksFeatures}
      />
      <div className="container mx-auto px-4 py-8 md:px-6 md:py-12">
        <div className="space-y-16">
          {featureDetails.map((feature, index) => (
            <section key={feature.title} className={`flex flex-col ${index % 2 === 0 ? 'md:flex-row' : 'md:flex-row-reverse'} items-center gap-8 md:gap-12 p-6 md:p-8 bg-card rounded-xl shadow-xl hover:shadow-2xl transition-shadow`}>
              <div className="md:w-1/2 relative aspect-video w-full h-auto overflow-hidden rounded-lg">
                {feature.imageUrl && (
                  <Image
                    src={feature.imageUrl}
                    alt={feature.imageAlt || feature.title}
                    layout="fill"
                    objectFit="cover"
                    className="rounded-lg"
                    data-ai-hint={feature.imageHint || feature.title.toLowerCase().replace(/\s+/g, ' ')}
                  />
                )}
              </div>
              <div className="md:w-1/2 space-y-4">
                <div className="flex items-center gap-3 mb-2">
                  <feature.icon className="w-10 h-10 text-primary" />
                  <h2 className="text-3xl font-bold tracking-tight text-foreground">{feature.title}</h2>
                </div>
                <p className="text-muted-foreground text-lg">{feature.description}</p>
                <ul className="space-y-2 list-disc list-inside text-muted-foreground">
                  {feature.details.map((detail, i) => (
                    <li key={i}>{detail}</li>
                  ))}
                </ul>
                {feature.linkToAppSection && feature.linkText && (
                   <Button asChild className="mt-4 shadow-md hover:shadow-lg transition-shadow">
                    <Link href={feature.linkToAppSection}>
                      <Icons.ChevronRight className="mr-2 h-4 w-4" />
                      {feature.linkText}
                    </Link>
                  </Button>
                )}
              </div>
            </section>
          ))}
        </div>

        <section className="text-center py-16 md:py-24">
          <h2 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">Ready to Transform Your Farm?</h2>
          <p className="mt-4 max-w-2xl mx-auto text-lg text-muted-foreground">
            AgriAssist provides the tools and insights you need for a more productive, efficient, and sustainable farming operation.
          </p>
          <div className="mt-8 flex justify-center gap-4">
            <Button size="lg" asChild className="shadow-lg hover:shadow-primary/30 transition-shadow">
              <Link href="/register">Get Started Free</Link>
            </Button>
            <Button size="lg" variant="outline" asChild className="shadow-lg hover:shadow-accent/30 transition-shadow">
              <Link href="/pricing">View Pricing Plans</Link>
            </Button>
          </div>
        </section>
      </div>
    </PublicPageLayout>
  );
}
