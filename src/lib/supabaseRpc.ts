import { supabase } from "@/integrations/supabase/client";

export interface RpcResult {
  data: unknown;
  error: { message: string } | null;
}

/** The one method of the Supabase client the resale code needs, so tests can pass a fake. */
export type RpcCaller = (name: string, args: Record<string, unknown>) => Promise<RpcResult>;

type LooseRpcClient = {
  rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { message: string } | null }>;
};

/**
 * Calls a Postgres function that the generated types in src/integrations/supabase/types.ts don't know yet
 * (resale_listings, start_listing_conversation, ...). The result stays `unknown`: each caller parses it.
 */
export const callRpc: RpcCaller = async (name, args) => {
  const { data, error } = await (supabase as unknown as LooseRpcClient).rpc(name, args);
  return { data, error: error ? { message: error.message } : null };
};
