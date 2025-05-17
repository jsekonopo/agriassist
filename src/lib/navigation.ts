
import type { LucideIcon } from 'lucide-react';
import { Settings, Map } from 'lucide-react';
import { Icons } from '@/components/icons'; 

export interface NavItem {
  title: string;
  href: string;
  icon: LucideIcon;
  label?: string;
  disabled?: boolean;
  isPublicPage?: boolean; 
}

// Navigation items for the authenticated application sidebar
export const mainNavItems: NavItem[] = [
  {
    title: 'Dashboard',
    href: '/dashboard',
    icon: Icons.Dashboard,
  },
  {
    title: 'Farm Map',
    href: '/map',
    icon: Icons.Map,
  },
  {
    title: 'Data Management',
    href: '/data-management',
    icon: Icons.DataManagement,
  },
  {
    title: 'Livestock',
    href: '/livestock',
    icon: Icons.Livestock,
  },
  {
    title: 'Analytics',
    href: '/analytics',
    icon: Icons.Analytics,
  },
  {
    title: 'AI Farm Expert',
    href: '/ai-expert',
    icon: Icons.AIExpert,
  },
  {
    title: 'Reporting',
    href: '/reporting',
    icon: Icons.Reporting, 
  },
];

// Navigation items for the public-facing site header and footer
export const publicNavItems: NavItem[] = [
  {
    title: 'Features',
    href: '/features',
    icon: Icons.ListChecksFeatures, // Assuming this icon exists and is appropriate
  },
  {
    title: 'Pricing', 
    href: '/pricing',
    icon: Icons.Dollar, 
  },
  {
    title: 'About Us',
    href: '/about',
    icon: Icons.Users, 
  },
  {
    title: 'Contact',
    href: '/contact',
    icon: Icons.Mail, 
  },
];


export const settingsNavItem: NavItem = {
  title: 'Settings',
  href: '/settings', 
  icon: Settings,
  disabled: false, 
};
