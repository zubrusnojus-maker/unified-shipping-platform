# LangChain Prompt Templates (JS/TS) — Best Practices + Reusable Snippets

This guide curates practical prompt-engineering patterns and LangChain-ready templates for day-to-day development. It emphasizes clarity, safe outputs, and easy parsing.

## Quick Principles (from Microsoft/Prompting guides)

- Be specific: state role, task, constraints, success criteria.
- Use delimiters: wrap code/inputs with clear fences (```), XML, or --- blocks.
- Order matters: lead with instructions; repeat key constraints at end if needed.
- Few-shot when helpful: include 1–3 concise I/O examples.
- Give an out: allow "not_applicable" or "insufficient_context".
- Specify output schema: prefer strict JSON (and parse it); avoid free-form.
- Grounding: provide domain context or file snippets rather than generic guesses.
- Space efficiency: avoid unnecessary whitespace; prefer tables/lists when large.

## LangChain Building Blocks (JS/TS)

```ts
import { ChatPromptTemplate, PromptTemplate, MessagesPlaceholder } from '@langchain/core/prompts';
import { JsonOutputParser } from '@langchain/core/output_parsers';
// Optional, for stronger schemas:
// import { z } from "zod";
// import { StructuredOutputParser } from "@langchain/core/output_parsers";

// Typical pipeline
// const prompt = ChatPromptTemplate.fromMessages([...])
// const parser = new JsonOutputParser()
// const chain = prompt.pipe(model).pipe(parser)
// const result = await chain.invoke({ ...vars })
```

Notes

- Use `ChatPromptTemplate.fromMessages([...])` to structure system/human/ai messages.
- `MessagesPlaceholder("history")` lets you slot prior turns if needed.
- Use `prompt.partial({ now: new Date().toISOString() })` for dynamic defaults.
- Prefer `JsonOutputParser` for simple JSON; use Zod + `StructuredOutputParser` for strict validation.

---

## Reusable Templates

Below templates are drop-in for LangChain JS/TS. Replace placeholders in braces.

### 1) Code Review (structured findings)

````ts
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { JsonOutputParser } from "@langchain/core/output_parsers";

export const codeReviewPrompt = ChatPromptTemplate.fromMessages([
  ["system", `You are a senior {language} reviewer.
- Be concise and specific.
- Focus on: correctness, security, performance, readability.
- If context is insufficient, return an empty findings array and set summary to "insufficient_context".
Output STRICT JSON only.`],
  ["human", `Repository context (optional):\n---\n{repo_context}\n---\n
File path: {file_path}
Code under review:\n```{language}
{code}
````

Constraints: {constraints}

Return JSON with keys: findings (array of {severity: "high|medium|low", category, line, message, suggestion}), summary (string).`]
]);

export const codeReviewParser = new JsonOutputParser();

````

Few-shot (optional)
```ts
export const codeReviewFewShot = ChatPromptTemplate.fromMessages([
  ["system", "You are a senior TypeScript reviewer. Output strict JSON only."],
  ["human", "File path: src/util.ts\n```ts\nexport const add = (a:any,b:any)=>a+b\n```\nConstraints: no-implicit-any, handle numbers only"],
  ["ai", `{"findings":[{"severity":"medium","category":"types","line":1,"message":"any types used","suggestion":"Use number types for a and b"},{"severity":"low","category":"input_validation","line":1,"message":"No non-number guard","suggestion":"Validate inputs are numbers"}],"summary":"Typed parameters and guards needed"}`],
  ["human", `File path: {file_path}\n```{language}\n{code}\n```\nConstraints: {constraints}`]
]);
````

### 2) Generate Unit Tests

````ts
export const unitTestPrompt = ChatPromptTemplate.fromMessages([
  ["system", `You write {test_framework} tests for {language}.
- Cover critical paths, edge cases, and error handling.
- Use existing project conventions if visible.
- If code isn't testable as-is, suggest a minimal refactor in a "notes" field.
Output JSON: { files: [{path, contents}], notes?: string }`],
  ["human", `Code under test (path: {file_path}):\n```{language}
{code}
````

Test style: {test_style}\nMocking: {mocking}\nAdditional constraints: {constraints}`]
]);

````

### 3) Safe Refactor
```ts
export const refactorPrompt = ChatPromptTemplate.fromMessages([
  ["system", `You refactor {language} for clarity and safety.
Rules:
- Preserve behavior; no API changes unless requested.
- Improve names, types, purity, and error handling.
- Split large functions; remove dead code.
- Return STRICT JSON: { diff: unified_patch_string, rationale: string }`],
  ["human", `File path: {file_path}\nCurrent code:\n```{language}
{code}
````

Refactor goals: {goals}\nAcceptance criteria: {acceptance}`]
]);

````

### 4) Bug Triage (categorize + suspects)
```ts
export const bugTriagePrompt = ChatPromptTemplate.fromMessages([
  ["system", `You are a bug triage assistant.
Classify severity, category, likely root cause, and list suspected files.
If insufficient detail, set severity="unknown" and suspects=[]
Output JSON only.`],
  ["human", `Bug report:\n---\n{report}\n---\nRecent changes (git diff/summary):\n---\n{recent_changes}\n---\nCode context (optional):\n```{language}
{code_context}
```\nProject areas: {areas}`]
]);
````

### 5) API Design (schema-first)

```ts
export const apiDesignPrompt = ChatPromptTemplate.fromMessages([
  [
    'system',
    `You design HTTP JSON APIs with clear types and errors.
Output STRICT JSON with keys: openapi (YAML string), types (TypeScript string),
notes (string).`,
  ],
  [
    'human',
    `Feature: {feature}\nDomain constraints: {constraints}\nSimilar endpoints (optional):\n{similar}
Non-functional requirements: {nfr}\nReturn: OpenAPI 3.1 (minimal but valid), TS types for requests/responses, notes.`,
  ],
]);
```

### 6) Commit Message (Conventional Commits)

```ts
export const commitMsgPrompt = ChatPromptTemplate.fromMessages([
  [
    'system',
    `You generate a single Conventional Commit message.
Types: feat, fix, docs, style, refactor, test, chore, ci, perf, build.
- Use imperative mood, lowercase, no period.
- If breaking change, add ! and a BREAKING CHANGE: footer.
Output plain text only.`,
  ],
  [
    'human',
    `Diff summary:\n{diff}\nScope: {scope}\nType: {type}\nOptional body details: {details}`,
  ],
]);
```

### 7) Docstring/Comments Generator

````ts
export const docstringPrompt = ChatPromptTemplate.fromMessages([
  ["system", `You add precise docstrings/comments for {language}.
- Describe params, return types, side effects, thrown errors.
- Keep comments synchronized with code behavior.
Output JSON: { commented: string }`],
  ["human", `File path: {file_path}\nCode:\n```{language}
{code}
```\nStyle guide: {style}`]
]);
````

---

## Output Parsing (recommended)

Simple JSON parsing

```ts
import { JsonOutputParser } from '@langchain/core/output_parsers';
const parser = new JsonOutputParser();
const chain = codeReviewPrompt.pipe(model).pipe(parser);
const result = await chain.invoke({
  language: 'ts',
  file_path: 'src/x.ts',
  code,
  constraints: 'security-first',
});
```

Strict schema with Zod (optional)

```ts
import { z } from 'zod';
import { StructuredOutputParser } from '@langchain/core/output_parsers';

const Finding = z.object({
  severity: z.enum(['high', 'medium', 'low']),
  category: z.string(),
  line: z.number().int().nonnegative(),
  message: z.string(),
  suggestion: z.string(),
});
const ReviewSchema = z.object({ findings: z.array(Finding), summary: z.string() });
const reviewParser = StructuredOutputParser.fromZodSchema(ReviewSchema);

const chain = codeReviewPrompt.pipe(model).pipe(reviewParser);
```

---

## Few-shot and History

```ts
import { MessagesPlaceholder } from '@langchain/core/prompts';

export const fewShotExample = ChatPromptTemplate.fromMessages([
  ['system', 'You label bug severity. Output JSON {severity}.'],
  ['human', '`Cannot login` shows 500 after deploy'],
  ['ai', '{"severity":"high"}'],
  new MessagesPlaceholder('history'),
  ['human', '{report}'],
]);
// call with: chain.invoke({ report, history: previousTurns })
```

## Partials (dynamic variables)

```ts
const withNow = codeReviewPrompt.partial({ now: () => new Date().toISOString() });
```

---

## LangChain Hub (community prompts)

- Explore: https://smith.langchain.com/hub
- In JS/TS, you can import/pull prompts and adapt locally.

---

## Usage Pattern Example

```ts
// model example (choose your provider)
import { ChatOpenAI } from '@langchain/openai';
const model = new ChatOpenAI({ model: 'gpt-4o-mini', temperature: 0 });

const parser = new JsonOutputParser();
const chain = codeReviewPrompt.pipe(model).pipe(parser);

const result = await chain.invoke({
  language: 'ts',
  repo_context: 'Monorepo; API at apps/api; shared types in packages/types',
  file_path: 'packages/chatbot/src/chatbot.ts',
  code: 'export function x(a:any,b:any){return a+b}',
  constraints: 'no any, input validation',
});
```

---

## Tips Specific to This Monorepo

- Prefer TS output types aligned with `packages/types` when generating schemas.
- For API designs, target the Express routes in `apps/api/src/routes/*`.
- For tests, align with Vitest/Jest conventions used in `apps/dashboard` and `agent-worker`.
- Respect naming rules in `docs/naming.md` (e.g., SCREAMING_SNAKE for env constants).

---

## Next Steps

- Want these wired into a small helper module (e.g., `packages/prompts/`) with exports and tests? I can scaffold it.
- Prefer stricter parsing? I can add Zod schemas and small validators for each template.
