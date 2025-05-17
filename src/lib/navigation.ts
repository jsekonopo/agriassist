
import type { LucideIcon } from 'lucide-react';
import { Settings, Map } from 'lucide-react';
import { Icons } from '@/components/icons'; 

export interface NavItem {
  title: string;
  href: string;
  icon: LucideIcon;
  label?: string;
  disabled?: boolean;
  isPublicPage?: boolean; // To differentiate public marketing pages if needed for sidebar
}

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
  // Public facing pages also added here for now, could be separated later
  {
    title: 'Features',
    href: '/features',
    icon: Icons.ListChecks, // Using ListChecks for features
    isPublicPage: true,
  },
  {
    title: 'Pricing', 
    href: '/pricing',
    icon: Icons.Dollar, 
    isPublicPage: true,
  },
  {
    title: 'About Us',
    href: '/about',
    icon: Icons.Users, // Using Users for About Us
    isPublicPage: true,
  },
  {
    title: 'Contact',
    href: '/contact',
    icon: Icons.Mail, // Using Mail for Contact
    isPublicPage: true,
  },
];

export const settingsNavItem: NavItem = {
  title: 'Settings',
  href: '/settings', 
  icon: Settings,
  disabled: false, 
};

    