# Agent Rules & System Instructions

These rules govern the behavior of the AI agent for the Aura Sight project.

## 1. Directive: Approval-First Coding
- The agent is **STRICTLY PROHIBITED** from performing any coding tasks (writing, editing, or deleting code) or modifying the codebase without direct, explicit user approval for each specific change.
- All decisions taken or to be taken by the agent must pass through the user first.

## 2. Bug Fixing Protocol
- When a bug is identified or reported, the agent must follow this exact sequence:
    1. **Diagnose**: Investigate and find the root cause of the issue.
    2. **Research**: Find the most up-to-date, current (2026) way to fix it.
    3. **Implementation Plan**: Provide a detailed plan on how to fix it.
    4. **Wait for Approval**: Do not proceed to edit the app or codebase until the user has reviewed and approved the plan.
- NO edits or fixes are to be made without direct approval from the user.

## 3. Technology & Dependency Management (2026 Awareness)
- The agent must be aware of its knowledge cutoff and ensure all tools, commands, and dependencies are up-to-date as of **2026**.
- The agent MUST cross-check with the internet for the most current versions and practices.

## 4. Research & Information Integrity
- When searching the internet, the agent must prioritize the most up-to-date information.
- Avoid using outdated documentation, deprecated commands, or legacy pipelines/dependencies.

## 5. Decision Making & Consultation
- No critical design or architectural decisions should be made autonomously.
- The agent must provide multiple options, explain the pros/cons of each, and wait for user selection/approval.

## 6. Question Priority
- When the user asks a question, the agent's priority is to provide only a direct answer.
- No code writing, fixing, or other autonomous actions should be taken in response to a question unless explicitly commanded as part of the answer or in a follow-up.

## 7. Clarifying Questions
- The agent must always ask clarifying questions before initiating any tasks.

## 8. Research on Persistent Issues
- When facing repeated errors or issues (e.g., failed deployment steps), the agent should research the best way to go about it on the internet.
- The agent must ensure the information or fix found is the most up-to-date and relevant to current standards (e.g., awareness of "2026-style" configurations).

## 9. PWA & Deployment Troubleshooting
- When a live deployment (e.g., Vercel) appears to run outdated code or shows 404s for legacy assets, the agent MUST:
    1. Instruct the user to perform a **Hard Refresh** (Ctrl + F5).
    2. Check the **Service Worker** status in DevTools and instruct the user to **Unregister** it if it's serving a stale version.
    3. Verify if the browser is using a cached **Manifest** or old build artifacts.

## 10. Git Commitment Protocol
- The agent MUST commit **and push** all changes to the remote repository immediately after a fix or feature implementation is verified. This ensures CI/CD pipelines (like Vercel) are triggered.
- Commit messages should be descriptive and follow the project's context.

---
*Note: These rules are evolving and will be updated as the project progresses.*
