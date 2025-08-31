

### The New Plan: Reframing Around `autonomyLevel`

Let's build a new plan using `autonomyLevel`. We'll adapt your colleague's excellent structure with our improved terminology and philosophy.

#### 0. Implementation checklist
- [ ] Update `interaction-intro.md` with the new prompt structure and language.
- [ ] Refactor all instances of `interactionThreshold` to `autonomyLevel` in the codebase.
- [ ] Update documentation to reflect the new terminology and concepts.

#### 1. The New and Improved Prompt for `interaction-intro.md`

This new prompt is framed around the concept of "autonomy" and "guidance," which is a clearer directive for an LLM. This will replace the content of `src/tools/prompts/interaction-intro.md`.

```markdown
Your Autonomy Level is set to %%AUTONOMY_LEVEL%% on a scale of 0 to 5. This level dictates how independently you should operate and when you must seek human guidance.

<!-- AUTONOMY_LEVEL_MAXIMUM -->
**Level 0-1 (Maximum Autonomy):**
You are expected to operate with maximum independence. You must make reasonable, expert-level decisions to resolve ambiguities and proceed with the task. Only seek clarification if you are completely blocked by a direct contradiction in your instructions or are about to perform a clearly destructive action (like deleting a critical file). Your priority is to complete the task efficiently and without interruption.

<!-- AUTONOMY_LEVEL_BALANCED -->
**Level 2-3 (Balanced Autonomy):**
You should operate independently on implementation details but seek guidance on significant, strategic decisions. This includes major architectural choices, unclear requirements that have multiple valid interpretations, or choices between significantly different technical paths (e.g., "Should I create a new API version or add to the existing one?"). Do not ask about minor details you can infer from the existing codebase.

<!-- AUTONOMY_LEVEL_GUIDED -->
**Level 4-5 (Guided Execution / Low Autonomy):**
Your primary goal is to act as a collaborator who executes tasks with frequent human oversight. You must be very conservative in your decision-making. Seek clarification on any ambiguity, even if it seems small. Before implementing complex logic, confirm your understanding of the requirement. When multiple options exist, you must present them to the human for a decision.

<!-- COMMON_INSTRUCTIONS -->
To seek clarification, you must use the Bash tool to run the `cat-herder ask` command. Your question must be a single, clear string enclosed in double quotes.

`bash cat-herder ask "Your clear and specific question goes here."`

**Good questions focus on blockers or strategic ambiguity:**
*   "The plan requires a new API endpoint. Should I add this to the existing 'v1/api.ts' router, or create a new 'v2/api.ts' file for it?"
*   "The requirements mention both User and Profile models. Should these be a single consolidated model or two separate ones?"

**Bad questions ask things you can find out yourself:**
*   "Does the 'src/components' directory exist?" (Use the `LS` tool instead.)
*   "What should I do next?" (Follow the plan.)
```

#### 2. Refactoring Plan: `interactionThreshold` -> `autonomyLevel`

This is a global search-and-replace with a few key updates to the surrounding documentation and logic.

**To-Do List for Refactoring:**

*   **`README.md`**
    *   **Action:** Search and replace all instances of `interactionThreshold` with `autonomyLevel`.
    *   **Action:** Update the explanatory text in the "Interactive Halting" section to reflect the new framing of "autonomy" and "guidance."

*   **`src/templates/cat-herder.config.js`**
    *   **Action:** Rename the `interactionThreshold` property to `autonomyLevel`.
    *   **Action:** Update the comment block to explain the new `autonomyLevel` concept using the improved language from the prompt above.

*   **`src/config.ts`**
    *   **Action:** In the `CatHerderConfig` interface, rename `interactionThreshold?` to `autonomyLevel?`.
    *   **Action:** In the `defaultConfig` object, rename `interactionThreshold` to `autonomyLevel`.
    *   **Action (Backward Compatibility):** Your colleague's suggestion for backward compatibility is excellent. Let's adapt it in the `getConfig` function:
        ```typescript
        const userConfig = result.config as any;
        if (userConfig.interactionThreshold !== undefined) {
          console.log(pc.yellow("Warning: 'interactionThreshold' is deprecated. Please rename it to 'autonomyLevel' in your cat-herder.config.js."));
          userConfig.autonomyLevel = userConfig.interactionThreshold;
          delete userConfig.interactionThreshold;
        }
        ```

*   **`src/tools/orchestration/prompt-builder.ts`**
    *   **Action:** In `parseTaskFrontmatter`, look for `autonomyLevel` in the YAML frontmatter. Add the same backward-compatibility check here.
        ```typescript
        // In parseTaskFrontmatter function
        const frontmatter = yaml.load(match[1]) as Record<string, any> | undefined;
        let autonomyLevel = frontmatter?.autonomyLevel;
        if (frontmatter?.interactionThreshold !== undefined) {
            console.log(pc.yellow("Warning: 'interactionThreshold' in task frontmatter is deprecated. Please rename it to 'autonomyLevel'."));
            autonomyLevel = frontmatter.interactionThreshold;
        }
        // ... return { pipeline: frontmatter?.pipeline, autonomyLevel, body }
        ```
    *   **Action:** The `assemblePrompt` function's signature should change from `interactionThreshold` to `autonomyLevel`.
    *   **Action:** In `getInteractionIntro`, replace the placeholder `%%INTERACTION_THRESHOLD%%` with `%%AUTONOMY_LEVEL%%` and update the function to use the new markdown comment tags (`<!-- AUTONOMY_LEVEL_... -->`).

*   **`src/tools/orchestration/pipeline-runner.ts`**
    *   **Action:** In `executePipelineForTask`, update the variable names when resolving the autonomy level from the task frontmatter and config.
        ```typescript
        const { pipeline: taskPipelineName, autonomyLevel: taskAutonomyLevel, body: taskContent } = parseTaskFrontmatter(rawTaskContent);
        // ...
        const resolvedAutonomyLevel = taskAutonomyLevel ?? config.autonomyLevel ?? 0;
        ```
