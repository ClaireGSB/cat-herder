# Claude Project

A CLI tool that scaffolds a structured, step-gated development workflow powered by Claude Code into any TypeScript repository.

## Overview

`claude-project` transforms your TypeScript repository into a systematic development environment where Claude executes tasks through a controlled, six-step pipeline:

1. **Plan** → Generate detailed implementation plan
2. **Write Tests** → Create failing tests based on requirements  
3. **Implement** → Write code to make tests pass
4. **Update Docs** → Update documentation
5. **Self Review** → Improve code style and naming
6. **Open PR** → Push branch and create draft pull request

Each step includes validation checkpoints, automatic git commits, and comprehensive logging. Pre-commit hooks enforce code quality, while a validator system prevents out-of-order edits that could break the workflow.

## Installation

Install globally via npm:

```bash
npm install -g @your-scope/claude-project
```

Or use directly with npx (recommended):

```bash
npx @your-scope/claude-project init
```

## Testing

test in new repo

```bash
cd .. 
# Remove the old test app
rm -rf my-test-app 
# Recreate and re-initialize it
mkdir my-test-app
cd my-test-app
npm init -y
# initialize git
git init
# add readme
echo "# My Test App" > README.md
# first commit
git add .
git commit -m "Initial commit"
# Install claude-project
npm link @your-scope/claude-project
claude-project init
npm install
# open vscode
code .
```


then run using npm script:

```bash
npm run claude:run claude-Tasks/task-001-sample.md
```


## Quick Start

1. **Initialize in your TypeScript repository:**
   ```bash
   cd your-typescript-project
   npx claude-project init
   npm install
   ```

2. **Create your first task:**
   ```bash
   # Edit the sample task or create a new one
   code claude-Tasks/task-001-sample.md
   ```

3. **Run the automated workflow:**
   ```bash
   npm run claude:run claude-Tasks/task-001-sample.md
   ```

4. **Monitor progress** (optional):
   ```bash
   # Terminal UI
   npm run claude:tui
   
   # Web interface
   npm run claude:web
   # Open http://localhost:5177
   
   # Status check
   npm run claude:status
   ```

The workflow will execute each step automatically, committing at checkpoints and creating a draft PR when complete.

## Usage Guide

### Commands

- `claude-project init [options]` - Initialize workflow in current repository

#### Options
- `--task-folder <path>` - Custom folder for task files (default: `claude-Tasks`)

### Task Files

Tasks are written in Markdown format in the `claude-Tasks/` directory. Each task should include:

```markdown
# Task Title

## Objective
Clear description of what needs to be implemented.

## Requirements
- Specific requirement 1
- Specific requirement 2

## Acceptance Criteria
- Testable criterion 1
- Testable criterion 2
```

### Managing Multiple Tasks

- Tasks run sequentially through the 6-step pipeline
- Each task gets its own branch and state tracking
- Watch mode automatically processes new tasks: `npm run claude:watch`

## Workflow Overview

### The Six-Step Pipeline

Each task progresses through these phases:

#### 1. Plan (`/project:plan-task`)
- **Input**: Task markdown file
- **Output**: `PLAN.md` with implementation strategy
- **Tools**: Read, Glob, Grep only
- **Validation**: PLAN.md must exist

#### 2. Write Tests (`/project:write-tests`)
- **Input**: Task file and PLAN.md
- **Output**: Test files in `/test` directory
- **Tools**: Read, Write, Edit, Bash (vitest/npm)
- **Validation**: Tests must exist and fail initially

#### 3. Implement (`/project:implement`)
- **Input**: Existing tests
- **Output**: Source code to pass tests
- **Tools**: Read, Write, Edit, MultiEdit, Bash (vitest/npm)
- **Validation**: All tests must pass

#### 4. Update Docs (`/project:docs-update`)
- **Input**: Implemented changes
- **Output**: Updated README.md and documentation
- **Tools**: Read, Write, Edit
- **Validation**: None (manual review)

#### 5. Self Review (`/project:self-review`)
- **Input**: Complete implementation
- **Output**: Improved code style and documentation
- **Tools**: Read, Edit, Glob, Grep
- **Validation**: Lint fixes applied

#### 6. Open PR (`/project:push-pr`)
- **Input**: Final code
- **Output**: Pushed branch and draft PR
- **Tools**: Bash (git/gh), Read
- **Validation**: PR successfully created

### State Management

The workflow maintains state in:
- `state/current.state.json` - Current task progress
- `logs/` - Detailed logs for each step
- Git commits at each checkpoint

## Templates and Files

Running `claude-project init` copies these templates into your repository:

### Claude Configuration
- `.claude/settings.json` - Claude permissions and hooks
- `.claude/commands/` - Six workflow command definitions

### Development Tools
- `tools/orchestrator.ts` - Main workflow orchestrator
- `tools/status.ts` - State management utilities
- `tools/validators.ts` - PreToolUse validation hooks
- `tools/proc.ts` - Process execution with logging
- `tools/status-cli.ts` - Command-line status viewer
- `tools/tui.ts` - Terminal UI for monitoring
- `tools/web.ts` - Web interface for status
- `tools/watch-tasks.ts` - File watcher for auto-execution

### Configuration Files
- `.eslintrc.cjs` - ESLint configuration
- `.prettierrc.json` - Prettier formatting rules
- `tsconfig.json` - TypeScript configuration for target project

### Sample Content
- `claude-Tasks/task-001-sample.md` - Example task for testing

## Scripts Reference

After running `claude-project init`, these npm scripts are added to your `package.json`:

### Core Workflow
- `npm run claude:run <task.md>` - Execute a specific task through the full pipeline
- `npm run claude:watch` - Watch for new task files and auto-execute them

### Monitoring & Status
- `npm run claude:status` - Display current task status as JSON
- `npm run claude:tui` - Launch terminal UI for live monitoring (press 'q' to quit)
- `npm run claude:web` - Start web interface on http://localhost:5177

### Development
- `npm run lint` - Run ESLint on all files
- `npm run lint:fix` - Run ESLint with auto-fix
- `npm run test` - Run tests in watch mode
- `npm run test:ci` - Run tests once with coverage (used by git hooks)


## Requirements

### System Dependencies
- **Node.js**: 18.0.0 or higher
- **Git**: Any recent version
- **GitHub CLI**: Required for the PR step (`gh` command)
  ```bash
  # Install GitHub CLI with Homebrew on macOS
  brew install gh
  # Or follow official installation guide for other platforms
  # https://cli.github.com/manual/installation
  ```

### Project Prerequisites
- TypeScript project with `package.json`
- Git repository (initialized with `git init`)
- GitHub remote configured (for PR creation)

### Recommended Setup
- VS Code with Claude Code extension
- Git configured with user name and email
- GitHub authentication configured for `gh` CLI

## Troubleshooting

### Common Issues

#### "claude command not found"
Ensure Claude Code CLI is installed and in your PATH:
```bash
# Check if Claude is installed
which claude
# If not found, install Claude Code CLI
```

#### "PreToolUse validation failed"
The validator is preventing out-of-order edits. Check current workflow state:
```bash
npm run claude:status
```
Complete the current step or reset state if needed.

#### "Tests are not failing as expected"
The workflow expects tests to fail initially in step 2. Ensure tests are properly written to validate the requirements before implementation exists.

#### "Git hooks blocking commits"
Pre-commit hooks enforce code quality:
```bash
# Fix lint issues
npm run lint:fix
# Fix any remaining issues manually
npm run lint
```


#### "Port 5177 already in use"
Stop existing web interface or use a different port:
```bash
# Kill existing process
pkill -f "node.*web.ts"
# Edit tools/web.ts to use different port if needed
```

### Debug Mode

Enable verbose logging by setting environment variable:
```bash
DEBUG=claude-project npm run claude:run task.md
```

### Reset State

If workflow gets stuck, manually reset:
```bash
rm -rf state/ logs/
git reset --hard HEAD  # WARNING: loses uncommitted changes
```

### Getting Help

1. Check the status: `npm run claude:status`
2. Review logs in the `logs/` directory  
3. Examine state in `state/current.state.json`
4. Ensure all prerequisites are installed and configured

## Examples

### Complete Workflow Example

Here's a full example of setting up and running a task:

```bash
# 1. Set up a new TypeScript project
mkdir my-project && cd my-project
npm init -y
npm install typescript @types/node --save-dev

# 2. Initialize git and GitHub
git init
gh repo create my-project --public
git remote add origin https://github.com/username/my-project.git

# 3. Scaffold claude-project workflow
npx claude-project init
npm install

# 4. Create a task
cat > claude-Tasks/task-002-add-calculator.md << 'EOF'
# Add Calculator Module

## Objective
Create a simple calculator module with basic arithmetic operations.

## Requirements
- Create a Calculator class with add, subtract, multiply, divide methods
- Handle division by zero with appropriate error
- Export the class for use in other modules
- All methods should accept two numbers and return a number

## Acceptance Criteria
- Calculator.add(2, 3) returns 5
- Calculator.divide(10, 0) throws an error
- All operations work with positive and negative numbers
- Class is properly exported and importable
EOF

# 5. Run the workflow
npm run claude:run claude-Tasks/task-002-add-calculator.md

# 6. Monitor progress (in separate terminal)
npm run claude:tui
```

### Task File Template

```markdown
# [Feature Name]

## Objective
Clear, one-sentence description of what needs to be built.

## Requirements
- Functional requirement 1
- Functional requirement 2
- Non-functional requirement (performance, security, etc.)

## Acceptance Criteria  
- Testable criterion 1 (what success looks like)
- Testable criterion 2 (edge cases covered)
- Testable criterion 3 (error conditions handled)

## Notes (Optional)
- Technical constraints
- Dependencies
- Reference materials
```

### Monitoring During Execution

While a task runs, you can monitor progress:

```bash
# Terminal 1: Run the task
npm run claude:run claude-Tasks/my-task.md

# Terminal 2: Watch status
npm run claude:tui

# Terminal 3: View logs in real-time
tail -f logs/01-plan.log      # During planning phase
tail -f logs/02-tests.log     # During test writing
tail -f logs/03-implement.log # During implementation

# Check status programmatically
npm run claude:status | jq '.currentStep'
```

### Directory Structure After Init

```
your-project/
├── .claude/
│   ├── settings.json
│   └── commands/
│       ├── plan-task.md
│       ├── write-tests.md
│       ├── implement.md
│       ├── docs-update.md
│       ├── self-review.md
│       └── push-pr.md
├── tools/
│   ├── orchestrator.ts
│   ├── status.ts
│   ├── validators.ts
│   ├── proc.ts
│   ├── status-cli.ts
│   ├── tui.ts
│   ├── web.ts
│   └── watch-tasks.ts
├── claude-Tasks/
│   └── task-001-sample.md
├── .eslintrc.cjs
├── .prettierrc.json
├── package.json (updated with scripts)
└── tsconfig.json
```

### Working with Branches

The orchestrator automatically manages branches:

```bash
# Each task creates a new branch
# Branch name format: claude-task-{taskId}-{timestamp}

# View current branch during execution
git branch --show-current

# After completion, you'll have:
# - All changes committed to the task branch
# - A draft PR opened in GitHub
# - State and logs preserved for debugging
```

## Configuration

### Customizing Task Folder

```bash
# Use a different folder for tasks
claude-project init --task-folder features
# Creates 'features/' instead of 'claude-Tasks/'
```

### Modifying Workflow Steps

The six steps are defined in `.claude/commands/`. You can customize:

- Tool permissions in command frontmatter
- Prompt instructions
- Validation requirements

Example command modification:
```markdown
---
description: Write failing tests with custom framework
allowed-tools: Read, Write, Edit, Bash(jest *:*), Bash(npm *:*)
---
Use Jest instead of Vitest for testing...
```

## License

MIT License - see LICENSE file for details.

## Contributing

This is a bootstrap tool for development workflows. Contributions welcome for:
- Additional template configurations
- Enhanced monitoring interfaces  
- Integration with other testing frameworks
- Workflow customization options

## Version

Current version: 0.1.0
