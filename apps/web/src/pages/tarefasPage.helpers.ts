export const TASK_TEAM_PERSON_ID = "team";

type ListContext = {
  manager: boolean;
  adminScope: "mine" | "all";
  listScope: "received" | "created";
  currentUserId: string;
};

export function taskBelongsToList(
  task: { personIds: string[]; createdByUserId: string },
  context: ListContext,
) {
  if (context.manager && context.adminScope === "all") return true;

  const assignedToCurrentUser = task.personIds.includes(context.currentUserId);
  if (context.listScope === "received") {
    return assignedToCurrentUser || task.personIds.includes(TASK_TEAM_PERSON_ID);
  }

  return !assignedToCurrentUser && task.createdByUserId === context.currentUserId;
}

export function personBelongsToList(personId: string, context: ListContext) {
  if (context.manager && context.adminScope === "all") return true;
  if (context.listScope === "received") {
    return personId === context.currentUserId || personId === TASK_TEAM_PERSON_ID;
  }
  return personId !== context.currentUserId;
}
