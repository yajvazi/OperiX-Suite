import type { SupabaseClient } from "@supabase/supabase-js";
import type { EntityLinkResult } from "./types";

export async function claimSourceLink(
  db: SupabaseClient,
  input: {
    organizationId: string;
    sourceSystem: string;
    sourceEntityType: string;
    sourceEntityId: string;
    targetSystem: string;
    targetEntityType: string;
  },
): Promise<{ owner: boolean; id?: string; existing?: EntityLinkResult }> {
  const { data: existing, error: lookupError } = await db
    .from("integration_entity_links")
    .select("id,target_entity_id,sync_status,last_error")
    .eq("organization_id", input.organizationId)
    .eq("source_system", input.sourceSystem)
    .eq("source_entity_type", input.sourceEntityType)
    .eq("source_entity_id", input.sourceEntityId)
    .maybeSingle();
  if (lookupError) throw new Error(`Entity link lookup failed: ${lookupError.message}`);
  if (existing) {
    return {
      owner: false,
      id: String(existing.id),
      existing: {
        status: existing.sync_status as EntityLinkResult["status"],
        sourceEntityId: input.sourceEntityId,
        targetEntityId: existing.target_entity_id ? String(existing.target_entity_id) : undefined,
        error: existing.last_error ? String(existing.last_error) : undefined,
      },
    };
  }

  const { data: created, error: createError } = await db
    .from("integration_entity_links")
    .insert({ ...input, sync_status: "processing" })
    .select("id")
    .single();
  if (!createError && created) return { owner: true, id: String(created.id) };

  if (createError?.code === "23505") {
    const { data: raced } = await db
      .from("integration_entity_links")
      .select("id,target_entity_id,sync_status,last_error")
      .eq("organization_id", input.organizationId)
      .eq("source_system", input.sourceSystem)
      .eq("source_entity_type", input.sourceEntityType)
      .eq("source_entity_id", input.sourceEntityId)
      .maybeSingle();
    if (raced) {
      return {
        owner: false,
        id: String(raced.id),
        existing: {
          status: raced.sync_status as EntityLinkResult["status"],
          sourceEntityId: input.sourceEntityId,
          targetEntityId: raced.target_entity_id ? String(raced.target_entity_id) : undefined,
          error: raced.last_error ? String(raced.last_error) : undefined,
        },
      };
    }
  }
  throw new Error(`Entity link claim failed: ${createError?.message || "unknown error"}`);
}

export async function updateLink(
  db: SupabaseClient,
  id: string,
  update: { targetEntityId?: string; status: EntityLinkResult["status"]; error?: string; metadata?: Record<string, unknown> },
) {
  const { error } = await db
    .from("integration_entity_links")
    .update({
      target_entity_id: update.targetEntityId ?? null,
      sync_status: update.status,
      last_error: update.error ?? null,
      last_synced_at: update.status === "linked" ? new Date().toISOString() : null,
      metadata: update.metadata || {},
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) throw new Error(`Entity link update failed: ${error.message}`);
}
