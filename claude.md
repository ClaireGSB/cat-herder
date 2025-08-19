## Guidelines
- Follow development best practices
- Use TypeScript for type safety
- Maintain clear documentation
- Write clean, modular code
- DRY (Don't Repeat Yourself) principle
- Use meaningful variable and function names
- ALWAYS run type checking before declaring a task done (npx tsc --noEmit)

- ALWAYS read PLAN.md before starting a task


## Testing the Web Dashboard

To test the web dashboard UI without running a live task, you can use the built-in test environment, which uses a static set of mock data from the `test/e2e-data/` directory.

```bash
# In your cat-herder repository root
npm run test:manual:web
```

This will start the web server on `http://localhost:5177` populated with consistent data, allowing you to safely verify UI changes without needing to run a live AI task or having existing data in your `~/.cat-herder` directory.

You can use the Playwright MCP to interact with the UI and verify that all components render correctly and function as expected, to take screenshots and check that the UI looks as intended, and to ensure that all links and buttons work properly.