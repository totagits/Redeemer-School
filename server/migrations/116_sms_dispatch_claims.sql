ALTER TABLE notification_deliveries DROP CONSTRAINT notification_deliveries_status_check;
ALTER TABLE notification_deliveries ADD CONSTRAINT notification_deliveries_status_check CHECK(status IN ('QUEUED','SENDING','UNKNOWN','SENT','DELIVERED','FAILED','CANCELLED'));
ALTER TABLE notification_deliveries ADD COLUMN dispatch_reference uuid;
ALTER TABLE notification_deliveries ADD COLUMN dispatch_started_at timestamptz;
ALTER TABLE notification_deliveries ADD COLUMN dispatched_by uuid;
ALTER TABLE notification_deliveries ADD FOREIGN KEY(school_id,dispatched_by) REFERENCES user_accounts(school_id,id);
CREATE UNIQUE INDEX sms_dispatch_reference_unique ON notification_deliveries(dispatch_reference) WHERE dispatch_reference IS NOT NULL;
