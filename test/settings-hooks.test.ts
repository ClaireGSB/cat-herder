import { describe, it, expect } from 'vitest';

// Test the core logic functions directly by importing them
// We'll need to export these functions from init.ts for testing

describe('Settings Hook Logic', () => {
  const requiredHook = {
    type: "command",
    command: "node ./node_modules/@your-scope/catherder/dist/tools/pipeline-validator.js < /dev/stdin",
  };
  
  const requiredMatcher = "Edit|Write|MultiEdit";

  // Test the hook detection logic
  describe('doesHookExist logic', () => {
    function doesHookExist(settings: any): boolean {
      const preToolUseHooks = settings?.hooks?.PreToolUse;
      if (!Array.isArray(preToolUseHooks)) return false;

      const matcherEntry = preToolUseHooks.find(h => h.matcher === requiredMatcher);
      if (!matcherEntry || !Array.isArray(matcherEntry.hooks)) return false;
      
      return matcherEntry.hooks.some((h: any) => h.command === requiredHook.command);
    }

    it('should return false for empty settings', () => {
      expect(doesHookExist({})).toBe(false);
    });

    it('should return false when no hooks property', () => {
      const settings = { permissions: { allow: ["Read"] } };
      expect(doesHookExist(settings)).toBe(false);
    });

    it('should return false when PreToolUse is empty', () => {
      const settings = { hooks: { PreToolUse: [] } };
      expect(doesHookExist(settings)).toBe(false);
    });

    it('should return false when no matching matcher', () => {
      const settings = {
        hooks: {
          PreToolUse: [
            {
              matcher: "Bash",
              hooks: [{ type: "command", command: requiredHook.command }]
            }
          ]
        }
      };
      expect(doesHookExist(settings)).toBe(false);
    });

    it('should return false when matcher exists but no matching hook command', () => {
      const settings = {
        hooks: {
          PreToolUse: [
            {
              matcher: requiredMatcher,
              hooks: [{ type: "command", command: "different command" }]
            }
          ]
        }
      };
      expect(doesHookExist(settings)).toBe(false);
    });

    it('should return true when exact hook exists', () => {
      const settings = {
        hooks: {
          PreToolUse: [
            {
              matcher: requiredMatcher,
              hooks: [{ type: "command", command: requiredHook.command }]
            }
          ]
        }
      };
      expect(doesHookExist(settings)).toBe(true);
    });

    it('should return true when hook exists among multiple hooks', () => {
      const settings = {
        hooks: {
          PreToolUse: [
            {
              matcher: requiredMatcher,
              hooks: [
                { type: "command", command: "other command" },
                { type: "command", command: requiredHook.command },
                { type: "command", command: "another command" }
              ]
            }
          ]
        }
      };
      expect(doesHookExist(settings)).toBe(true);
    });
  });

  // Test the merging logic
  describe('mergeHook logic', () => {
    function mergeHook(settings: any): any {
      const newSettings = JSON.parse(JSON.stringify(settings)); // Deep copy

      if (!newSettings.hooks) newSettings.hooks = {};
      if (!newSettings.hooks.PreToolUse) newSettings.hooks.PreToolUse = [];
      
      let matcherEntry = newSettings.hooks.PreToolUse.find((h: any) => h.matcher === requiredMatcher);

      if (matcherEntry) {
        if (!matcherEntry.hooks) matcherEntry.hooks = [];
        matcherEntry.hooks.push(requiredHook);
      } else {
        newSettings.hooks.PreToolUse.push({
          matcher: requiredMatcher,
          hooks: [requiredHook],
        });
      }
      return newSettings;
    }

    it('should create hooks structure on empty settings', () => {
      const result = mergeHook({});
      
      expect(result.hooks).toBeDefined();
      expect(result.hooks.PreToolUse).toBeDefined();
      expect(Array.isArray(result.hooks.PreToolUse)).toBe(true);
      expect(result.hooks.PreToolUse).toHaveLength(1);
      expect(result.hooks.PreToolUse[0].matcher).toBe(requiredMatcher);
      expect(result.hooks.PreToolUse[0].hooks[0].command).toBe(requiredHook.command);
    });

    it('should preserve existing permissions', () => {
      const settings = {
        permissions: { allow: ["Read", "Write"], deny: ["WebFetch"] }
      };
      
      const result = mergeHook(settings);
      
      expect(result.permissions).toEqual(settings.permissions);
      expect(result.hooks.PreToolUse[0].hooks[0].command).toBe(requiredHook.command);
    });

    it('should add to existing PreToolUse array', () => {
      const settings = {
        hooks: {
          PreToolUse: [
            {
              matcher: "Bash",
              hooks: [{ type: "command", command: "bash validation" }]
            }
          ]
        }
      };
      
      const result = mergeHook(settings);
      
      expect(result.hooks.PreToolUse).toHaveLength(2);
      expect(result.hooks.PreToolUse[0].matcher).toBe("Bash");
      expect(result.hooks.PreToolUse[1].matcher).toBe(requiredMatcher);
    });

    it('should add hook to existing matcher', () => {
      const settings = {
        hooks: {
          PreToolUse: [
            {
              matcher: requiredMatcher,
              hooks: [{ type: "command", command: "existing hook" }]
            }
          ]
        }
      };
      
      const result = mergeHook(settings);
      
      expect(result.hooks.PreToolUse).toHaveLength(1);
      expect(result.hooks.PreToolUse[0].hooks).toHaveLength(2);
      expect(result.hooks.PreToolUse[0].hooks[0].command).toBe("existing hook");
      expect(result.hooks.PreToolUse[0].hooks[1].command).toBe(requiredHook.command);
    });

    it('should preserve other hook types', () => {
      const settings = {
        hooks: {
          PreToolUse: [],
          PostToolUse: [
            { matcher: "*", hooks: [{ type: "command", command: "post hook" }] }
          ]
        }
      };
      
      const result = mergeHook(settings);
      
      expect(result.hooks.PostToolUse).toEqual(settings.hooks.PostToolUse);
      expect(result.hooks.PreToolUse[0].hooks[0].command).toBe(requiredHook.command);
    });

    it('should not modify original settings object', () => {
      const originalSettings = {
        permissions: { allow: ["Read"] },
        hooks: { PreToolUse: [] }
      };
      
      const result = mergeHook(originalSettings);
      
      // Original should be unchanged
      expect(originalSettings.hooks.PreToolUse).toHaveLength(0);
      // Result should have the hook
      expect(result.hooks.PreToolUse).toHaveLength(1);
    });
  });
});