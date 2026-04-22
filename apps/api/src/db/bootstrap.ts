import { readFile } from "node:fs/promises";

import { listFeaturedPersonae } from "../seed/official-personae.js";
import { getSql } from "./client.js";

let bootstrapPromise: Promise<void> | null = null;

const schemaFileUrl = new URL("./schema.sql", import.meta.url);
const schemaSentinelTable = "persona_version_publish_reviews";
const readPublicWebBaseUrl = () => process.env.PUBLIC_WEB_BASE_URL ?? process.env.APP_BASE_URL ?? "http://localhost:3000";

const syncOfficialSeedShadows = async () => {
  const sql = getSql();
  const seeds = listFeaturedPersonae();

  for (const seed of seeds) {
    await sql.begin(async (tx) => {
      await tx`
        insert into personae (
          id,
          display_name,
          origin_type,
          persona_type,
          listing_status,
          status,
          creator_user_id,
          featured_rank,
          current_draft_version_id,
          current_published_version_id,
          created_at,
          updated_at
        ) values (
          ${seed.persona.id}::uuid,
          ${seed.persona.displayName},
          ${seed.persona.originType},
          ${seed.persona.personaType},
          ${seed.persona.listingStatus},
          ${seed.persona.status},
          null,
          ${seed.persona.featuredRank},
          null,
          null,
          now(),
          now()
        )
        on conflict (id) do update
          set display_name = excluded.display_name,
              origin_type = excluded.origin_type,
              persona_type = excluded.persona_type,
              listing_status = excluded.listing_status,
              status = excluded.status,
              featured_rank = excluded.featured_rank,
              updated_at = now()
      `;

      await tx`
        insert into persona_versions (
          id,
          persona_id,
          version_number,
          status,
          profile_json,
          distill_focus,
          preview_intro,
          recommended_questions,
          sample_answers,
          coverage_score,
          grounding_score,
          style_score,
          risk_score,
          created_by_user_id,
          submitted_for_publish_at,
          published_at,
          superseded_at,
          created_at
        ) values (
          ${seed.version.id}::uuid,
          ${seed.persona.id}::uuid,
          ${seed.version.versionNumber},
          'PUBLISHED',
          ${tx.json(seed.version.profileJson)},
          '[]'::jsonb,
          ${seed.version.previewIntro},
          ${tx.json(seed.version.recommendedQuestions)},
          ${tx.json(seed.version.sampleAnswers)},
          100,
          100,
          100,
          0,
          null,
          now(),
          now(),
          null,
          now()
        )
        on conflict (id) do update
          set persona_id = excluded.persona_id,
              version_number = excluded.version_number,
              status = excluded.status,
              profile_json = excluded.profile_json,
              preview_intro = excluded.preview_intro,
              recommended_questions = excluded.recommended_questions,
              sample_answers = excluded.sample_answers,
              coverage_score = excluded.coverage_score,
              grounding_score = excluded.grounding_score,
              style_score = excluded.style_score,
              risk_score = excluded.risk_score,
              submitted_for_publish_at = excluded.submitted_for_publish_at,
              published_at = excluded.published_at
      `;

      await tx`
        update personae
        set current_published_version_id = ${seed.version.id}::uuid,
            updated_at = now()
        where id = ${seed.persona.id}::uuid
      `;

      await tx`
        insert into share_links (
          id,
          persona_version_id,
          share_slug,
          canonical_url,
          miniapp_path,
          channel_hint,
          is_primary,
          is_active,
          created_at
        ) values (
          ${seed.share.id}::uuid,
          ${seed.version.id}::uuid,
          ${seed.share.shareSlug},
          ${`${readPublicWebBaseUrl()}/share/${seed.share.shareSlug}`},
          ${`/pages/share/index?slug=${encodeURIComponent(seed.share.shareSlug)}`},
          'H5',
          true,
          true,
          now()
        )
        on conflict (id) do update
          set persona_version_id = excluded.persona_version_id,
              share_slug = excluded.share_slug,
              canonical_url = excluded.canonical_url,
              miniapp_path = excluded.miniapp_path,
              channel_hint = excluded.channel_hint,
              is_primary = excluded.is_primary,
              is_active = excluded.is_active
      `;
    });
  }
};

export const resetDatabaseBootstrapForTests = () => {
  bootstrapPromise = null;
};

export const ensureDatabaseSchema = () => {
  if (!bootstrapPromise) {
    bootstrapPromise = (async () => {
      const sql = getSql();
      const existing = await sql<{ exists: string | null }[]>`
        select to_regclass(${`public.${schemaSentinelTable}`}) as exists
      `;

      if (!existing[0]?.exists) {
        const schemaSql = await readFile(schemaFileUrl, "utf8");
        await sql.unsafe(schemaSql);
      }

      await syncOfficialSeedShadows();
    })();
  }

  return bootstrapPromise;
};
