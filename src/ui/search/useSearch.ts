import type { Journal } from "../../storage/db";
import type { SearchHit } from "../../domain/types";
import { keywordSearch } from "../../search/fts";
import { semanticSearch } from "../../search/semantic";
import { useAsyncQuery, useQuery } from "../../state/hooks";
import type { SearchMode, SearchState } from "./params";
import { toFilters } from "./params";

export interface SearchOutcome {
  /** Ranked hits before dedupe/grouping. */
  hits: SearchHit[];
  /** Which engine produced `hits`. */
  answered: SearchMode;
  /** Meaning mode was requested but the local model could not answer. */
  fellBack: boolean;
  /** Meaning mode is still waiting on the local model. */
  loading: boolean;
}

function applyScope(hits: SearchHit[], state: SearchState): SearchHit[] {
  if (state.convictions !== "only") return hits;
  return hits.filter((h) => h.kind === "conviction");
}

function runKeyword(j: Journal, state: SearchState): SearchHit[] {
  if (!state.q) return [];
  return applyScope(keywordSearch(j, state.q, toFilters(state)), state);
}

async function runSemantic(j: Journal, state: SearchState, wanted: boolean): Promise<SearchHit[] | null> {
  if (!wanted || !state.q) return null;
  const hits = await semanticSearch(j, state.q, toFilters(state));
  return hits ? applyScope(hits, state) : null;
}

/**
 * Keyword results are synchronous and always computed; meaning results are fetched when
 * requested and available. Null from `semanticSearch` means the local model is off or
 * unreachable, in which case keyword results answer instead.
 */
export function useSearch(state: SearchState, aiEnabled: boolean): SearchOutcome {
  const wantSemantic = aiEnabled && state.mode === "semantic";
  const filterKey = [state.q, state.from, state.to, state.types.join(","), state.tags.join(","), state.favorites, state.convictions];
  const keyword = useQuery((j) => runKeyword(j, state), filterKey, ["entries", "convictions"]);
  const semantic = useAsyncQuery((j) => runSemantic(j, state, wantSemantic), [...filterKey, wantSemantic], ["entries", "convictions", "embeddings", "settings"]);

  if (!wantSemantic || !state.q) return { hits: keyword, answered: "keyword", fellBack: false, loading: false };
  if (semantic.loading) return { hits: [], answered: "semantic", fellBack: false, loading: true };
  if (semantic.data === null) return { hits: keyword, answered: "keyword", fellBack: true, loading: false };
  return { hits: semantic.data, answered: "semantic", fellBack: false, loading: false };
}
