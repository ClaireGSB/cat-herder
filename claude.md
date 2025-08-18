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

# --- BUILD THE FRONTEND ---
echo "Step 2: Building the Vue application..."
npm run build --prefix src/frontend
if [ $? -ne 0 ]; then echo "Frontend build failed!"; exit 1; fi
echo "Build successful."

# --- RUN THE SERVER ---
echo "Step 3: Starting the web server in the background..."
claude-project web &
SERVER_PID=$!
echo "Server started with PID: $SERVER_PID. Waiting for it to initialize..."
sleep 3

# --- VERIFY THE UI ---
echo "Step 4: Running Playwright MCP to verify UI..."
# (Agent invokes Playwright MCP here, e.g., to view http://localhost:5177/task/task-completed-sample)

# --- CLEAN UP ---
echo "Step 5: Shutting down the web server..."
kill $SERVER_PID
wait $SERVER_PID 2>/dev/null
echo "Server stopped. Loop complete."
```
