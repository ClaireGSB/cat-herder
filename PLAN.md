Here is a `PLAN.md` for the refactoring project.

---

# PLAN.md

## **Title & Goal**

**Title:** Project Renaming and Data Directory Refactoring to "CatHerder"

**Goal:** To rename the project to "CatHerder" and relocate the application's data files to a dedicated, user-specific hidden directory to avoid conflicts and improve organization.

---

## **Description**

This refactoring addresses two main issues. Firstly, the project's current name will be updated to "CatHerder" to better reflect its purpose. Secondly, the application currently creates log and state files directly within the `/.claude` directory in the user's home directory. This can cause conflicts if the user already has a directory with that name for other purposes.

The new behavior will involve creating a dedicated hidden directory, `.CatHerder`, in the user's home directory for all application-generated files, such as logs and state. The only exception will be the sample commands, which will remain in `.claude/commands` for the time being to maintain existing user configurations. Additionally, a `.gitignore` file will be created within the new `.CatHerder` directory to ensure that its contents are ignored by version control systems, preventing sensitive data from being accidentally committed.

---

## **Summary Checklist**

- [x] Rename all relevant project files and directories from the old name to "CatHerder".
- [x] Update all internal code references from the old name to "CatHerder".
- [ ] Implement the creation of the new `.CatHerder` data directory.
- [ ] Modify the application logic to use `.CatHerder` for log and state files.
- [ ] Ensure the `.claude/commands` directory is still utilized for sample commands.
- [ ] Add functionality to create a `.gitignore` file within the `.CatHerder` directory.
- [ ] Update all tests to reflect the new project name and directory structure.
- [ ] Update the `README.md` and `ARCHITECTURE.md` files to document the changes.

---

## **Detailed Implementation Steps**

### **1. Rename Project Files and Directories**

*   **Objective:** To reflect the new project name, "CatHerder", across the entire project structure.
*   **Task:**
    *   Manually or with the help of an IDE's refactoring tools, rename all files and directories that contain the old project name. This includes the main project folder, source code directories, and any configuration files.
    *   **Example:** If the main project directory is named `claude-project`, it should be renamed to `CatHerder`.

### **2. Update Internal Code References**

*   **Objective:** To ensure all internal references to the old project name are updated to "CatHerder".
*   **Task:**
    *   Perform a global search and replace across the entire codebase for the old project name and its variations.
    *   Pay close attention to namespaces, class names, variable names, and string literals.
    *   **Code Snippet (Before):**
        ```python
        # old_project/main.py
        class ClaudeApp:
            def __init__(self):
                self.project_name = "claude"
        ```
    *   **Code Snippet (After):**
        ```python
        # CatHerder/main.py
        class CatHerderApp:
            def __init__(self):
                self.project_name = "CatHerder"
        ```

### **3. Implement Creation of the New `.CatHerder` Data Directory**

*   **Objective:** To create the new `.CatHerder` directory in the user's home directory for storing application data.
*   **Task:**
    *   In the application's startup or initialization code, add logic to check for the existence of the `.CatHerder` directory in the user's home directory.
    *   If the directory does not exist, create it.
    *   Best practice is to use platform-agnostic methods to locate the user's home directory.
    *   **Code Snippet (New Code):**
        ```python
        import os
        from pathlib import Path

        home_dir = Path.home()
        catherder_dir = home_dir / ".CatHerder"

        if not catherder_dir.exists():
            os.makedirs(catherder_dir)
        ```

### **4. Modify Application Logic for Log and State Files**

*   **Objective:** To redirect the creation of log and state files to the new `.CatHerder` directory.
*   **Task:**
    *   Identify all parts of the code that handle file I/O for logging and state management.
    *   Update the file paths to point to the `.CatHerder` directory.
    *   **Code Snippet (Before):**
        ```python
        log_file_path = "/.claude/app.log"
        state_file_path = "/.claude/app.state"
        ```
    *   **Code Snippet (After):**
        ```python
        from pathlib import Path

        home_dir = Path.home()
        catherder_dir = home_dir / ".CatHerder"
        log_file_path = catherder_dir / "app.log"
        state_file_path = catherder_dir / "app.state"
        ```

### **5. Maintain `.claude/commands` for Sample Commands**

*   **Objective:** To ensure the application continues to use the `.claude/commands` directory for sample commands.
*   **Task:**
    *   Review the code responsible for accessing sample commands.
    *   Confirm that the file paths for these commands still point to the `.claude/commands` directory. No changes should be needed here if the logic is already isolated.

### **6. Create `.gitignore` File in `.CatHerder` Directory**

*   **Objective:** To automatically create a `.gitignore` file in the `.CatHerder` directory to exclude its contents from version control.
*   **Task:**
    *   After creating the `.CatHerder` directory, add logic to create a `.gitignore` file within it if one doesn't already exist.
    *   The `.gitignore` file should contain a single line: `*`
    *   **Code Snippet (New Code):**
        ```python
        from pathlib import Path

        home_dir = Path.home()
        catherder_dir = home_dir / ".CatHerder"
        gitignore_path = catherder_dir / ".gitignore"

        if not gitignore_path.exists():
            with open(gitignore_path, "w") as f:
                f.write("*\n")
        ```

### **7. Update Tests**

*   **Objective:** To ensure all tests pass after the refactoring.
*   **Task:**
    *   Review and update all unit, integration, and end-to-end tests to reflect the new project name and the new data directory structure.
    *   This will likely involve updating mock file paths and assertions.

---

## **Documentation Changes**

*   **Objective:** The final step is to update all project documentation to reflect the changes.
*   **Task:**
    *   **`README.md`:**
        *   Update the project title and any mentions of the old project name.
        *   Update the description to reflect the new data directory structure (`.CatHerder`).
        *   Update any installation or usage instructions that might be affected.
    *   **`ARCHITECTURE.md`:**
        *   Update any architectural diagrams or descriptions that refer to the old project name or the old directory structure.
        *   Specifically, document the new `.CatHerder` directory and its purpose.