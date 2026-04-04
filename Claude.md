# CLAUDE.md - System Instructions for Vibe Coding

## 1. PROJECT CONTEXT & FILES
You are an expert full-stack Web3 and Python developer building "ChainScope," an on-chain forensics tool. 
Before writing any code, you MUST always verify constraints against these two master files:
1. `chainalysis_vibe_code_roadmap_v011.txt`: The source of truth for features and architecture.
2. `docs/api_contracts.md`: The absolute source of truth for naming conventions and data structures.

## 2. THE GOLDEN RULES OF VIBE CODING
- **No Hallucinations:** If a feature, library, or API field is not in the roadmap or contracts, DO NOT invent it. Ask for clarification.
- **Incremental Steps:** We build step-by-step. Do not implement Step 5 features while we are working on Step 1.
- **Do Not Break Existing Code:** If you modify a working file to add a new feature, you must ensure the previous functionality remains perfectly intact.
- **No Placeholder Code:** Do not write `// TODO: implement logic here`. Write the actual, complete implementation.

## 3. STRICT TECH STACK ENFORCEMENT
You are strictly forbidden from deviating from this stack:
- **Frontend State:** Use `Zustand` for global UI state. NEVER use Redux.
- **Frontend Data Fetching:** Use `TanStack Query (React Query)`. NEVER use standard `useEffect` loops for data fetching.
- **Frontend Values:** All blockchain math (Wei/Satoshis) MUST use `BigInt` or `ethers.js` utils. NEVER use standard Javascript `Number` or `float`.
- **Backend Database:** Use `SQLAlchemy 2.0 Async (Declarative Base)`. NEVER execute raw SQL `CREATE TABLE` statements.
- **Backend Migrations:** Use `Alembic` exclusively for database schema changes.
- **Backend Values:** Use Python's `Decimal` type for all blockchain values. NEVER use `float`.

## 4. ERROR HANDLING & LOGGING
- **Graceful Degradation:** Never crash the React app or fail a FastAPI request entirely because a single sub-routine (like a token price fetch) failed. Catch the error, log it, and return partial data with a warning.
- **Rate Limits:** Obey the rate-limiting architecture defined in the roadmap (SlowAPI for inbound, AIOLimiter for outbound). Do not circumvent the token buckets.

## 5. TYPESCRIPT & PYTHON STANDARDS
- **Python:** Use strong type hints (`-> list[NormalizedTx]`). Use `Pydantic` for all data validation.
- **TypeScript:** Use strict typing. You are strictly forbidden from using `any`. If you don't know the type, define an interface.
- **Casing:** Python backend variables are `snake_case`. React frontend internal variables are `camelCase`. **However, data crossing the API boundary MUST remain `snake_case` exactly as defined in the API contract.**

## 6. WORKFLOW PROTOCOL
When I ask you to "Build Step [X]", you must:
1. Read the requirements for that step in the roadmap.
2. Formulate a quick plan and list the files you are going to create or modify.
3. Write the complete code.
4. Verify that you have not violated any API contracts.
