

# PLAN: Introduce Shared TypeScript Types for Status Phases

### **Goal**
To improve code reliability and prevent status-related bugs by creating a single, type-safe source of truth for all task and sequence lifecycle phases.

### **Description**
Currently, the application uses generic `string` types for status phases (`running`, `done`, `failed`, etc.). This is error-prone and recently led to a bug where an `interrupted` task was incorrectly displayed as `started` because the logic didn't explicitly handle that case.

This change will introduce a shared `StatusPhase` TypeScript type that defines all possible statuses. By using this type across our backend interfaces and logic, we leverage the TypeScript compiler to catch typos, prevent inconsistencies, and ensure that all possible states are handled correctly. This is a purely architectural refactor that will make the codebase more robust and maintainable without changing the user-facing experience.

### **Summary Checklist**
- [x] Create a central `StatusPhase` type in a new `src/types.ts` file.
- [x] Update backend interfaces in `src/tools/web/data-access.ts` to use the new `StatusPhase` type.
- [x] Refactor the status-checking logic in `getSequenceDetails` to be type-safe.
- [x] Verify that frontend EJS templates and CSS align with the `StatusPhase` values.
- [x] Update `ARCHITECTURE.MD` to document this new best practice.

---

### **Detailed Implementation Steps**

#### 1. Create a Central `StatusPhase` Type
*   **Objective:** Establish a single, authoritative source for all possible status strings in the application.
*   **Task:**
    1.  Create a new file at `src/types.ts`.
    2.  Define and export a type alias named `StatusPhase` that includes all known lifecycle statuses.
*   **Code Snippet (`src/types.ts`):**
    ```typescript
    /**
     * Defines all possible lifecycle phases for tasks and sequences.
     * This is the single source of truth for status strings.
     */
    export type StatusPhase =
      | 'pending'
      | 'running'
      | 'done'
      | 'failed'
      | 'interrupted'
      | 'paused'
      | 'started';
    ```

#### 2. Update Data Access Interfaces
*   **Objective:** Apply the new type to the interfaces that shape the data sent to the web dashboard, enabling compile-time checks.
*   **Task:**
    1.  Open `src/tools/web/data-access.ts`.
    2.  Import the new `StatusPhase` type: `import { StatusPhase } from '../../types.js';`.
    3.  In the `TaskStatus`, `SequenceStatus`, and `SequenceTaskInfo` interfaces, change the type of the `phase` and `status` properties from `string` to `StatusPhase`.
*   **Code Snippet (Example from `src/tools/web/data-access.ts`):**
    ```typescript
    // Before
    export interface TaskStatus {
      // ...
      phase: string;
      // ...
    }

    // After
    import { StatusPhase } from '../../types.js';

    export interface TaskStatus {
      // ...
      phase: StatusPhase; // <-- Use the specific type
      // ...
    }
    ```

#### 3. Refactor Status-Checking Logic
*   **Objective:** Replace the brittle `if/else` chain with a more robust and type-safe `switch` statement that the compiler can validate.
*   **Task:**
    1.  In `src/tools/web/data-access.ts`, locate the `getSequenceDetails` function.
    2.  Find the logic block that determines the `taskStatus`.
    3.  Replace it with the `switch` statement below. This correctly handles the `interrupted` case and provides a safer default.
*   **Code Snippet (`src/tools/web/data-access.ts`):**
    ```typescript
    // Before
    let taskStatus = 'pending';
    if (taskState.phase === 'running') taskStatus = 'running';
    else if (taskState.phase === 'failed') taskStatus = 'failed';
    else if (taskState.phase === 'done') taskStatus = 'done';
    else if (taskState.phase) taskStatus = 'started';

    // After
    const taskPhase: StatusPhase = taskState.phase || 'pending';
    let taskStatus: StatusPhase;

    switch (taskPhase) {
        case 'running':
        case 'failed':
        case 'done':
        case 'interrupted':
        case 'paused':
            taskStatus = taskPhase; // Directly use the valid phase
            break;
        case 'pending':
            taskStatus = 'pending';
            break;
        default:
            // This handles any other phase (like 'started') or acts as a safe fallback
            taskStatus = 'started';
            break;
    }
    ```

#### 4. Verify Frontend Templates
*   **Objective:** Ensure that our frontend assets (CSS and templates) correctly correspond to the authoritative `StatusPhase` type.
*   **Task:**
    1.  No code changes are expected here. This is a verification step.
    2.  Check the CSS classes defined in `src/templates/web/partials/header.ejs` (e.g., `.status-running`, `.status-failed`).
    3.  Confirm that every value in the `StatusPhase` type has a corresponding CSS class.
    4.  Review `src/templates/web/partials/_status-badge.ejs` to see how these statuses are used.

### **Error Handling & Warnings**
*   **Compile-Time:** The primary benefit of this change is compile-time safety. If a developer attempts to use an invalid status string (e.g., `task.phase = 'finished'`), the TypeScript compiler (`npm run typecheck`) will immediately throw an error.
*   **Runtime:** If a `.state.json` file on disk contains a status not defined in `StatusPhase` (e.g., from an older version of the tool), the `switch` statement's `default` case will gracefully handle it by assigning it the `started` status, preventing the application from crashing.

### **Documentation Changes**
*   **Objective:** Update the project's architectural documentation to reflect this new best practice, ensuring future development follows this pattern.
*   **Task:**
    1.  Open `ARCHITECTURE.MD`.
    2.  Navigate to section **"7. Code and Module Best Practices"**.
    3.  Add a new sub-section that explains the importance of using shared types for core concepts like status phases.
*   **Suggested Addition to `ARCHITECTURE.MD`:**
    ```markdown
    ### D. Use Shared Types for Core Concepts

    **The Principle:** For core data concepts that are used across multiple modules, such as lifecycle statuses ('running', 'done', 'failed'), define them once in a central `src/types.ts` file and import them wherever needed. Avoid using primitive types like `string` for these concepts.

    **Why it Matters:** This creates a single source of truth that the TypeScript compiler can enforce. It eliminates a whole class of bugs related to typos or unhandled states. For example, by defining `type StatusPhase = 'running' | 'done'`, the compiler will immediately flag any code that attempts to set a status to an incorrect value like `'runing'` or `'completed'`.

    **Practical Example:**
    *   **Problem:** A bug occurred where an `'interrupted'` task was displayed as `'started'` because the data-access layer didn't have an explicit check for it and fell back to a generic case.
    *   **Solution:** We created a `StatusPhase` type containing all possible statuses. By applying this type to our interfaces, the compiler would have warned us if a `switch` statement was not exhaustively handling all defined phases, making the logic gap obvious during development.
    ```