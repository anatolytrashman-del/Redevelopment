import { supabase } from './supabase';
import { withRetry } from './withRetry';
import type { ObjectComment, ObjectCommentRow } from '../data/objectComments';

function fromRow(row: ObjectCommentRow): ObjectComment {
  return {
    id: row.id,
    objectId: row.object_id,
    text: row.text,
    createdAt: row.created_at,
  };
}

export function fetchComments(objectId: string): Promise<ObjectComment[]> {
  return withRetry(async () => {
    const { data, error } = await supabase
      .from('object_comments')
      .select('*')
      .eq('object_id', objectId)
      .order('created_at', { ascending: true });
    if (error) throw error;
    return (data as ObjectCommentRow[]).map(fromRow);
  });
}

export function addComment(objectId: string, text: string): Promise<ObjectComment> {
  return withRetry(async () => {
    const { data, error } = await supabase
      .from('object_comments')
      .insert({ object_id: objectId, text })
      .select()
      .single();
    if (error) throw error;
    return fromRow(data as ObjectCommentRow);
  });
}
