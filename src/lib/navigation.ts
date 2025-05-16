
import type { LucideIcon } from 'lucide-react';
import { Settings, Map } from 'lucide-react'; // Added Map
import { Icons } from '@/components/icons'; // Import Icons object

export interface NavItem {
  title: string;
  href: string;
  icon: LucideIcon;
  label?: string;
  disabled?: boolean;
}

export const mainNavItems: NavItem[] = [
  {
    title: 'Dashboard',
    href: '/dashboard',
    icon: Icons.Dashboard,
  },
  {
    title: 'Farm Map', // New Map Item
    href: '/map',
    icon: Icons.Map, // Using the new Map icon
  },
  {
    title: 'Data Management',
    href: '/data-management',
    icon: Icons.DataManagement,
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
  {
    title: 'Pricing', 
    href: '/pricing',
    icon: Icons.Dollar, 
  },
];

export const settingsNavItem: NavItem = {
  title: 'Settings',
  href: '/settings', 
  icon: Settings,
  disabled: false, 
};
