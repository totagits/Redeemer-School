// A committed SENDING claim must precede every external send. Uncertain outcomes
// and abandoned claims require investigation; they are never automatically retried.
export async function claimAnnouncementSms(client,{schoolId,announcementId,userId}){
 await client.query(`UPDATE notification_deliveries d SET status='CANCELLED',error_code='CONSENT_OR_AUDIENCE_CHANGED'
  WHERE d.school_id=$1 AND d.announcement_id=$2 AND d.channel='SMS' AND d.status='QUEUED' AND NOT EXISTS (
   SELECT 1 FROM announcements a
   JOIN student_guardians sg ON sg.school_id=a.school_id AND sg.communication_consent=true
   JOIN guardians g ON g.school_id=sg.school_id AND g.id=sg.guardian_id AND g.active
   JOIN students st ON st.school_id=sg.school_id AND st.id=sg.student_id
   LEFT JOIN class_enrollments ce ON ce.school_id=sg.school_id AND ce.student_id=sg.student_id AND ce.status='ACTIVE'
   WHERE a.school_id=d.school_id AND a.id=d.announcement_id AND a.status='PUBLISHED'
    AND g.id=d.guardian_id AND g.phone=d.recipient_ref
    AND (a.audience='ALL_GUARDIANS' OR (a.audience='CLASS' AND ce.class_group_id=a.class_group_id)
     OR (a.audience='CAMPUS' AND (a.campus_id IS NULL OR st.campus_id=a.campus_id))))`,[schoolId,announcementId]);
 return client.query(`WITH candidates AS (
   SELECT id FROM notification_deliveries WHERE school_id=$1 AND announcement_id=$2 AND channel='SMS' AND status='QUEUED'
   ORDER BY queued_at,id LIMIT 300 FOR UPDATE SKIP LOCKED
  ) UPDATE notification_deliveries d SET status='SENDING',dispatch_reference=gen_random_uuid(),dispatch_started_at=now(),dispatched_by=$3,error_code=NULL
   FROM candidates c WHERE d.id=c.id AND d.school_id=$1 RETURNING d.id,d.recipient_ref,d.dispatch_reference`,[schoolId,announcementId,userId]);
}

export async function dispatchClaimedSms({deliveries,schoolId,announcementId,message,userId,sendSms,transaction}){
 let sent=0,unknown=0,unrecorded=0;
 for(const delivery of deliveries){
  let providerMessageId=null,status='UNKNOWN';
  try{const result=await sendSms({to:delivery.recipient_ref,message,dispatchReference:delivery.dispatch_reference});providerMessageId=result?.providerMessageId||null;status='SENT';}catch{ /* A rejected promise is not proof the provider did not accept the send. */ }
  try{
   await transaction(async client=>{
    const updated=await client.query(`UPDATE notification_deliveries SET status=$4,provider_message_id=$5,sent_at=CASE WHEN $4='SENT' THEN now() ELSE sent_at END,error_code=CASE WHEN $4='UNKNOWN' THEN 'PROVIDER_OUTCOME_UNCONFIRMED' ELSE NULL END
      WHERE school_id=$1 AND id=$2 AND dispatch_reference=$3 AND status='SENDING' RETURNING id`,[schoolId,delivery.id,delivery.dispatch_reference,status,providerMessageId]);
    if(updated.rowCount!==1)throw new Error('SMS claim changed.');
    await client.query(`INSERT INTO audit_events(school_id,actor_user_id,action,entity_type,entity_id,details) VALUES($1,$2,$3,'NOTIFICATION',$4,$5::jsonb)`,
     [schoolId,userId,'SMS_DISPATCH_'+status,delivery.id,JSON.stringify({announcementId,dispatchReference:delivery.dispatch_reference})]);
   });
   if(status==='SENT')sent++;else unknown++;
  }catch{
   // The durable claim remains SENDING if the outcome transaction cannot commit.
   // Never repeat the external request to repair a database or network failure.
   unrecorded++;
  }
 }
 return {sent,unknown,unrecorded,failed:0,notice:`SMS dispatch: ${sent} accepted by the provider; ${unknown} outcome(s) unknown; ${unrecorded} result(s) could not be saved. Unknown outcomes and unfinished sends require manual review and are not retried. Provider acceptance is not confirmation of delivery.`};
}
