<<<<<<< Updated upstream
You've made a very sharp observation, and your critique is spot on.

Let's break down how the implementation of the plan went.

### How the Implementation Went: A "Technically Correct" but Flawed Result

Functionally and structurally, the AI agent did an excellent job. It successfully followed the plan to the letter:

*   **Correct Architecture:** The monorepo structure with `src/backend` and `src/frontend` is in place.
*   **Functional Components:** All the planned Vue components (`TaskCard`, `LogViewer`, `PipelineSteps`, etc.) were created.
*   **Working State Management:** The Pinia store is correctly set up to manage state.
*   **API and Routing:** The backend API routes were created, and the frontend router connects the views.

**In short, the agent built a perfect "skeleton" of the application. The code is structured correctly, and the pieces are in the right places.**

However, your critique reveals the critical missing piece: **UI/UX design and layout.** The agent successfully created the building blocks but assembled them using Vuetify's default, spacious settings, which are optimized for general-purpose applications, not for a dense, information-rich developer dashboard.

You are absolutely right: **we lost the information density and thoughtful layout of the original EJS version.** The current implementation prioritizes showing one thing at a time in large containers, which is not suitable for this tool.

---

### A New Plan for UI/UX Refinement

Your feedback is the perfect starting point for the next phase. We don't need to undo the refactoring; we need to build on top of it by applying layout, density adjustments, and custom styling.

Here is a new `PLAN.md` that focuses exclusively on fixing the UI and restoring the information-dense layout you liked.

***

# PLAN.MD: UI/UX Refinement and Information Density

## Title & Goal

**Title:** Refine Dashboard UI for Information Density and Professional Polish

**Goal:** To refactor the existing Vue components and views to match the information density and usability of the original EJS dashboard, with a focus on layout, compactness, and a professional aesthetic.

---

## Description

The Vue 3 application is functionally sound but lacks the specific UI/UX required for a developer-centric dashboard. The current layout uses default Vuetify components, resulting in excessive white space, low information density, and a layout on the Live Activity page that is not fit for purpose.

This plan will address these issues by:
1.  Switching list views from individual cards to dense data tables.
2.  Re-implementing the Live Activity page with a proper sidebar/main content layout.
3.  Styling the log viewer to look and feel like a proper terminal.
4.  Applying global density settings and custom CSS to reduce wasted space and improve the overall visual hierarchy.
=======


# FINAL PLAN.MD: Replicating the High-Density UI

## The Golden Rule: The Screenshots are the Law

The single, non-negotiable goal is to make the Vue application a pixel-perfect recreation of the provided screenshots. Your primary task is to use Vuetify and custom CSS to match this design precisely. the screenshots provided are in the /examples directory.

**For every implementation step, you must:**

1.  **Implement the changes with a focus on visual replication.**
2.  Run the verification script to launch the dashboard with mock data.
3.  Use Playwright MCP to take a screenshot of the page being worked on.
4.  **Visually compare its screenshot to the corresponding golden image.**
5.  **Use its judgment to identify and fix *any* visual discrepancies**, including spacing, font sizes, component choices, borders, and colors, until its output is a faithful reproduction of the target design.
6.  **Pay attention to details** Make sure that the page is responsive, that text doesn't get truncated in weird ways, that the color contrasts are OK (no white text on light backgrounds), etc.
>>>>>>> Stashed changes

---

## Summary Checklist

<<<<<<< Updated upstream
-   [x] **1. Refactor History View for Density:** Replace the vertical list of `<TaskCard>` and `<SequenceCard>` components with information-dense Vuetify data tables.
-   [x] **2. Re-architect the Live Activity View Layout:** Change the single-column layout to a two-column layout with a fixed sidebar for context and a primary, large area for the live log viewer.
-   [x] **3. Enhance the Log Viewer Component:** Style the log viewer to resemble a terminal and add real-time auto-scrolling functionality.
-   [x] **4. Apply Global Compact Styling:** Use Vuetify's `density` prop and targeted CSS to make all components (cards, lists, chips) smaller and more compact.

**Status: ✅ COMPLETED** - All UI/UX refinement tasks have been successfully implemented.
=======
-   [ ] **1. Implement the History View:** Replicate the clean, table-based layout for listing runs.
-   [ ] **2. Implement the Sequence Detail View:** Build the multi-section layout with detailed information cards and a list of tasks.
-   [ ] **3. Implement the Task Detail View:** Build the view for a single task, showing its pipeline steps and the main log viewer.
-   [ ] **4. Implement the Live Activity View:** Create the two-column layout with a compact sidebar and a dominant, full-height log viewer.
-   [ ] **5. Final Polish and Consistency Review:** Ensure all pages share a consistent, polished, and professional aesthetic.
>>>>>>> Stashed changes

---

## Detailed Implementation Steps

<<<<<<< Updated upstream
### 1. Refactor History View for Density

*   **Objective:** To display more tasks and sequences on a single screen without scrolling, mimicking the efficiency of the old table-based layout.
*   **File to Modify:** `src/frontend/src/views/HistoryView.vue`
*   **Existing Components to Modify/Remove:** The use of `TaskCard.vue` and `SequenceCard.vue` on this page will be **removed** in favor of tables.
*   **Implementation:**
    1.  In `HistoryView.vue`, remove the `v-for` loops that render the card components.
    2.  Use the **`<v-data-table>`** component from Vuetify for both "Recent Sequences" and "Recent Standalone Tasks".
    3.  **For the Tasks table**, define columns for: Status (using the `<StatusBadge>` component inside the table cell), Task ID, Pipeline, Duration, and Last Update.
    4.  **For the Sequences table**, define columns for: Status, Sequence ID, Folder Path, and Duration.
    5.  Make each row clickable, navigating to the respective detail page.
*   **Acceptance Criteria (for Playwright MCP):**
    *   The `/history` page now displays two tables instead of two columns of large cards.
    *   The tables are compact, showing multiple runs without requiring immediate scrolling.
    *   The "Status" column in the tables correctly renders the colorful `StatusBadge` component.

### 2. Re-architect the Live Activity View Layout

*   **Objective:** To prioritize the log viewer, making it the central focus of the page while keeping contextual information accessible in a sidebar.
*   **File to Modify:** `src/frontend/src/views/LiveActivityView.vue`
*   **Existing Components to Use:** `PipelineSteps.vue`, `LogViewer.vue`
*   **Implementation:**
    1.  Wrap the entire page content in a **`<v-row>`**.
    2.  **Create a Sidebar Column:**
        *   Use a **`<v-col cols="12" md="4">`**. This column will take up the full width on small screens and 1/3 of the width on medium-and-up screens.
        *   Place the `Task/Sequence Info` card and the **`<PipelineSteps>`** component inside this column.
    3.  **Create a Main Content Column:**
        *   Use a **`<v-col cols="12" md="8">`**. This will take up the remaining 2/3 of the width on larger screens.
        *   Place the **`<LogViewer>`** component as the *only* item in this column.
*   **Code Snippet (`LiveActivityView.vue`):**
    ```vue
    <template>
      <v-container fluid>
        <v-row>
          <!-- Sidebar Column -->
          <v-col cols="12" md="4">
            <v-card class="mb-4"> <!-- Task Info Card --> </v-card>
            <PipelineSteps :steps="liveTask.steps" />
          </v-col>

          <!-- Main Log Viewer Column -->
          <v-col cols="12" md="8">
            <LogViewer :is-live="true" />
          </v-col>
        </v-row>
      </v-container>
    </template>
    ```
*   **Acceptance Criteria (for Playwright MCP):**
    *   On a desktop-sized screen, the Live Activity page has a narrow column on the left containing the task details and pipeline steps.
    *   A large column on the right takes up the majority of the screen space and contains the log viewer.

### 3. Enhance the Log Viewer Component

*   **Objective:** To make the log viewer more functional and visually appropriate for displaying raw log data.
*   **File to Modify:** `src/frontend/src/components/LogViewer.vue`
*   **Implementation:**
    1.  **Terminal-like Styling:** Modify the CSS to make the log viewer look like a terminal. Use a dark background, a monospace font, and remove the card's box-shadow.
    2.  **Auto-Scrolling:** Add logic to automatically scroll the log content to the bottom as new lines are added in live mode. This can be done using a `watch` on the log content and then setting `element.scrollTop = element.scrollHeight`.
    3.  **Colorization:** Implement a function that takes a log line as input and wraps specific keywords (like `[ASSISTANT]`, `[TOOL_USE]`, `[ERROR]`) in `<span>` tags with different colors, similar to the old EJS version's `colorizeLogLine` function.
*   **Acceptance Criteria (for Playwright MCP):**
    *   The log viewer on both the Live and Detail pages has a dark background and uses a monospace font.
    *   On the Live Activity page, as new logs stream in, the view automatically scrolls to show the latest lines.
    *   Keywords like `[ASSISTANT]` are colored blue, and `[TOOL_USE]` is colored yellow.

### 4. Apply Global Compact Styling

*   **Objective:** To reduce the overall "chunkiness" of the UI and increase information density across the entire application.
*   **Files to Modify:** All View and Component `.vue` files.
*   **Implementation:**
    1.  **Use `density` Prop:** Go through all Vuetify components (`v-card`, `v-list`, `v-chip`, `v-btn`, etc.) and add the `density="compact"` prop. This is a built-in Vuetify feature to reduce padding and margins.
    2.  **Reduce Card Padding:** For `v-card` components that still feel too large, use helper classes like `pa-2` (padding all sides) instead of the default.
    3.  **Adjust Typography:** Change large titles from `text-h4` to `text-h5` or `text-h6` where appropriate to save vertical space.
*   **Acceptance Criteria (for Playwright MCP):**
    *   The cards on the detail pages are visibly smaller and have less internal padding.
    *   Buttons and chips throughout the application are smaller.
    *   Overall, the UI feels tighter and more professional, allowing more information to be displayed on the screen at once.
=======
### 1. Implement the History View (`/history`)

*   **Objective:** To replace the clunky card list with the clean, information-dense tables shown in the screenshot.
*   **Example Screenshot:** `examples/history.png`
*   **File to Modify:** `src/frontend/src/views/HistoryView.vue`
*   **Implementation:**
    1.  **Main Layout:** The entire page content should be within a `<v-container>`.
    2.  **Header:** Use a `<div>` with `d-flex` to position the "Run History" title on the left and the "Status updates" text on the right.
    3.  **Section Containers:** Each section ("Recent Sequences" and "Recent Standalone Tasks") should be a single `<v-card variant="flat" border>`. This creates the clean, bordered look without heavy shadows.
    4.  **Data Tables:** Inside each card, use a `<v-data-table>`.
        *   It **must** have the `density="compact"` prop.
        *   The headers should be simple text as shown.
        *   **Status Column:** This column must render the `<StatusBadge>` component.
        *   **Sequence/Task ID Column:** This must be a link (`<a>` tag or router-link) to the detail page.
        *   **Actions Column:** This contains a single `<v-btn variant="outlined" size="small">Details</v-btn>`.
*   **Acceptance Criteria (for Playwright MCP):**
    *   The page looks exactly like the "Run History" screenshot.
    *   The layout is a clean, two-table design.
    *   The tables are compact and easy to read.

### 2. Implement the Sequence Detail View (`/sequence/:id`)

*   **Example Screenshot:** `examples/sequence-details.png`
*   **Objective:** Recreate the beautifully organized, multi-section layout for displaying sequence information.
*   **File to Modify:** `src/frontend/src/views/SequenceDetailView.vue`
*   **Implementation:**
    1.  **Header:** Contains the `<BreadcrumbNav>`, Sequence ID title, and a `<StatusBadge>`.
    2.  **"Sequence Information" Card:**
        *   Use a single `<v-card variant="flat" border>`.
        *   Inside, use a `<v-row>` and `<v-col>` to create the three-column layout for "Folder Path", "Total Duration", and "Total Tasks".
        *   Use `v-list-item` or simple `div`s with icons to display each piece of data, **not** nested cards.
        *   The "Total Token Usage" section is a styled `div` inside this card, with `<v-chip>` elements for each token type as shown.
    3.  **"Tasks in Sequence" Section:**
        *   This is a `<v-card variant="flat" border>`.
        *   **CRITICAL:** Do NOT use `<TaskCard>`. Use a `<v-list lines="two">`.
        *   Each task is a `<v-list-item>` with a custom layout using `d-flex` to position the task number, title, status, and "Details" button horizontally. This is key to the compact design.
*   **Acceptance Criteria (for Playwright MCP):**
    *   The page is a pixel-perfect match of the "sequence-test" screenshot.
    *   Information is grouped logically in bordered sections.
    *   The list of tasks is a compact vertical list, not a grid of large cards.

### 3. Implement the Task Detail View (`/task/:id`)

*   **Example Screenshot:** `examples/task-details.png`
*   **Objective:** To build a clean, two-part view for task details, separating the pipeline steps from the logs.
*   **File to Modify:** `src/frontend/src/views/TaskDetailView.vue`
*   **Implementation:**
    1.  **Header:** Breadcrumbs and Task ID title with `<StatusBadge>`.
    2.  **"Pipeline Progress" Section:**
        *   Use a `<v-card variant="flat" border>`.
        *   Inside, use a `<v-list>`. Each pipeline step is a `<v-list-item>`.
        *   Each list item contains a `d-flex` layout to arrange the step number, step name, status icon (`v-icon mdi-check`), and a `<v-btn-group density="compact">` for the log buttons ("Main Log", "Reasoning", "Raw").
    3.  **"Log Viewer" Section:**
        *   This is a separate `<v-card variant="flat" border>`.
        *   It contains the `<LogViewer>` component.
*   **Acceptance Criteria (for Playwright MCP):**
    *   The page exactly matches the "task-claude-Tasks-test-01-test" screenshot.
    *   The pipeline steps are a clean, bordered list.
    *   The log buttons are a small, compact group on the right of each step.

### 4. Implement the Live Activity View (`/live`)

*   **Objective:** To fix the layout and functionality to match the original, highly effective design.
*   **Example Screenshot:** `examples/live-activity.png`
*   **File to Modify:** `src/frontend/src/views/LiveActivityView.vue`
*   **Implementation:**
    1.  **Layout:** Use a `<v-row>` to create the main structure.
    2.  **Sidebar (`<v-col md="4">`):**
        *   This column contains two sections: "Sequence Tasks" and "Task Steps".
        *   Each section should be a `<v-list>` with a `<v-list-subheader>`.
        *   Each item is a `<v-list-item density="compact">`.
        *   The currently active item (e.g., "02-test.md" and "review") must have a blue background, as shown. This is done by binding the `:active` prop and using CSS to style it.
    3.  **Main Content (`<v-col md="8">`):**
        *   This column contains **only one element**: the `<LogViewer>`.
        *   The `<LogViewer>` must be styled with `height: 100%` and a dark, terminal-like theme (`theme="dark"` on the card, custom CSS for the `<pre>` tag).
    4. **IMPORTANT:**
        *   when no task is running, the layout should be exactly the same. It should show the last task and sequence that was running, with their logs. Just the status should be updated to reflect current status.
*   **Acceptance Criteria (for Playwright MCP):**
    *   The page is a pixel-perfect match of the first screenshot provided.
    *   The sidebar is narrow and uses compact lists.
    *   The active item in each list is highlighted with a solid blue background.
    *   The log viewer dominates the screen space and has a dark theme.
>>>>>>> Stashed changes
