# Hall of Fame Backend Contract Locks

- Date: 2026-04-13
- Status: approved for implementation
- Scope: lock the remaining backend contract ambiguities before Task 1/2 coding
- Based on:
  - `docs/technical-architecture.md`
  - `docs/implementation-plan.md`
  - `docs/superpowers/specs/2026-04-13-backend-llm-runtime-design.md`

## 1. Goal

This spec locks the small set of backend decisions that would otherwise cause schema and API churn during implementation.

The goal is not to redesign the system. The goal is to make `Task 1` and `Task 2` directly codable.

## 2. Locked Decisions

### 2.1 Publish, review, and share are version-driven

All publish review, publish approval, publish rejection, and share generation must be anchored on `personaVersionId`, not `personaId`.

`personaId` remains the container and list/detail aggregation key. It is not the publish truth key.

V1 endpoint direction:

```text
POST /v1/persona-versions/:personaVersionId/submit-publish-review
POST /v1/reviews/persona-versions/:personaVersionId/approve-publish
POST /v1/reviews/persona-versions/:personaVersionId/reject-publish
POST /v1/persona-versions/:personaVersionId/shares
```

Locked rules:

- a publish review request always targets one concrete candidate version
- publish approval moves that exact version to `published`
- publish success updates `personae.current_published_version_id`
- each published version gets its own primary share identity
- old share links continue pointing to the old published version forever
- V1 does not reuse a previous version's canonical share slug

Recommended implementation detail:

- publishing a version should auto-create the primary share link in the same transaction
- `POST /v1/persona-versions/:personaVersionId/shares` should be idempotent and return the existing primary share for that version when one already exists

### 2.2 Chat must explicitly target a version mode

The chat API must not infer target version semantics implicitly from loose persona context.

V1 chat creation should accept one of three target modes:

- `published_persona`
- `draft_version_preview`
- `share_link`

Recommended request shape:

```json
{
  "targetType": "published_persona",
  "personaId": "per_123"
}
```

```json
{
  "targetType": "draft_version_preview",
  "personaVersionId": "ver_123"
}
```

```json
{
  "targetType": "share_link",
  "shareSlug": "sima-qian-v3"
}
```

Locked rules:

- `published_persona` resolves to `personae.current_published_version_id`
- `draft_version_preview` resolves to the provided draft/candidate version directly
- `share_link` resolves through `share_links.persona_version_id`
- preview chat is only available to the owner or reviewer context
- public chat never silently falls back from published to draft

Suggested chat persistence fields:

- `target_type`
- `target_persona_id`
- `target_persona_version_id`
- `share_link_id`
- `resolved_from_share`

### 2.3 Evidence storage must support reconstruction, not just retrieval

`persona_chunks` alone is not enough if the system needs:

- basis traceability
- conflict detection
- review replay
- published version reconstruction

V1 should model three layers:

1. `persona_sources`
   - user or platform submitted source records
2. `source_documents`
   - normalized fetched/cleaned document snapshots
3. `evidence_spans`
   - quoteable spans with section and position metadata

`persona_chunks` remains the retrieval unit, but it must reference document/span lineage instead of acting as an orphaned text blob.

Minimum structure:

- `source_documents`
  - `source_id`
  - `normalized_text`
  - `title`
  - `author`
  - `published_at`
  - `url`
  - `content_hash`
  - `fetched_at`
- `evidence_spans`
  - `document_id`
  - `section_label`
  - `span_start`
  - `span_end`
  - `normalized_quote`
  - `source_kind`
  - `trust_score`
  - `dedupe_group_id`
  - `conflict_group_id`
- `persona_chunks`
  - `document_id`
  - `primary_span_id`
  - retrieval text
  - `tsvector` / trigram / keyword metadata

Version reconstruction rule:

- each `persona_version` must record the exact approved source/document snapshot set it was built from
- this can be done via a join table such as `persona_version_sources` or an equivalent immutable snapshot reference table

### 2.4 Publish quality gates are hard gates in V1

V1 should use conservative hard thresholds instead of reviewer discretion.

Locked default thresholds:

- `approved_sources >= 5`
- `primary_or_secondary_sources >= 2`
- `coverage_score >= 70`
- `grounding_score >= 80`
- `style_score >= 60`
- `risk_score <= 30`

Hard fail conditions:

- missing approved source minimum
- missing traceable primary/secondary evidence minimum
- version not in publish-review flow
- any unresolved high-risk policy hit
- any source in the candidate snapshot still pending review

Reviewer policy:

- reviewers may reject even if thresholds pass
- reviewers may not override hard thresholds in V1

This keeps V1 deterministic and reduces policy drift between environments.

### 2.5 Official and user personas must be first-class data fields

The product already depends on an explicit official/user distinction in:

- hall listing
- persona header badge
- review policy
- seeding and ops flows

This distinction must live in schema, not in ad hoc conventions.

Minimum `personae` fields:

- `origin_type = OFFICIAL | USER`
- `creator_user_id nullable`
- `listing_status = PRIVATE | UNLISTED | FEATURED | REMOVED`
- `featured_rank nullable`

Locked rules:

- official personas may have `creator_user_id = null`
- official personas can be listed before public user publishing exists
- featured hall queries only read `origin_type = OFFICIAL` plus `listing_status = FEATURED` in V1
- user-created personas require an explicit publish flow before they can produce public shares

### 2.6 Internal operator agent mode is out of V1

V1 does not include a lightweight internal operator agent mode.

Allowed V1 ops tooling:

- review list screens
- review hints
- logs and traces
- eval runs

Disallowed in V1 mainline:

- autonomous source finding agents
- agent-driven publish recommendations
- agent-owned review queues

## 3. Direct Implementation Impact

`Task 2` schema/contracts must now include:

- version-driven publish review routes
- explicit chat target contracts
- official/user persona fields
- source document and evidence span lineage
- hard publish threshold enums/config

`Task 3` and `Task 4` must now assume:

- official hall reads from official/listed personas
- public chat always resolves through a published version
- share landing always resolves to a specific immutable version

`Task 5` and `Task 10` must now assume:

- review acts on exact candidate versions
- publish never promotes an unspecified latest version
- approval cannot bypass hard publish gates

## 4. Final Recommendation

The architecture itself is already stable.

The implementation should now proceed with these locks:

- version-driven publish/review/share
- explicit chat target modes
- document/span evidence lineage
- hard publish thresholds
- first-class official/user modeling
- no operator agent mode in V1

With these decisions fixed, the next coding step should be `Task 1` then `Task 2`, not another architecture pass.
