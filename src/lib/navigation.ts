
import type { LucideIcon } from 'lucide-react';
import { Settings, Map } from 'lucide-react';
import { Icons } from '@/components/icons'; 

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
    title: 'Livestock', // New Livestock Item
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
