## Guidelines
- Follow development best practices
- Use TypeScript for type safety
- Maintain clear documentation
- Write clean, modular code
- DRY (Don't Repeat Yourself) principle
- Use meaningful variable and function names
- ALWAYS run type checking before declaring a task done (npx tsc --noEmit)

- ALWAYS read PLAN.md before starting a task

## HOW TO FRONTEND 

Here is how to use Playwright to check Frontend work.

1.  **Claude Action:** Make code changes to files in `src/frontend/`.
2.  **Run Verification Script:** Execute the following commands from the project root:

```bash
#!/bin/bash

# --- PREPARE THE ENVIRONMENT ---
echo "Step 1: Setting up mock data..."
./tools/setup-mocks.sh
if [ $? -ne 0 ]; then echo "Mock setup failed!"; exit 1; fi

# --- ENSURE CLAUDE CONFIG EXISTS ---
echo "Step 1.5: Ensuring claude.config.js exists..."
if [ ! -f "claude.config.js" ]; then
    echo "Creating basic claude.config.js for testing..."
    cat > claude.config.js << 'EOF'
// Test configuration for claude-project
export default {
  taskFolder: "claude-Tasks",
  statePath: ".claude/state",
  logsPath: ".claude/logs",
  structureIgnore: [
    "node_modules/**",
    ".git/**",
    "dist/**",
    ".claude/**",
    "*.lock",
  ],
  manageGitBranch: true,
  autoCommit: false,
  defaultPipeline: "default",
  pipelines: {
    default: [
      {
        name: "plan",
        command: "plan-task",
        check: { type: "fileExists", path: "PLAN.md" },
      },
      {
        name: "implement",
        command: "implement",
        check: { type: "none" },
      },
    ],
  },
};
EOF
fi

# --- BUILD THE FRONTEND ---
echo "Step 2: Building the Vue application..."
npm run build --prefix src/frontend
if [ $? -ne 0 ]; then echo "Frontend build failed!"; exit 1; fi
echo "Build successful."

# --- CLEAN UP EXISTING PROCESSES ---
echo "Step 2.5: Cleaning up any existing web server processes..."
pkill -f "claude-project web" 2>/dev/null || true
lsof -ti:5177 | xargs kill -9 2>/dev/null || true
sleep 1

# --- RUN THE SERVER ---
echo "Step 3: Starting the web server in the background..."
claude-project web &
SERVER_PID=$!
echo "Server started with PID: $SERVER_PID. Waiting for it to initialize..."
sleep 3

# Check if server is actually running
if ! curl -s http://localhost:5177/api/history > /dev/null; then
    echo "❌ Server failed to start properly"
    kill $SERVER_PID 2>/dev/null || true
    exit 1
fi
echo "✅ Server is running and responding"

# --- VERIFY THE UI ---
echo "Step 4: Running Playwright MCP to verify UI..."
echo "Server ready at http://localhost:5177"
# (Agent invokes Playwright MCP here, e.g., to view http://localhost:5177/task/task-completed-sample)

# --- CLEAN UP ---
echo "Step 5: Shutting down the web server..."
kill $SERVER_PID 2>/dev/null || true
wait $SERVER_PID 2>/dev/null || true
echo "Server stopped. Loop complete."
```
