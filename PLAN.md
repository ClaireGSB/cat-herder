Of course. Tackling this in one go is a great approach, as it avoids throwaway work and gets you to the desired modern architecture faster. Migrating directly to Vue/Vuetify is the most efficient path.

Here is the revised `PLAN.md` tailored for a direct migration.

***

# PLAN.md

## Title & Goal

**Title:** Migrate Web Dashboard to a Modern Vue 3 & Vuetify Stack

**Goal:** To replace the existing EJS server-rendered web dashboard with a high-performance, maintainable Single Page Application (SPA) using Vue 3, Vuetify for the UI, and Pinia for state management.

---

## Description

The current web dashboard, built with EJS and multiple vanilla JavaScript files, suffers from a poor user experience due to full-page reloads on data updates. Its scattered client-side logic makes it difficult to maintain and extend. This refactoring will address these issues by replacing the entire frontend with a modern SPA.

The new architecture will use **Vite** as a build tool, **Vue 3** for a reactive component-based structure, **Pinia** for centralized state management, and **Vuetify** for a rich, pre-built component library. The Node.js/Express backend's role will shift from rendering HTML to serving a static `index.html` and providing a pure JSON API for the Vue application. This will completely eliminate page reloads, solve the status-syncing problem, and create a fast, modern, and highly maintainable frontend codebase.

---

## Summary Checklist

-   [x] **1. Set Up New Frontend Development Environment:** Initialize a Vite + Vue 3 project within the repository and install all necessary dependencies (Vue, Vuetify, Pinia).
-   [x] **2. Isolate the Backend Source Code:** Create a `src/backend` directory and move all existing Node.js CLI source code into it to create a clean separation from the frontend.
-   [x] **3. Convert Backend Routes to a Data API:** Modify the existing Express routes to serve JSON data instead of rendering EJS templates.
-   [x] **4. Implement State Management with Pinia:** Create a central Pinia store to manage all application state, including tasks, sequences, and live activity data.
-   [x] **5. Integrate WebSocket Client with the Pinia Store:** Set up the WebSocket client to receive real-time updates from the backend and commit them directly to the Pinia store.
-   [x] **6. Build Reusable UI Components with Vue & Vuetify:** Recreate the UI using Vue Single File Components (`.vue`) and Vuetify's component library.
-   [x] **7. Replace EJS Views with a Vue SPA:** Configure the Express server to serve the compiled Vue application and remove all EJS templates and old client-side JavaScript files.
-   [ ] **8. Update Project Documentation:** Update `ARCHITECTURE.MD` and `README.md` to reflect the new monorepo structure, SPA architecture, and data flow.

---

## Detailed Implementation Steps

### 1. Set Up New Frontend Development Environment

*   **Objective:** To create a dedicated, modern build environment for the new Vue application.
*   **Task:**
    1.  Create a new directory: `src/frontend`.
    2.  Inside `src/frontend`, scaffold a new project using Vite: `npm create vite@latest . -- --template vue-ts`.
    3.  Install necessary dependencies: `npm install vue-router pinia vuetify`.
    4.  Follow the Vuetify installation guide to integrate it with Vite.

### 2. Isolate the Backend Source Code

*   **Objective:** To create a logical and scalable file structure that explicitly separates the backend and frontend applications, improving clarity and maintainability.
*   **Task:**
    1.  **Create Directory:** In the `src/` folder, create a new directory named `backend`.
    2.  **Move Directories:** Move the following directories from `src/` into the new `src/backend/` directory:
        *   `tools/`
        *   `init/`
        *   `utils/`
        *   `dot-claude/`
        *   `public/`
        *   `tasks/`
        *   `templates/`
    3.  **Move Files:** Move the following files from `src/` into `src/backend/`:
        *   `cli-actions.ts`
        *   `config.ts`
        *   `index.ts`
        *   `init.ts`
    4.  **Update TypeScript Config:** In the **root** `tsconfig.json`, update the paths to point to the new backend source directory.
        *   **Before:** `"rootDir": "./src"`, `"include": ["src/**/*"]`
        *   **After:** `"rootDir": "./src/backend"`, `"include": ["src/backend/**/*"]`
    5.  **Check Build Scripts:** In the **root** `package.json`, check if any scripts in the `"scripts"` section reference paths like `src/index.ts`. Update them to point to `src/backend/index.ts` if needed.
    6.  **Verify Imports:** After moving the files, some relative import paths inside the backend code might be broken. Run `npm run build` from the root directory. The TypeScript compiler (`tsc`) will tell you exactly which files have incorrect import paths so you can fix them.
    7.  **Test:** Once it builds successfully, run a simple command like `claude-project validate` from your terminal to ensure the CLI is still functioning correctly.

### 3. Convert Backend Routes to a Data API

*   **Objective:** To decouple the backend from the frontend by making it serve pure data.
*   **Task:** Modify the routes in `src/tools/web/routes.ts`. Instead of calling `res.render()`, they should now call `res.json()`.

*   **Code Snippet (`src/tools/web/routes.ts` - before/after):**
    ```typescript
    // BEFORE
    router.get("/history", async (_req: Request, res: Response) => {
      // ... logic to get tasks and sequences
      res.render("history", { sequences, standaloneTasks, helpers });
    });

    // AFTER
    router.get("/api/history", async (_req: Request, res: Response) => {
      const journal = await readJournal();
      const tasks = buildTaskHistoryFromJournal(journal, stateDir);
      const sequences = buildSequenceHistoryFromJournal(journal, stateDir);
      res.json({ tasks, sequences });
    });
    ```

### 4. Implement State Management with Pinia

*   **Objective:** To create a single, reactive source of truth for the entire frontend application.
*   **Task:** Create a Pinia store for tasks and sequences in `src/frontend/src/stores/taskStore.js`.

*   **Code Snippet (`src/frontend/src/stores/taskStore.js`):**
    ```javascript
    import { defineStore } from 'pinia';

    export const useTaskStore = defineStore('tasks', {
      state: () => ({
        tasks: [],
        sequences: [],
        liveTask: null,
        isLive: false,
      }),
      actions: {
        updateFromHistory(historyData) {
          this.tasks = historyData.tasks;
          this.sequences = historyData.sequences;
        },
        handleTaskUpdate(taskData) {
          // Logic to update a single task in the `tasks` array
          // or set it as the new `liveTask`.
          this.liveTask = taskData;
          this.isLive = taskData.phase === 'running';
        },
      },
    });
    ```

### 5. Integrate WebSocket Client with the Pinia Store

*   **Objective:** To make real-time updates from the server automatically reactive in the UI.
*   **Task:** Create a WebSocket service that imports the Pinia store and calls actions when messages arrive.

*   **Code Snippet (`src/frontend/src/services/websocket.js`):**
    ```javascript
    import { useTaskStore } from '@/stores/taskStore';

    export function initializeWebSocket() {
      const taskStore = useTaskStore();
      const ws = new WebSocket(`ws://${window.location.host}/ws`);

      ws.onmessage = (event) => {
        const message = JSON.parse(event.data);
        switch (message.type) {
          case 'task_update':
            // The WebSocket's only job is to call the Pinia action.
            // Vue's reactivity does the rest.
            taskStore.handleTaskUpdate(message.data);
            break;
          // ... handle other message types
        }
      };
    }
    ```

### 6. Build Reusable UI Components with Vue & Vuetify

*   **Objective:** To build the UI with maintainable, self-contained components.
*   **Task:** Create Vue components in `src/frontend/src/components/`. Start with a simple `StatusBadge.vue`.

*   **Code Snippet (`src/frontend/src/components/StatusBadge.vue`):**
    ```vue
    <template>
      <v-chip :color="color" size="small" label>
        <v-icon :icon="icon" start />
        {{ phase }}
      </v-chip>
    </template>

    <script setup>
    import { computed } from 'vue';

    const props = defineProps({
      phase: {
        type: String,
        required: true,
      },
    });

    const color = computed(() => {
      switch (props.phase) {
        case 'running': return 'blue';
        case 'done': return 'success';
        case 'failed': return 'error';
        default: return 'grey';
      }
    });

    // Compute icon based on phase as well...
    </script>
    ```

### 7. Replace EJS Views with a Vue SPA

*   **Objective:** To complete the migration by making the web server serve the new Vue app.
*   **Task:**
    1.  Configure `src/tools/web.ts` to serve the static files produced by Vite's build process.
    2.  Add a catch-all route to serve `index.html` for client-side routing.
    3.  Delete the `src/templates/web` and `src/public/js` directories.

*   **Code Snippet (`src/tools/web.ts`):**
    ```typescript
    import express from "express";
    import path from "node:path";
    
    export async function startWebServer() {
      // ...
      const app = express();
      const server = createServer(app);
      
      const frontendDistPath = path.resolve(projectRoot, 'dist/frontend'); // Or wherever Vite builds to
      
      // Serve the static assets (JS, CSS, images)
      app.use(express.static(frontendDistPath));

      // Serve the API routes
      app.use('/api', createApiRouter(stateDir, logsDir, config));

      // For any other GET request, serve the Vue app's index.html
      // This is crucial for client-side routing to work.
      app.get('*', (req, res) => {
        res.sendFile(path.join(frontendDistPath, 'index.html'));
      });
      
      setupWebSockets(server, stateDir, logsDir);
      // ... server.listen ...
    }
    ```

### 8. Update Project Documentation

*   **Objective:** To ensure the project's documentation accurately reflects its new architecture.
*   **Task:**
    *   **Update `ARCHITECTURE.MD`:**
        *   In the "Interface Layer" section, replace the description of the Web Dashboard. Describe it as a Vue 3 Single Page Application.
        *   Mention the new `src/frontend` directory and its purpose.
        *   Detail the build process using Vite.
        *   Update the data flow diagram to show that the `Web Dashboard` now communicates with a `Backend API` via HTTP (for initial data) and WebSockets (for real-time updates), which in turn reads from the `State Layer`.
    *   **Update `README.md`:**
        *   Add a section under "How to Test Locally (for Developers)" explaining how to run the frontend development server (`npm run dev` in `src/frontend`) alongside the main application for a better development experience.

---

## Error Handling & Warnings

*   **API Failures:** The Vue app should handle API fetch errors gracefully. For example, if the `/api/history` call fails, the UI should display a "Could not load run history" message instead of a blank screen.
*   **WebSocket State:** The UI should clearly indicate the WebSocket connection status (e.g., a small icon showing connected, reconnecting, or disconnected).
*   **Build Process Errors:** The `README.md` should instruct developers that a frontend build (`npm run build` in `src/frontend`) is required after making any changes to the UI before running the production `claude-project web` command.