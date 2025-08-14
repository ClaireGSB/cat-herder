
# PLAN.md

### **Title: Refine Web Dashboard for Robustness and Maintainability**

**Goal:** Refactor the web dashboard's backend logic for 100% reliable task-sequence association, improve the frontend code structure for better maintainability, and polish the UI text to reflect its real-time capabilities.

### **Description**

The web dashboard is now feature-complete, but its internal architecture can be made more robust and easier to maintain. Currently, the association between a task and its parent sequence relies on string pattern matching, which can be fragile. Additionally, all client-side JavaScript resides in a single large script tag, which will become difficult to manage as the application grows.

This plan outlines three key refinements:
1.  **Explicit Linking:** We will modify the orchestrator to explicitly write a `parentSequenceId` into a task's state file, making the relationship between tasks and sequences unambiguous.
2.  **Code Modularization:** We will refactor the frontend JavaScript into separate, page-specific files for better organization and readability.
3.  **UI Polish:** We will update minor UI text to accurately reflect the new, fully real-time nature of the dashboard.

### **Summary Checklist**

-   [x] **1. Implement Explicit Task-to-Sequence Linking**
-   [ ] **2. Refactor Client-Side JavaScript into Modular Files**
-   [ ] **3. Polish UI Text and Contextual Links**

---

### **Detailed Implementation Steps**

#### **1. Implement Explicit Task-to-Sequence Linking**

*   **Objective:** To create an explicit, immutable link between a task and its parent sequence within the state files, removing the need for fragile string-matching logic.

*   **Task 1.1 (Backend - `src/tools/status.ts`):**
    1.  Update the `TaskStatus` type definition to include an optional `parentSequenceId` field.

*   **Code Snippet (`src/tools/status.ts`):**
    ```typescript
    export type TaskStatus = {
      // ... existing fields
      pipeline?: string;
      parentSequenceId?: string; // Add this new optional field
      currentStep: string;
      // ... rest of the fields
    };
    ```

*   **Task 1.2 (Backend - `src/tools/orchestrator.ts`):**
    1.  In the `executePipelineForTask` function, detect if the task is being run as part of a sequence (the `options.sequenceStatusFile` will be defined).
    2.  If it is, extract the `sequenceId` from the filename.
    3.  When calling `updateStatus` for the task, write the extracted `sequenceId` to the new `parentSequenceId` field.

*   **Code Snippet (`src/tools/orchestrator.ts`):**
    ```typescript
    // Inside executePipelineForTask function
    const sequenceId = options.sequenceStatusFile
      ? path.basename(options.sequenceStatusFile, '.state.json')
      : undefined;

    updateStatus(statusFile, s => {
      if (s.taskId === 'unknown') {
        s.taskId = taskId;
        s.startTime = new Date().toISOString();
      }
      s.pipeline = pipelineName;
      if (sequenceId) {
        s.parentSequenceId = sequenceId; // Explicitly set the link
      }
    });
    ```

*   **Task 1.3 (Backend - `src/tools/web.ts`):**
    1.  Rewrite the `getSequenceDetails` helper function. Instead of scanning folders and matching filenames, it will now scan all task state files and filter them where `parentSequenceId` matches the requested `sequenceId`. This is much faster and more reliable.
    2.  Rewrite the `findParentSequence` helper. It will now simply read a task's state file and return the value of the `parentSequenceId` field if it exists.

#### **2. Refactor Client-Side JavaScript into Modular Files**

*   **Objective:** To modularize the client-side JavaScript by moving it from a single `<script>` block into separate files, improving code organization and maintainability.

*   **Task 2.1 (Project Structure):**
    1.  Create a new directory: `src/public/js/`.
    2.  Move the `ClaudeDashboard` class and its related logic from `footer.ejs` into a new file: `src/public/js/dashboard.js`.
    3.  Move the page-specific initialization logic (like `initializeLiveActivity`) into separate files: `src/public/js/live-activity.js`, `src/public/js/sequence-detail.js`, etc.

*   **Task 2.2 (Build Process - `package.json`):**
    1.  Ensure the build script copies the entire `src/public` directory (which now contains `index.html` and the new `js/` subdirectory) to the `dist` folder.
    *Note: Your current build script `cp -r src/templates dist/` seems to handle this already if we place `public` inside `templates`, but creating a dedicated `public` folder is cleaner. Let's assume a new `cp -r src/public dist/` command might be needed.*

*   **Task 2.3 (Frontend - `footer.ejs`):**
    1.  Replace the large inline `<script>` block with individual `<script>` tags that load the new JavaScript files.
    2.  Use a pattern to conditionally load page-specific scripts.

*   **Code Snippet (New file structure and loading in `footer.ejs`):**
    ```
    <!-- In footer.ejs -->
    <script src="/js/dashboard.js"></script> <!-- Main class -->

    <% if (page === 'dashboard') { %>
        <script src="/js/dashboard-page.js"></script>
    <% } else if (page === 'sequence_detail') { %>
        <script src="/js/sequence-detail-page.js"></script>
    <% } else if (page === 'live_activity') { %>
        <script src="/js/live-activity-page.js"></script>
    <% } %>
    ```
    *(This requires passing a `page` variable from each Express route when rendering the template.)*

#### **3. Polish UI Text and Contextual Links**

*   **Objective:** To update UI text to align with the new real-time capabilities and improve the clarity of contextual links.

*   **Task 3.1 (`src/templates/web/dashboard.ejs`):**
    1.  Locate the text "Auto-refreshes every 30s".
    2.  Change it to "Status updates in real-time".
    3.  Change the icon from `bi-arrow-clockwise` to something like `bi-reception-4` or `bi-broadcast` to better represent a live connection.

*   **Code Snippet (`dashboard.ejs`):**
    ```html
    <!-- Before -->
    <div class="d-flex align-items-center text-muted">
        <i class="bi bi-arrow-clockwise me-1"></i>
        <small>Auto-refreshes every 30s</small>
    </div>

    <!-- After -->
    <div class="d-flex align-items-center text-muted">
        <i class="bi bi-broadcast-pin me-1"></i>
        <small>Status updates in real-time</small>
    </div>
    ```

*   **Task 3.2 (`src/templates/web/task-detail.ejs`):**
    1.  Find the contextual link to the live view.
    2.  Change the link text from "LIVE" to "View Live Activity" to be more descriptive for new users.

*   **Code Snippet (`task-detail.ejs`):**
    ```html
    <!-- Before -->
    <a href="/live" class="ms-2 badge bg-danger text-decoration-none" title="View Live Activity">
        <i class="bi bi-broadcast me-1"></i>LIVE
    </a>

    <!-- After -->
    <a href="/live" class="ms-2 btn btn-danger btn-sm" title="View Live Activity">
        <i class="bi bi-broadcast me-1"></i>View Live Activity
    </a>
    ```

