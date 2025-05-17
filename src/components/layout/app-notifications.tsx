
"use client";

import { useState, useEffect } from 'react';
import { useAuth, type AppNotification } from '@/contexts/auth-context';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuGroup,
} from "@/components/ui/dropdown-menu";
import { Badge } from '@/components/ui/badge';
import { Icons } from '@/components/icons';
import { ScrollArea } from '@/components/ui/scroll-area';
import Link from 'next/link';
import { formatDistanceToNowStrict } from 'date-fns';
import { cn } from '@/lib/utils';

const MAX_NOTIFICATIONS_DISPLAY = 7; 

const getNotificationIcon = (type: string): React.ElementType => {
  switch (type?.toLowerCase()) {
    case 'task_reminder':
      return Icons.ClipboardList;
    case 'ai_insight':
    case 'proactive_insight': // Added for proactive insights
      return Icons.BrainCircuit;
    case 'weather_alert':
      return Icons.Weather;
    case 'staff_invite_accepted': // Example for future staff activity
      return Icons.User;
    default:
      return Icons.Info; // Default icon
  }
};


export function AppNotifications() {
  const { 
    notifications, 
    unreadNotificationCount, 
    markNotificationAsRead, 
    markAllNotificationsAsRead,
    fetchNotifications 
  } = useAuth();
  const [isOpen, setIsOpen] = useState(false);

  const sortedNotifications = [...notifications].sort((a, b) => {
    if (a.isRead !== b.isRead) {
      return a.isRead ? 1 : -1; 
    }
    // Ensure createdAt is a Date object for comparison; Firestore Timestamps need .toDate()
    const dateA = a.createdAt?.toDate ? a.createdAt.toDate() : new Date(0);
    const dateB = b.createdAt?.toDate ? b.createdAt.toDate() : new Date(0);
    return dateB.getTime() - dateA.getTime();
  });

  const handleMarkAsRead = async (e: React.MouseEvent, notificationId: string) => {
    e.stopPropagation(); 
    await markNotificationAsRead(notificationId);
  };
  
  const handleMarkAllAsRead = async (e: React.MouseEvent) => {
    e.stopPropagation();
    await markAllNotificationsAsRead();
  };

  useEffect(() => {
    if (isOpen) {
      fetchNotifications();
    }
  }, [isOpen, fetchNotifications]);


  return (
    <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative rounded-full">
          <Icons.Bell className="h-5 w-5" />
          {unreadNotificationCount > 0 && (
            <Badge 
              variant="destructive" 
              className="absolute -top-1 -right-1 h-4 w-4 min-w-4 p-0 flex items-center justify-center text-xs rounded-full"
            >
              {unreadNotificationCount > 9 ? '9+' : unreadNotificationCount}
            </Badge>
          )}
          <span className="sr-only">Toggle notifications</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 md:w-96 p-0">
        <DropdownMenuLabel className="p-3 pb-2 flex justify-between items-center">
          <span className="font-semibold">Notifications</span>
          {unreadNotificationCount > 0 && (
            <Button 
              variant="link" 
              size="sm" 
              className="text-xs p-0 h-auto"
              onClick={handleMarkAllAsRead}
            >
              Mark all as read
            </Button>
          )}
        </DropdownMenuLabel>
        <DropdownMenuSeparator className="my-0" />
        <ScrollArea className="h-[300px] md:h-[350px]">
          {sortedNotifications.length === 0 ? (
            <div className="p-4 text-center text-sm text-muted-foreground">
              No new notifications.
            </div>
          ) : (
            <DropdownMenuGroup>
              {sortedNotifications.slice(0, MAX_NOTIFICATIONS_DISPLAY).map((notif) => {
                const IconComponent = getNotificationIcon(notif.type);
                return (
                  <DropdownMenuItem 
                    key={notif.id} 
                    className={cn(
                      "flex flex-col items-start gap-1 p-3 cursor-pointer hover:bg-accent focus:bg-accent data-[disabled]:pointer-events-auto data-[disabled]:opacity-100", 
                      !notif.isRead && "bg-primary/10 hover:bg-primary/20 focus:bg-primary/20"
                    )}
                    onSelect={(e) => e.preventDefault()} 
                  >
                    <div className="w-full flex justify-between items-center">
                      <div className="flex items-center gap-2">
                        <IconComponent className={cn("h-4 w-4", !notif.isRead ? "text-primary" : "text-muted-foreground")} />
                        <span className={cn("font-medium text-sm", !notif.isRead && "text-primary")}>{notif.title}</span>
                      </div>
                      {!notif.isRead && (
                         <Button 
                            variant="ghost" 
                            size="sm" 
                            className="text-xs p-0 h-auto hover:bg-transparent text-primary/80 hover:text-primary"
                            onClick={(e) => handleMarkAsRead(e, notif.id)}
                          >
                            Mark read
                          </Button>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground leading-snug line-clamp-2 pl-6">{notif.message}</p>
                    <div className="w-full flex justify-between items-center mt-1 pl-6">
                      <span className="text-xs text-muted-foreground/80">
                        {notif.createdAt?.toDate ? formatDistanceToNowStrict(notif.createdAt.toDate(), { addSuffix: true }) : 'Just now'}
                      </span>
                      {notif.link && (
                        <Link href={notif.link} passHref legacyBehavior>
                          <a 
                            className="text-xs text-primary hover:underline"
                            onClick={(e) => { e.stopPropagation(); setIsOpen(false); if (!notif.isRead) markNotificationAsRead(notif.id);}}
                          >
                            View Details
                          </a>
                        </Link>
                      )}
                    </div>
                  </DropdownMenuItem>
                );
              })}
            </DropdownMenuGroup>
          )}
        </ScrollArea>
        {notifications.length > MAX_NOTIFICATIONS_DISPLAY && (
            <>
              <DropdownMenuSeparator className="my-0"/>
              <DropdownMenuItem className="justify-center p-2 text-xs text-muted-foreground hover:bg-accent focus:bg-accent cursor-not-allowed">
                Older notifications not shown
              </DropdownMenuItem>
            </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
