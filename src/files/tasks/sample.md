# Add User Authentication Module

## Objective
Implement a simple user authentication system with login, logout, and session management.

## Requirements
- Create a User interface with id, email, and hashedPassword
- Implement login function that validates email/password and returns a session token
- Implement logout function that invalidates the session
- Add middleware to protect routes that require authentication
- Store sessions in memory (no database required for this sample)

## Acceptance Criteria
- User can log in with valid credentials and receive a token
- User cannot log in with invalid credentials
- Protected routes reject requests without valid tokens
- User can log out and invalidate their session
- All functions have proper TypeScript types
- Code follows project linting and formatting standards

## Notes
This is a sample task to demonstrate the claude-project workflow. It includes planning, testing, implementation, documentation, and review phases.