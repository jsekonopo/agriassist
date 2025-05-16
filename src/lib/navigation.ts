import type { LucideIcon } from 'lucide-react';
import { LayoutDashboard, Database, BarChart3, BrainCircuit, Leaf, Wheat, Layers3, CloudSun, Settings } from 'lucide-react';

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
    icon: LayoutDashboard,
  },
  {
    title: 'Data Management',
    href: '/data-management',
    icon: Database,
  },
  {
    title: 'Analytics',
    href: '/analytics',
    icon: BarChart3,
  },
  {
    title: 'AI Farm Expert',
    href: '/ai-expert',
    icon: BrainCircuit,
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
  href: '/settings', // Example, not implemented yet
  icon: Settings,
  disabled: true, // Mark as disabled if not implemented
};
