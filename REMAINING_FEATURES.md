
# AgriAssist - Remaining Features & Enhancements Roadmap

This document tracks the major remaining features and potential enhancements for the AgriAssist platform.

## I. Staff Account Functionality - Finalizing & Securing:
1.  **Advanced Role-Based Permissions (Comprehensive Audit): COMPLETED**
    *   **Status:** Roles (`owner`, `admin`, `editor`, `viewer`) defined. UI for assignment/change by owner/admin is in place. Client-side UI elements in key areas are conditionally rendered/disabled. Firestore security rules have been updated.
    *   **Remaining (Iterative Refinement):** While core logic is in place, a continuous audit of all UI elements and data operations for edge cases or newly added features against role permissions is good practice.

## II. AI Farm Expert - Deeper Personalization & New Capabilities:

1.  **New AI-Powered Alerts/Suggestions (Automated Proactive AI):**
    *   **Current Status:** `proactiveFarmInsightsFlow` backend logic exists. A manual trigger on the dashboard now creates an in-app/email notification.
    *   **Remaining:** Develop a system for these AI insights (or other types like pest/disease warnings based on weather and crop stage) to be triggered *automatically* (e.g., on a schedule or based on specific data changes) and then use the notification system.

## III. Core Farming Features - Expanding Capabilities:

1.  **Visual Field Mapping (Advanced - Interaction & Robustness):**
    *   **Current Status:** Users can define fields, input/draw/edit/delete GeoJSON boundaries within the `FieldDefinitionForm`, and these are displayed as polygons on the main map with informative popups. Basic click-to-zoom interaction added. GeoJSON validation in the form improved.
    *   **Remaining:**
        *   More robust server-side GeoJSON validation if direct pasting of GeoJSON were re-enabled.
        *   More interactive map features on the `FarmMapView` (e.g., highlighting related logs on field click).
2.  **Advanced Reporting & Data Export (Further Enhancements):**
    *   **Current Status:** Basic summary reports with filtering options for financial overview, crop yield, and task status exist.
    *   **Remaining:**
        *   More filtering options for *all* reports.
        *   New types of reports (e.g., input usage trends per field, cost analysis per crop, detailed livestock reports, fertilizer/irrigation summaries per field/crop).
        *   Functionality to export data and reports (e.g., to CSV, PDF).
3.  **Using Stored Unit Preferences Throughout the App (Full Implementation):**
    *   **Current Status:** Users can save preferred area/weight units. Display of field sizes, total acreage, and livestock weights respects these preferences. Input forms for field area, weight logs, farm inputs, fertilizer, and irrigation now use `Select` dropdowns for units and/or default to user preferences where applicable.
    *   **Remaining:**
        *   Ensure *all* relevant data displays (e.g., in *all* analytics charts, *all* reports) consistently use or convert to the user's preferred units.
        *   For data *input* in forms like Farm Inputs, Fertilizer, Irrigation: currently, the selected unit is stored. Consider if conversion to a standard storage unit is needed, with display conversion back to preferred units.

## IV. Broader Application Features & User Experience:

1.  **Automated & Farm-Specific Weather Integration & Alerts (Actual Alerts): COMPLETED (Client-side alert checks with cooldown implemented)**
    *   **Status:** Dashboard weather uses farm lat/lon if set by owner via profile. Client-side logic can trigger a weather alert notification. A cooldown mechanism prevents repeated alerts for the same condition.
    *   **Remaining (Iterative Refinement):** More sophisticated server-side alert logic (e.g., using forecasts, multiple weather parameters). User-configurable alert thresholds.
2.  **Comprehensive Notification System (Triggering Logic for More Types & Automated Task Reminders):**
    *   **Current Status:** Framework for in-app/email notifications is in place. Staff invites, AI Insights, and manual Task Reminders (via dashboard button) can trigger notifications. User preferences for AI Insights, Task Reminders, Weather Alerts, and Staff Activity emails are respected by the API.
    *   **Remaining:**
        *   Automate Task Reminders (currently manual via button on dashboard). This would ideally involve a backend scheduled job.
        *   Implement triggering for weather alerts once the weather integration is more advanced (beyond current client-side checks).
        *   Potentially create more specific email templates for different notification types.
3.  **User Onboarding & Help System (Part 2 - Contextual Help/FAQ):**
    *   **Current Status:** Multi-step onboarding modal for new users. Searchable FAQ page created.
    *   **Remaining:** Contextual help/tooltips for specific features within the app.
4.  **Enhanced Mobile Responsiveness & Offline Capabilities (Part 2 - Offline Support).**
    *   **Current Status:** Key pages have had mobile responsiveness refinements.
    *   **Remaining:** Full offline data entry and synchronization strategies.
5.  **Accessibility (A11y) Review & Enhancements.**
    *   **Status:** Standard components provide a good baseline.
6.  **Performance Optimization for Large Datasets.**
    *   **Status:** Not explicitly addressed.

