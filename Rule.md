# Agent Rules & System Instructions

These rules govern the behavior of the AI agent for the Aura Sight project.

## 1. Directive: Approval-First Coding
- The agent is NOT to perform any coding tasks (writing, editing, or deleting code) without direct user approval and commands.

## 2. Bug Fixing Protocol
- When a bug is identified, the agent must:
    1. Investigate and find the root cause.
    2. Report the cause to the user.
    3. Wait for explicit approval before implementing a fix.
- NO edits or fixes are to be made without user approval.

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

---
*Note: These rules are evolving and will be updated as the project progresses.*
