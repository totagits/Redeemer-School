-- Recruitment is private to the school's HR and authorized leadership routes.
CREATE TABLE hr_vacancies (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 school_id uuid NOT NULL REFERENCES schools(id),
 code text NOT NULL,
 title text NOT NULL,
 department text NOT NULL,
 description text NOT NULL,
 requirements text NOT NULL,
 positions integer NOT NULL CHECK(positions BETWEEN 1 AND 100),
 closing_on date NOT NULL,
 status text NOT NULL DEFAULT 'DRAFT' CHECK(status IN ('DRAFT','APPROVED','OPEN','CLOSED')),
 created_by uuid NOT NULL,
 approved_by uuid,
 approved_at timestamptz,
 revision integer NOT NULL DEFAULT 1,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(school_id,id),
 UNIQUE(school_id,code),
 FOREIGN KEY(school_id,created_by) REFERENCES user_accounts(school_id,id),
 FOREIGN KEY(school_id,approved_by) REFERENCES user_accounts(school_id,id),
 CHECK(approved_by IS NULL OR approved_by<>created_by)
);
CREATE TABLE hr_applications (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 school_id uuid NOT NULL,
 vacancy_id uuid NOT NULL,
 first_name text NOT NULL,
 last_name text NOT NULL,
 email text NOT NULL CHECK(email=lower(btrim(email))),
 phone text NOT NULL DEFAULT '',
 qualifications text NOT NULL,
 status text NOT NULL DEFAULT 'APPLIED' CHECK(status IN (
 'APPLIED','SHORTLISTED','INTERVIEW_SCHEDULED','INTERVIEWED','RECOMMENDED',
 'APPROVED','DECLINED','OFFERED','ACCEPTED','WITHDRAWN','ONBOARDED')),
 created_by uuid NOT NULL,
 recommended_by uuid,
 approved_by uuid,
 approved_at timestamptz,
 offer_reference text,
 employee_number text,
 starts_on date,
 onboarding_checks jsonb NOT NULL DEFAULT '{}'::jsonb,
 staff_record_id uuid,
 revision integer NOT NULL DEFAULT 1,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(school_id,id),
 UNIQUE(school_id,vacancy_id,email),
 UNIQUE(school_id,staff_record_id),
 FOREIGN KEY(school_id,vacancy_id) REFERENCES hr_vacancies(school_id,id),
 FOREIGN KEY(school_id,created_by) REFERENCES user_accounts(school_id,id),
 FOREIGN KEY(school_id,recommended_by) REFERENCES user_accounts(school_id,id),
 FOREIGN KEY(school_id,approved_by) REFERENCES user_accounts(school_id,id),
 FOREIGN KEY(school_id,staff_record_id) REFERENCES staff_records(school_id,id),
 CHECK(approved_by IS NULL OR (recommended_by IS NOT NULL AND approved_by<>recommended_by)),
 CHECK((status='ONBOARDED')=(staff_record_id IS NOT NULL))
);
CREATE TABLE hr_interviews (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 school_id uuid NOT NULL,
 application_id uuid NOT NULL,
 scheduled_at timestamptz NOT NULL,
 interviewer text NOT NULL,
 venue text NOT NULL,
 status text NOT NULL DEFAULT 'SCHEDULED' CHECK(status IN ('SCHEDULED','COMPLETED','CANCELLED')),
 feedback text NOT NULL DEFAULT '',
 recorded_by uuid NOT NULL,
 completed_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(school_id,id),
 FOREIGN KEY(school_id,application_id) REFERENCES hr_applications(school_id,id),
 FOREIGN KEY(school_id,recorded_by) REFERENCES user_accounts(school_id,id),
 CHECK(status<>'COMPLETED' OR (completed_at IS NOT NULL AND char_length(feedback)>=10))
);
CREATE TABLE hr_recruitment_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 school_id uuid NOT NULL,
 vacancy_id uuid NOT NULL,
 application_id uuid,
 actor_user_id uuid NOT NULL,
 action text NOT NULL,
 note text NOT NULL DEFAULT '',
 created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(school_id,vacancy_id) REFERENCES hr_vacancies(school_id,id),
 FOREIGN KEY(school_id,application_id) REFERENCES hr_applications(school_id,id),
 FOREIGN KEY(school_id,actor_user_id) REFERENCES user_accounts(school_id,id)
);
CREATE INDEX hr_applications_pipeline_idx ON hr_applications(school_id,vacancy_id,status,created_at);
CREATE INDEX hr_interviews_application_idx ON hr_interviews(school_id,application_id,scheduled_at);
CREATE INDEX hr_recruitment_history_idx ON hr_recruitment_events(school_id,vacancy_id,created_at,id);
DO $$
DECLARE table_name text;
BEGIN
 FOREACH table_name IN ARRAY ARRAY['hr_vacancies','hr_applications','hr_interviews','hr_recruitment_events'] LOOP
  EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',table_name);
  EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',table_name);
  EXECUTE format('CREATE POLICY tenant_school_scope ON %I USING(school_id=app.current_school_id()) WITH CHECK(school_id=app.current_school_id())',table_name);
 END LOOP;
END $$;
GRANT SELECT,INSERT,UPDATE ON hr_vacancies,hr_applications,hr_interviews TO redeemer_runtime;
GRANT SELECT,INSERT ON hr_recruitment_events TO redeemer_runtime;
