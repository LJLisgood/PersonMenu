import type { RecipeDetail, Recipe } from '../src/types';

export type Publication = 'draft' | 'published' | 'deleted';
export type RecipeRecord = {
  id: string;
  document: RecipeDetail;
  original_document: RecipeDetail | null;
  state: Publication;
  revision: number;
  updated_at: string;
  upstream_commit: string | null;
};
export type RequestKind = 'meal' | 'wish' | 'submission';
export type RequestState = 'pending' | 'accepted' | 'rejected' | 'completed' | 'cancelled';
export type KitchenRequest = {
  id: string;
  owner_id: string;
  kind: RequestKind;
  nickname: string;
  contact_email: string | null;
  payload: {
    recipeIds?: string[];
    dishes?: { id: string; name: string }[];
    date?: string;
    meal?: 'lunch' | 'dinner';
    people?: number;
    title?: string;
    reference?: string;
    notes?: string;
    recipe?: RecipeDetail;
  };
  state: RequestState;
  admin_note: string;
  created_at: string;
  updated_at: string;
};
export type Notification = {
  id: string;
  request_id: string;
  state: 'pending' | 'sending' | 'sent' | 'failed' | 'review';
  attempts: number;
  last_error: string | null;
  created_at: string;
};
export type CloudConfig = {
  enabled: boolean;
  supabaseUrl?: string;
  publishableKey?: string;
  turnstileSiteKey?: string;
};
export type CloudRecipe = Recipe & { searchBody?: string };
export const requestLabels: Record<RequestKind, string> = {
  meal: '点菜',
  wish: '新菜心愿',
  submission: '菜谱投稿',
};
export const stateLabels: Record<RequestState, string> = {
  pending: '待处理',
  accepted: '已接受',
  rejected: '未采纳',
  completed: '已完成',
  cancelled: '已取消',
};
