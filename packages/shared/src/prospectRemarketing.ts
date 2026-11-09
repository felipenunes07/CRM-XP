export interface ProspectRemarketingInput {
  enabled: boolean;
  first: { daysAfterCreation: number; message: string };
  second: { enabled: boolean; daysAfterFirst: number; message: string } | null;
}

export interface ProspectRemarketingSettings extends ProspectRemarketingInput {
  updatedAt: string | null;
}
