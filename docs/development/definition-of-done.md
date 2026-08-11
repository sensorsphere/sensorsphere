# Definition of Done

A SensorSphere change is considered complete only when the applicable criteria
below are satisfied.

## Scope

- The change has one clear responsibility.
- Unrelated refactoring is excluded.
- Backward compatibility is preserved unless a breaking change is explicitly
  approved and documented.

## Code

- Repository content is written in English.
- Source code follows existing project conventions.
- Comments explain intent rather than restating code.
- TypeScript strict checks pass.
- No new compiler errors are introduced.
- No unexplained warnings are introduced.

## Database

When database changes are involved:

- A versioned migration exists.
- Existing data is preserved.
- The migration is deterministic.
- Required indexes and constraints are defined.
- Destructive schema removal is deferred until consumers have migrated.
- Migration status and migration integrity checks pass.

## API

When API changes are involved:

- Inputs are validated.
- HTTP status codes are explicit and consistent.
- Error messages are written in English.
- Existing endpoint contracts remain compatible.
- The new endpoint is manually or automatically exercised.

## Tests and Validation

- The relevant Docker build succeeds.
- Targeted tests pass when available.
- A functional verification command is documented.
- Error paths relevant to the feature are verified.
- `git apply --check` succeeds for delivered patches.

## Documentation

When applicable:

- The backlog is updated.
- The release plan is updated.
- Architectural decisions are recorded in an ADR.
- User-facing or developer-facing documentation is updated.

## Git

- The patch is reviewable and limited in scope.
- The working tree contains no unintended changes from the patch.
- Commit messages use English and follow Conventional Commit style.

Examples:

```text
feat(locations): add move endpoint
fix(db): prevent migration stdin consumption
docs(adr): document location hierarchy
```

## Completion Rule

A feature MUST NOT be marked as done only because it compiles.

It is done when its expected behavior has been demonstrated and its relevant
failure cases have been checked.
