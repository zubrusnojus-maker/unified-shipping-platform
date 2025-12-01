# Repository Naming & Identifier Conventions

This document defines consistent naming standards across the unified-shipping-platform monorepo. Apply these rules to all new code. Refactor legacy code opportunistically or as part of dedicated cleanup tasks.

---

## 1. Files & Directories

- Use kebab-case (lowercase, hyphen separated): `shipping-providers`, `agent-manager`, `memory-store.ts`.
- Test files: `<name>.test.ts` or `<name>.spec.ts` (prefer `.test.ts`).
- Configuration files retain canonical names: `tsconfig.json`, `docker-compose.yml`, `turbo.json`.
- Avoid camelCase or PascalCase filenames unless required by external tooling.

## 2. Imports & Exports

- Exported symbols intended for external package use: PascalCase for types/classes; camelCase for functions/instances.
- Barrel files named `index.ts` only. No deep wildcard re-exports unless intentionally curated.
- Prefer explicit exports over default exports for shared packages.

## 3. TypeScript Identifiers

| Category            | Style                                                                           | Example                        |
| ------------------- | ------------------------------------------------------------------------------- | ------------------------------ |
| Classes             | PascalCase                                                                      | `ShippingProviderFactory`      |
| Interfaces / Types  | PascalCase                                                                      | `ShipmentRate`, `MemoryRecord` |
| Generic Params      | Descriptive PascalCase                                                          | `Result`, `Context`            |
| Functions           | camelCase                                                                       | `fetchRates`, `createTask`     |
| Variables           | camelCase                                                                       | `queueName`, `originAddress`   |
| Private module vars | camelCase + leading underscore only if semantically hidden                      | `_buildCache`                  |
| Constants           | SCREAMING_SNAKE_CASE                                                            | `DEFAULT_TIMEOUT_MS`           |
| Enums               | PascalCase (members PascalCase or SCREAMING_SNAKE if external protocol mapping) |

## 4. Environment Variables

- Style: SCREAMING_SNAKE_CASE.
- Prefix by domain when meaningful:
  - Shipping providers: `EASYPOST_`, `EASYSHIP_`, `N8N_`.
  - Shipper defaults: `SHIPPER_...`.
  - Database: `PGHOST`, `PGPORT`, `PGUSER`, etc. (keep PostgreSQL conventions).
  - Agents / queues: `AGENT_QUEUE_NAME`, `WORKER_CONCURRENCY`, `MANAGER_CONCURRENCY`.
  - Feature flags: `FEATURE_<NAME>` (boolean semantics; treat `'1'`, `'true'` case-insensitive as enabled).
  - Boolean toggles alternative: `ENABLE_<THING>` or `DISABLE_<THING>` (choose enable form unless inversion is clearer).
- Common semantic groups:
  - Units: `<PROVIDER>_WEIGHT_UNIT`, `<PROVIDER>_DIMENSION_UNIT`.
  - Mode: `<PROVIDER>_MODE` values: `production` or `sandbox/test`.
  - Currency fallback: `SHIPPING_DEFAULT_CURRENCY` → applied when provider currency unset.
- Avoid redundant synonyms. Prefer singular canonical form (see Deprecations).
- Never embed secrets in code—only access via `process.env` inside dedicated env modules.

### Access Pattern

Wrap `process.env` access in a domain-specific env module to centralize parsing, coercion, defaults, and validation. Example (shipping providers):

```ts
export const shippingEnv = {
  easypost: {
    apiKey: process.env.EASYPOST_API_KEY ?? '',
    mode: process.env.EASYPOST_MODE === 'production' ? 'production' : 'test',
    labelFormat: process.env.EASYPOST_LABEL_FORMAT as string | undefined,
  },
  easyship: {
    apiKey: process.env.EASYSHIP_API_KEY ?? '',
    mode: process.env.EASYSHIP_MODE === 'production' ? 'production' : 'sandbox',
    weightUnit: process.env.EASYSHIP_WEIGHT_UNIT || process.env.EASYSHIP_UNITS_WEIGHT || 'kg',
    dimensionUnit:
      process.env.EASYSHIP_DIMENSION_UNIT || process.env.EASYSHIP_UNITS_DIMENSIONS || 'cm',
  },
};
```

## 5. Constants

- Use SCREAMING_SNAKE_CASE; append type hints when units matter: `MAX_LABEL_RETRY_ATTEMPTS`, `DIMENSION_UNIT_CM`, `WEIGHT_UNIT_KG`.
- Timeout/duration constants should include unit suffix: `_MS`, `_SEC`, `_MIN`.

## 6. Concurrency & Numeric Parsing

- Parse integers with explicit radix and validation wrapper (centralize if repeated).
- Environment-derived numbers must default safely: `parseInt(process.env.WORKER_CONCURRENCY || '1', 10)`.

## 7. Deprecated Identifiers

The following environment variable names are deprecated; retain read fallback for one release cycle, log a warning if used.
| Deprecated | Replacement | Removal Target |
|-------------------------------|------------------------------|----------------|
| `EASYSHIP_UNITS_WEIGHT` | `EASYSHIP_WEIGHT_UNIT` | v1.1.0 |
| `EASYSHIP_UNITS_DIMENSIONS` | `EASYSHIP_DIMENSION_UNIT` | v1.1.0 |
| `POSTGRES_PASSWORD` (legacy) | `PGPASSWORD` | v1.1.0 |

Additions may extend this list; keep table sorted alphabetically by deprecated name.

## 8. Logging & Warnings

- Emit a single aggregated warning at startup listing any deprecated env vars detected.
- Do not spam logs—deduplicate by variable name.

## 9. Lint Enforcement

Adopt `@typescript-eslint/naming-convention` with rules:

- `typeLike`: PascalCase
- `variable`: camelCase or SCREAMING_SNAKE_CASE (for const, readonly, or top-level)
- `enumMember`: PascalCase
- For future: custom rule to flag direct `process.env.X` usage outside env modules.

## 10. Migration Strategy

1. Introduce env accessor modules (shipping, agents, database, manager).
2. Replace direct `process.env` usages with module imports.
3. Add deprecation warning logic.
4. Enforce linting & run CI.
5. Remove deprecated fallbacks after target version release.

## 11. Exceptions

- External library-required names (e.g., `NODE_ENV`) remain unchanged.
- Docker / Compose variable names may follow container ecosystem norms.

## 12. Checklist for New Additions

- Does the identifier match its category style? (See section 3.)
- Are env variables domain-prefixed and singular? (No synonyms.)
- Are defaults safe and explicit?
- Are units specified? (If applicable.)
- Is a deprecated alias avoided? (Consult table.)

---

## Quick Reference

- Files: kebab-case
- Classes/Types: PascalCase
- Functions/Variables: camelCase
- Constants/Env: SCREAMING_SNAKE_CASE
- Feature Flags: `FEATURE_<NAME>` or `ENABLE_<NAME>`
- Deprecated EasyShip unit vars: use new singular forms.

Keep this document updated as conventions evolve.
