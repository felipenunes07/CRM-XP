import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';
export const people = sqliteTable('people', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  photo: text('photo'),
  position: integer('position').notNull(),
});
export const tasks = sqliteTable(
  'tasks',
  {
    id: text('id').primaryKey(),
    title: text('title').notNull(),
    notes: text('notes').notNull().default(''),
    personId: text('person_id')
      .notNull()
      .references(() => people.id),
    dueDate: text('due_date').notNull(),
    dueTime: text('due_time'),
    deadline: integer('deadline').notNull(),
    status: text('status').notNull().default('todo'),
    createdAt: text('created_at').notNull(),
    completedAt: text('completed_at'),
    version: integer('version').notNull().default(1),
  },
  (t) => [index('idx_tasks_person').on(t.personId)],
);
