export interface Reminder {
  id: number;
  title: string;
  notes: string | null;
  dueAt: string | null;
  isDone: boolean;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
}

export interface CreateReminderInput {
  title: string;
  notes?: string;
  dueAt?: string;
}

