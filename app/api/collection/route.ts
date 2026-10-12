import type { NextRequest } from 'next/server';
import { z } from 'zod';

import { RARITIES } from '@/lib/config';
import { ApiError, handleApi } from '@/lib/server/api-helpers';
import { asDto } from '@/lib/server/dto';
import type { Json } from '@/types/database';
import type { GetCollectionResponse } from '@/types/api';

/**
 * GET /api/collection — collection paginée par curseur (PAS d'offset),
 * filtres et tri exécutés côté SQL (un seul RPC, cf. MIGRATIONS.md).
 *
 * Le curseur est opaque pour le client : jsonb { id, k } encodé en
 * base64url, produit et consommé exclusivement par la RPC.
 */

// NOTE : ce schéma de query est utilisé côté client (Agent B) pour ses
// appels — il devra migrer dans lib/validations/ (fichier Agent 0, en
// lecture seule pour A) : demande correspondante dans HANDOFF.md.
const emptyToUndefined = (v: unknown) => (v === '' ? undefined : v);

const collectionQuerySchema = z.object({
  cursor: z.preprocess(emptyToUndefined, z.string().max(512).optional()),
  limit: z.coerce.number().int().min(1).max(100).default(24),
  theme: z.preprocess(emptyToUndefined, z.string().min(1).max(64).optional()),
  rarity: z.preprocess(emptyToUndefined, z.enum(RARITIES).optional()),
  search: z.preprocess(emptyToUndefined, z.string().min(1).max(100).optional()),
  sort: z.enum(['recent', 'rarity', 'print_number', 'name']).default('recent'),
});

type CollectionQuery = z.infer<typeof collectionQuerySchema>;

function decodeCursor(cursor: string): Json {
  try {
    const decoded: unknown = JSON.parse(
      Buffer.from(cursor, 'base64url').toString('utf8'),
    );
    if (typeof decoded !== 'object' || decoded === null) throw new Error('bad shape');
    return decoded as Json;
  } catch {
    throw new ApiError('VALIDATION_ERROR');
  }
}

export async function GET(request: NextRequest) {
  return handleApi<CollectionQuery>(request, {
    route: '/api/collection',
    schema: collectionQuerySchema,
    parseFrom: 'query',
    run: async ({ supabase, user }, query) => {
      const { data, error } = await supabase.rpc('get_collection_page', {
        p_user: user.id,
        p_cursor: query.cursor ? decodeCursor(query.cursor) : undefined,
        p_limit: query.limit,
        p_theme: query.theme ?? undefined,
        p_rarity: query.rarity ?? undefined,
        p_search: query.search ?? undefined,
        p_sort: query.sort,
      });
      if (error) throw error;
      return { body: asDto<GetCollectionResponse>(data) };
    },
  });
}
