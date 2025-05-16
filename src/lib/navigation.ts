import type { LucideIcon } from 'lucide-react';
import { LayoutDashboard, Database, BarChart3, BrainCircuit, Leaf, Wheat, Layers3, CloudSun, Settings, FileText } from 'lucide-react';
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
    icon: Icons.Reporting, // Use the new Reporting icon
  },
];

export const dataManagementIcons = {
  planting: Leaf,
  harvesting: Wheat,
  soil: Layers3,
  weather: CloudSun,
};

export const settingsNavItem: NavItem = {
  title: 'Settings',
  href: '/settings', 
  icon: Settings,
  disabled: true, 
};
