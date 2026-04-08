import type { CreateReminderInput } from './reminders.types.js';
import { RemindersRepository } from './reminders.repository.js';

export class RemindersService {
  constructor(private readonly remindersRepository: RemindersRepository) {}

  list() {
    return this.remindersRepository.list();
  }

  create(input: CreateReminderInput) {
    return this.remindersRepository.create(input);
  }

  markDone(id: number) {
    return this.remindersRepository.markDone(id);
  }
}

