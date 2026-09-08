export type Person = {
  id: string;
  name: string;
  photo: string | null;
  position: number;
};
export type Task = {
  id: string;
  title: string;
  notes: string;
  person_id: string;
  due_date: string;
  due_time: string | null;
  deadline: number;
  status: 'todo' | 'doing' | 'done';
  created_at: string;
  completed_at: string | null;
  version: number;
};
export type BoardData = {
  people: Person[];
  tasks: Task[];
  role: 'manager' | 'team';
  teamKey?: string;
};
// A ordem é fixa: o id de cada pessoa semeada é `initial-<índice>`, então
// nomes novos entram SEMPRE no fim — reordenar remontaria os ids e duplicaria
// quem já existe no banco.
export const names = [
  'Thais',
  'Suelen',
  'Amanda',
  'Lucas',
  'Camila',
  'Pedro',
  'Iza',
  'Tamires',
];
export function brazilDate(d = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}
export function late(t: Task) {
  return t.status !== 'done' && t.deadline < Date.now();
}
export function weekStart() {
  const d = new Date(brazilDate() + 'T00:00:00-03:00');
  const day = new Date(brazilDate() + 'T12:00:00Z').getUTCDay();
  return d.getTime() - ((day + 6) % 7) * 86400000;
}
