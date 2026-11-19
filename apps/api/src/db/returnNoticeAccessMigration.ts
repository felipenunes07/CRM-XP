export const returnNoticeAccessMigration=`
 CREATE TABLE return_notice_sender_access(
  instance_id UUID NOT NULL REFERENCES whatsapp_instances(id),user_id UUID NOT NULL REFERENCES profiles(id),
  granted_by UUID NOT NULL REFERENCES profiles(id),reason TEXT NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY(instance_id,user_id)
 );
`;
