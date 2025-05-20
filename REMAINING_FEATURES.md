
# AgriAssist - Remaining Features & Enhancements Roadmap

This document tracks the major remaining features and potential enhancements for the AgriAssist platform, along with conceptual implementation steps and example LLM prompts.

## I. Staff Account Functionality - Finalizing & Securing:
1.  **Advanced Role-Based Permissions (Comprehensive Audit):**
    *   **Status:** Roles (`owner`, `admin`, `editor`, `viewer`) defined. UI for assignment/change by owner/admin is in place. Client-side UI elements in key areas are conditionally rendered/disabled. Firestore security rules have been updated.
    *   **Remaining:** A thorough audit of *every single interactive UI element and data operation* across all pages to ensure 100% compliance with the defined role permissions.
    *   **Implementation Steps:**
        1.  Systematically go through each page and interactive component.
        2.  For each, verify against role definitions.
        3.  Update client-side conditional rendering and Firestore Security Rules where needed.
        4.  Add tooltips to disabled elements explaining restrictions.
    *   **LLM Prompt Example:** "Review `SomeComponent.tsx`. Ensure action X is only available to 'owner' and 'admin' roles. User role is in `useAuth().user.roleOnCurrentFarm`."

## II. AI Farm Expert - Deeper Personalization & New Capabilities:
1.  **New AI-Powered Alerts/Suggestions (Automated Proactive AI):**
    *   **Status:** `proactiveFarmInsightsFlow` backend logic exists. A manual trigger on the dashboard now creates an in-app/email notification with improved messaging.
    *   **Remaining:** Develop a system for these AI insights (or other types like pest/disease warnings based on weather and crop stage) to be triggered *automatically* (e.g., on a schedule or based on specific data changes) and then use the notification system.
    *   **Implementation Steps (Conceptual for true automation):**
        1.  **Backend Scheduled Job:** Set up a Firebase Scheduled Function.
        2.  **Function Logic:** Periodically query active farms, run `proactiveFarmInsightsFlow`. If significant insights, call `/api/notifications/create`.
        3.  **Data Triggers (Advanced):** Use Firestore triggers for real-time analysis on data changes.
    *   **LLM Prompt Example:** "Design a Firebase Scheduled Function that daily calls `proactiveFarmInsightsFlow` for each farm. If insights are found, POST to `/api/notifications/create` with owner's UID, farm ID, type 'ai_proactive_alert', and insights summary."

## III. Core Farming Features - Expanding Capabilities:
1.  **Visual Field Mapping (Advanced - Interaction & Robustness):**
    *   **Status:** Users can define fields, input/draw/edit/delete GeoJSON boundaries within `FieldDefinitionForm`. Polygons display on `FarmMapView` with popups and zoom-on-click. Client-side GeoJSON validation improved.
    *   **Remaining:**
        *   More robust server-side GeoJSON validation.
        *   More interactive map features on `FarmMapView` (e.g., highlighting related logs).
    *   **Implementation Steps (More Interactive Map):**
        1.  In `FarmMapView.tsx`, on polygon click, fetch associated logs for that `field.id`.
        2.  Update popup content dynamically or open a modal with detailed field info and log links.
    *   **LLM Prompt Example:** "Modify `FarmMapView.tsx`. On GeoJSON polygon click, fetch last 3 planting logs and most recent soil test for that `field.id`. Display this in the popup."

2.  **Advanced Reporting & Data Export (Further Enhancements):**
    *   **Status:** Basic summary reports with filtering for financial overview (date range), crop yield (crop, field, date range), and task status (status, due date range, field) exist. Fertilizer usage report with field/date filters implemented.
    *   **Remaining:**
        *   More filtering options for *all* reports.
        *   New types of reports (e.g., input usage trends, cost analysis per crop, livestock reports, irrigation summaries).
        *   CSV/PDF export functionality.
    *   **Implementation Steps (New Report - Input Usage):**
        1.  In `reporting/page.tsx`, add card for "Farm Input Usage".
        2.  Fetch `farmInputs` logs. Aggregate by `inputName`, `inputType`, sum `quantity` per `quantityUnit`.
        3.  Filter by `inputType`, date range. Display in table.
    *   **Implementation Steps (CSV Export):**
        1.  Add "Export to CSV" button to a report card.
        2.  On click, convert filtered report data to CSV string. Trigger browser download.
    *   **LLM Prompt Example:** "Add 'Export to CSV' button to 'Crop Yield Summary' in `reporting/page.tsx`. On click, convert `filteredCropYields` to CSV and trigger download."

3.  **Using Stored Unit Preferences Throughout the App (Full Implementation):**
    *   **Status:** Users can save preferred area/weight units. Key displays (field size, total acreage, livestock weight) and form defaults respect these. Yield displays in reports and analytics attempt kg/lbs conversion. Fertilizer/irrigation/input forms use Select dropdowns for units.
    *   **Remaining:**
        *   Ensure *all other* relevant data displays (e.g., fertilizer/irrigation amounts in analytics/reports) consistently use/convert units (requires defining preferences for volume, application rates, etc.).
        *   Input conversion: Allow input in preferred unit, convert to standard storage unit if needed.
    *   **Implementation Steps (Fertilizer/Irrigation Analytics Units):**
        1.  Add user settings for preferred volume/rate units.
        2.  Update `AuthContext` and Settings page.
        3.  In `analytics/page.tsx`, for fertilizer/irrigation charts, attempt conversion or clearly label mixed units.
    *   **LLM Prompt Example:** "Modify `analytics/page.tsx`. If user has `preferredVolumeUnit` ('liters' or 'gallons'), attempt to convert logged irrigation amounts to this unit for display. Handle other units as separate series."

## IV. Broader Application Features & User Experience:
1.  **Automated & Farm-Specific Weather Integration & Alerts (Full Implementation - Server-Side Logic, More Conditions, User Configurable Thresholds):**
    *   **Status:** Dashboard weather uses farm lat/lon if set. Client-side alert checks with cooldown and location-aware messaging implemented.
    *   **Remaining:**
        *   Robust server-side logic for weather alert detection (e.g., using forecasts).
        *   User-configurable alert thresholds.
    *   **Implementation Steps (Server-side alert conceptual):**
        1.  Backend Scheduled Job (Firebase Scheduled Function).
        2.  Fetch weather forecast from API for each farm.
        3.  Compare against user-defined or default thresholds.
        4.  If alert condition met, call `/api/notifications/create`.
    *   **LLM Prompt Example (UI for user thresholds):**
        "On Settings page, add section 'Weather Alert Preferences'. Inputs for 'Frost Alert Temp (°C)' and 'Heavy Rain Threshold (mm in 24h)'. Save to user settings in Firestore."

2.  **Comprehensive Notification System (Triggering Logic for More Types & Automated Task Reminders):**
    *   **Status:** Framework for in-app/email notifications. Staff invites, AI Insights, and manual Task Reminders (with cooldown & specific link) trigger notifications. User preferences for AI Insights, Task Reminders, Weather Alerts, and Staff Activity emails are respected by the API. Specific Task Reminder email template created.
    *   **Remaining:**
        *   Automate Task Reminders (currently manual via button on dashboard). **(Marked for Backend Scheduled Job)**
        *   Implement triggering for weather alerts once the weather integration is more advanced (beyond current client-side checks).
        *   Potentially create more specific email templates for different notification types (e.g., for AI Insights, Weather Alerts).
    *   **Steps for True Automated Task Reminders (Future Backend Work):**
        1.  **Set up Firebase Scheduled Functions:** `firebase init functions`.
        2.  **Scheduled Function Logic:**
            *   Query `taskLogs` collection for all farms.
            *   For each farm, iterate tasks due "today" or "overdue".
            *   Check `lastReminderSentAt` (new field on task or separate log) to avoid spam.
            *   If reminder due, construct payload and make authenticated POST to `/api/notifications/create`.
        3.  **Task Document Update (Optional):** Add `lastReminderSentAt` timestamp field to `taskLogs`.
        4.  **User Preferences:** `/api/notifications/create` already respects these.
        5.  **Deployment & Monitoring.**
    *   **LLM Prompt Example (for API update for task reminders by backend):**
        "Modify `/api/notifications/create`. If a task reminder is triggered by an automated backend process (indicated by a special flag in the request body, e.g., `isSystemGenerated: true`), the API should update the corresponding `taskLogs` document in Firestore to set a `lastReminderSentAt: serverTimestamp()` field."

3.  **User Onboarding & Help System (Part 2 - Contextual Help).**
    *   **Status:** Multi-step onboarding modal for new users. Searchable FAQ page created. Basic contextual tooltips added in key areas (Dashboard Insights button, Field Definition map label).
    *   **Remaining:** More contextual help/tooltips throughout the application for specific features.
    *   **Implementation Steps:**
        1.  Identify complex UI elements or workflows.
        2.  Add `<Tooltip><TooltipTrigger><TooltipContent>` from ShadCN.
    *   **LLM Prompt Example:**
        "In `DataManagementContent.tsx`, add a Tooltip to each `TabsTrigger` that briefly explains what kind of data can be managed in that tab."

4.  **Enhanced Mobile Responsiveness & Offline Capabilities (Part 2 - Offline Support).**
    *   **Status:** Key pages have had mobile responsiveness refinements.
    *   **Remaining:** Full offline data entry and synchronization strategies.
    *   **Implementation Steps (Conceptual for basic offline view):**
        1.  Implement a service worker to cache static assets and app shell.
        2.  Cache read-only data in IndexedDB.
        3.  When offline, display cached data.
    *   **LLM Prompt Example (for service worker setup):**
        "Guide me through setting up a basic service worker in a Next.js application to cache static assets and the main app shell for basic offline availability."

5.  **Accessibility (A11y) Review & Enhancements.**
    *   **Status:** Standard components provide a good baseline.
    *   **Remaining:** Conduct a thorough A11y audit for all custom components and complex views.
    *   **Implementation Steps:**
        1.  Use browser developer tools and tools like Axe DevTools.
        2.  Ensure keyboard navigability and focus.
        3.  Add appropriate ARIA attributes.
    *   **LLM Prompt Example:**
        "Review the `AppNotifications.tsx` component. What ARIA attributes should be added to improve accessibility?"

6.  **Performance Optimization for Large Datasets.**
    *   **Status:** Client-side pagination added to `FieldDefinitionTable`.
    *   **Remaining:** Implement server-side pagination for tables with potentially very large datasets (e.g., logs), implement virtualized lists where appropriate, optimize Firestore queries (indexing reviews), and consider data denormalization strategies.
    *   **Implementation Steps (Server-Side Table Pagination for `PlantingLogTable.tsx`):**
        1.  Modify `fetchPlantingLogs` to use Firestore query cursors (`startAfter`, `limit`).
        2.  Add UI controls for "Next Page", "Previous Page" that trigger re-fetch with new cursor.
        3.  Manage loading states.
    *   **LLM Prompt Example:**
        "Modify `PlantingLogTable.tsx` and its data fetching logic to implement server-side pagination using Firestore query cursors. Display 10 logs per page. Include 'Previous' and 'Next' buttons."
```