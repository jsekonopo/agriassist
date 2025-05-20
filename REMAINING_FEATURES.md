
# AgriAssist - Remaining Features & Enhancements Roadmap

This document tracks the major remaining features and potential enhancements for the AgriAssist platform.

## I. Staff Account Functionality - Finalizing & Securing:
1.  **Advanced Role-Based Permissions (Comprehensive Audit):**
    *   **Status:** Roles (`owner`, `admin`, `editor`, `viewer`) defined. UI for assignment/change by owner/admin is in place. Client-side UI elements in key areas are conditionally rendered/disabled. Firestore security rules have been updated.
    *   **Remaining:** A thorough audit of *every single interactive UI element and data operation* across all pages to ensure 100% compliance with the defined role permissions.

## II. AI Farm Expert - Deeper Personalization & New Capabilities:
1.  **New AI-Powered Alerts/Suggestions (Automated Proactive AI):**
    *   **Status:** `proactiveFarmInsightsFlow` backend logic exists. A manual trigger on the dashboard now creates an in-app/email notification.
    *   **Remaining:** Develop a system for these AI insights (or other types like pest/disease warnings based on weather and crop stage) to be triggered *automatically* (e.g., on a schedule or based on specific data changes) and then use the notification system.

## III. Core Farming Features - Expanding Capabilities:
1.  **Visual Field Mapping (Advanced - Interaction & Robustness):**
    *   **Status:** Users can define fields, input/draw/edit/delete GeoJSON boundaries within the `FieldDefinitionForm`, and these are displayed as polygons on the main map with informative popups. Client-side GeoJSON validation improved; map zooms to clicked field.
    *   **Remaining:**
        *   More robust server-side GeoJSON validation if direct pasting of GeoJSON were re-enabled.
        *   More interactive map features on the `FarmMapView` (e.g., highlighting related logs on field click).
2.  **Advanced Reporting & Data Export (Further Enhancements):**
    *   **Status:** Basic summary reports with filtering options for financial overview (date range), crop yield (crop, field, date range), and task status (status, due date range, field) exist. Fertilizer usage report with field/date filters implemented.
    *   **Remaining:**
        *   More filtering options for *all* reports.
        *   New types of reports (e.g., input usage trends per field, cost analysis per crop, detailed livestock reports, irrigation summaries per field/crop).
        *   Functionality to export data and reports (e.g., to CSV, PDF).
3.  **Using Stored Unit Preferences Throughout the App (Full Implementation):**
    *   **Status:** Users can save preferred area/weight units. Display of field sizes, total acreage, and livestock weights respects these preferences. Input forms for field area, weight logs, farm inputs, fertilizer, and irrigation now use `Select` dropdowns for units and/or default to user preferences where applicable. **Yield displays in reports and analytics attempt conversion for kg/lbs to preferred weight unit.**
    *   **Remaining:**
        *   Ensure *all other* relevant data displays (e.g., in fertilizer/irrigation analytics charts, other reports) consistently use or convert to the user's preferred units (this requires defining preferences for volume, application rates, etc.).
        *   For data *input* in forms like Farm Inputs, Fertilizer, Irrigation: currently, the selected unit is stored. Consider if conversion to a standard storage unit is needed, with display conversion back to preferred units.

## IV. Broader Application Features & User Experience:
1.  **Automated & Farm-Specific Weather Integration & Alerts (Actual Alerts):**
    *   **Status:** Dashboard weather uses farm lat/lon if set by owner via profile. Client-side alert checks with cooldown implemented.
    *   **Remaining:** Implement more sophisticated server-side logic for weather alert detection (e.g., using forecasts). User-configurable alert thresholds.
2.  **Comprehensive Notification System (Triggering Logic for More Types & Automated Task Reminders):**
    *   **Status:** Framework for in-app/email notifications is in place. Staff invites, AI Insights, and manual Task Reminders (via dashboard button with cooldown) can trigger notifications. User preferences for AI Insights, Task Reminders, Weather Alerts, and Staff Activity emails are respected by the API. A specific Task Reminder email template has been created.
    *   **Remaining:**
        *   Automate Task Reminders (currently manual via button on dashboard). This would ideally involve a backend scheduled job (e.g., Firebase Scheduled Function querying tasks and calling `/api/notifications/create`).
        *   Implement triggering for weather alerts once the weather integration is more advanced (beyond current client-side checks).
        *   Potentially create more specific email templates for different notification types (e.g., for AI Insights, Weather Alerts).
3.  **User Onboarding & Help System (Part 2 - Contextual Help/FAQ):**
    *   **Status:** Multi-step onboarding modal for new users. Searchable FAQ page created. Basic contextual tooltips added in key areas.
    *   **Remaining:** More contextual help/tooltips throughout the application for specific features.
4.  **Enhanced Mobile Responsiveness & Offline Capabilities (Part 2 - Offline Support).**
    *   **Status:** Key pages have had mobile responsiveness refinements.
    *   **Remaining:** Full offline data entry and synchronization strategies.
5.  **Accessibility (A11y) Review & Enhancements.**
    *   **Status:** Standard components provide a good baseline.
6.  **Performance Optimization for Large Datasets.**
    *   **Status:** Not explicitly addressed.

**Steps for True Automated Task Reminders (Future Backend Work):**

1.  **Set up Firebase Scheduled Functions:**
    *   Initialize Firebase Functions in your project if not already done (`firebase init functions`).
    *   Write a scheduled function (e.g., to run once daily).
2.  **Scheduled Function Logic:**
    *   The function would query the `taskLogs` collection in Firestore for all farms.
    *   For each farm, it would iterate through tasks that are:
        *   Due "today" (or within a configurable window, e.g., next 24-48 hours).
        *   Overdue (e.g., past due date but not older than X days).
    *   For each such task, check if a reminder was recently sent (e.g., by looking at a `lastReminderSentAt` timestamp on the task document or in a separate `taskRemindersLog` collection to avoid spamming).
    *   If a reminder is due, construct the notification payload (user ID of task assignee or farm owner, farm ID, type 'task_reminder', title, message, link).
    *   Make an authenticated HTTP POST request from the Cloud Function to your `/api/notifications/create` endpoint to create the in-app notification and trigger the email (if preferences allow). This is better than directly writing to Firestore and sending email from the Cloud Function to keep your notification logic centralized in the API route. The Cloud Function would need appropriate service account permissions or a way to authenticate as a "system" user to call your API.
3.  **Task Document Update (Optional):**
    *   Consider adding a `lastReminderSentAt` timestamp field to `taskLogs` documents, updated by the scheduled function, to manage reminder frequency.
4.  **User Preferences:** The existing `taskRemindersEmail` preference would continue to be respected by the `/api/notifications/create` API.
5.  **Deployment & Monitoring:** Deploy the scheduled function and monitor its execution and logs.
