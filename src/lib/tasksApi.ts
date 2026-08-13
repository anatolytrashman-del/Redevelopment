import { supabase } from './supabase';
import { withRetry } from './withRetry';
import type { Task, TaskRow } from '../data/tasks';

function fromRow(row: TaskRow): Task {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    date: row.date,
    assignee: row.assignee as Task['assignee'],
    isDone: row.is_done,
    result: row.result,
  };
}

export function fetchTasks(): Promise<Task[]> {
  return withRetry(async () => {
    const { data, error } = await supabase.from('tasks').select('*').order('date', { ascending: true });
    if (error) throw error;
    return (data as TaskRow[]).map(fromRow);
  });
}

export function insertTask(input: Omit<Task, 'id'>): Promise<Task> {
  return withRetry(async () => {
    const { data, error } = await supabase
      .from('tasks')
      .insert({
        title: input.title,
        description: input.description,
        date: input.date,
        assignee: input.assignee,
        is_done: input.isDone,
        result: input.result,
      })
      .select()
      .single();

    if (error) throw error;
    return fromRow(data as TaskRow);
  });
}

export function updateTask(id: string, input: Omit<Task, 'id'>): Promise<Task> {
  return withRetry(async () => {
    const { data, error } = await supabase
      .from('tasks')
      .update({
        title: input.title,
        description: input.description,
        date: input.date,
        assignee: input.assignee,
        is_done: input.isDone,
        result: input.result,
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return fromRow(data as TaskRow);
  });
}

export function deleteTask(id: string): Promise<void> {
  return withRetry(async () => {
    const { error } = await supabase.from('tasks').delete().eq('id', id);
    if (error) throw error;
  });
}
