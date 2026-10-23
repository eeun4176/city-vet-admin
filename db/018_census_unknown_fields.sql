BEGIN;
ALTER TABLE ekapon.registry_pets ALTER COLUMN sex DROP NOT NULL;
-- Existing false values are preserved. New unknown values can remain unknown.
DO $$ DECLARE tab text; col text; definition text; BEGIN
 FOREACH tab IN ARRAY ARRAY['census_pets','registry_pets'] LOOP
  FOREACH col IN ARRAY ARRAY['sterilized','vaccine_1st','vaccine_2nd','vaccine_3rd','booster','laps'] LOOP
   EXECUTE format('ALTER TABLE ekapon.%I ALTER COLUMN %I DROP NOT NULL, ALTER COLUMN %I DROP DEFAULT',tab,col,col);
  END LOOP;
 END LOOP;
 SELECT pg_get_functiondef('ekapon.decide_census_submission(uuid,text,text)'::regprocedure) INTO definition;
 FOREACH col IN ARRAY ARRAY['sterilized','vaccine_1st','vaccine_2nd','vaccine_3rd','booster','laps'] LOOP
  definition:=replace(definition,col||' = '||col||' OR v_pet.'||col,col||' = CASE WHEN v_pet.'||col||' IS NULL THEN '||col||' WHEN '||col||' IS NULL THEN v_pet.'||col||' ELSE '||col||' OR v_pet.'||col||' END');
 END LOOP;
 EXECUTE definition;
END $$;
COMMIT;
