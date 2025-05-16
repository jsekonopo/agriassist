"use client";

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { mainNavItems, settingsNavItem } from '@/lib/navigation';
import { cn } from '@/lib/utils';
import { Icons } from '@/components/icons';
import {
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarFooter,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarTrigger,
} from '@/components/ui/sidebar';
import { Button } from '@/components/ui/button';

export function AppSidebar() {
  const pathname = usePathname();

  return (
    <Sidebar collapsible="icon" variant="sidebar" side="left">
      <SidebarHeader className="p-4 flex items-center gap-2">
        <Link href="/dashboard" className="flex items-center gap-2">
          <Icons.Logo className="h-8 w-8 text-sidebar-primary" />
          <h1 className="text-xl font-semibold text-sidebar-foreground group-data-[collapsible=icon]:hidden">
            AgriAssist
          </h1>
        </Link>
      </SidebarHeader>
      <SidebarContent className="flex-grow">
        <SidebarMenu>
          {mainNavItems.map((item) => (
            <SidebarMenuItem key={item.href}>
              <Link href={item.href} legacyBehavior passHref>
                <SidebarMenuButton
                  asChild
                  isActive={pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href))}
                  tooltip={{ children: item.title, className: "bg-accent text-accent-foreground" }}
                  className={cn(
                    "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                    (pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href))) && "bg-sidebar-primary text-sidebar-primary-foreground hover:bg-sidebar-primary/90"
                  )}
                >
                  <a>
                    <item.icon className="h-5 w-5" />
                    <span className="group-data-[collapsible=icon]:hidden">{item.title}</span>
                  </a>
                </SidebarMenuButton>
              </Link>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarContent>
      <SidebarFooter className="p-2">
         <SidebarMenu>
            <SidebarMenuItem>
                 <SidebarMenuButton 
                    asChild
                    disabled={settingsNavItem.disabled}
                    tooltip={{ children: settingsNavItem.title, className: "bg-accent text-accent-foreground" }}
                    className={cn(
                        "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                         settingsNavItem.disabled && "opacity-50 cursor-not-allowed"
                    )}
                 >
                    <Link href={settingsNavItem.disabled ? "#" : settingsNavItem.href}>
                        <settingsNavItem.icon className="h-5 w-5" />
                        <span className="group-data-[collapsible=icon]:hidden">{settingsNavItem.title}</span>
                    </Link>
                </SidebarMenuButton>
            </SidebarMenuItem>
         </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
