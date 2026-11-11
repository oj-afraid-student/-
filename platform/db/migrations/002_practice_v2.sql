-- Map 001 rows in place. Existing IDs, foreign keys and legacy source columns are preserved.
ALTER TABLE question_version
  ADD COLUMN public_question jsonb,
  ADD COLUMN reference_answer jsonb,
  ADD COLUMN grading jsonb,
  ADD COLUMN source jsonb,
  ALTER COLUMN knowledge_point_id DROP NOT NULL,
  ALTER COLUMN stem DROP NOT NULL,
  ALTER COLUMN options DROP NOT NULL,
  ALTER COLUMN correct_option_id DROP NOT NULL,
  ALTER COLUMN explanation DROP NOT NULL;

UPDATE question_version
SET public_question = jsonb_build_object(
      'id', question_key, 'version', version, 'title', question_key, 'stem', stem,
      'type', 'SINGLE_CHOICE', 'difficulty', 'BASIC',
      'knowledgeIds', jsonb_build_array(knowledge_point_id),
      'unitIds', jsonb_build_array(knowledge_point_id),
      'figures', CASE WHEN figure IS NULL THEN '[]'::jsonb ELSE jsonb_build_array(
        jsonb_build_object(
          'id', coalesce(figure->>'id', question_key || '-figure'),
          'src', coalesce(figure->>'src', ''),
          'alt', coalesce(figure->>'alt', ''),
          'caption', coalesce(figure->>'caption', '')
        )
      ) END,
      'sourceLabel', source_note, 'options', options
    ),
    reference_answer = jsonb_build_object(
      'answerText', correct_option_id,
      'explanation', coalesce((SELECT string_agg(step, E'\n' ORDER BY ordinal)
                      FROM jsonb_array_elements_text(explanation->'steps')
                        WITH ORDINALITY AS steps(step, ordinal)), '')
    ),
    grading = jsonb_build_object('mode', 'CHOICE_SET',
      'correctOptionIds', jsonb_build_array(correct_option_id));

ALTER TABLE question_version
  ALTER COLUMN public_question SET NOT NULL,
  ALTER COLUMN reference_answer SET NOT NULL,
  ALTER COLUMN grading SET NOT NULL,
  ADD CONSTRAINT question_version_v2_public_check CHECK ((
    jsonb_typeof(public_question) = 'object'
    AND public_question->'id' = to_jsonb(question_key)
    AND public_question->'version' = to_jsonb(version)
    AND public_question->>'type' IN (
      'SINGLE_CHOICE', 'MULTIPLE_CHOICE', 'FILL_BLANK', 'JUDGMENT_REASON',
      'PROOF', 'PROOF_CALCULATION', 'EXPLORATION_PROOF', 'COMPREHENSIVE'
    )
    AND public_question->>'difficulty' IN ('BASIC', 'INTERMEDIATE', 'COMPREHENSIVE')
    AND jsonb_typeof(public_question->'unitIds') = 'array'
    AND jsonb_typeof(public_question->'knowledgeIds') = 'array'
  ) IS TRUE),
  ADD CONSTRAINT question_version_v2_reference_check CHECK ((
    jsonb_typeof(reference_answer) = 'object'
    AND jsonb_typeof(reference_answer->'answerText') = 'string'
    AND jsonb_typeof(reference_answer->'explanation') = 'string'
  ) IS TRUE),
  ADD CONSTRAINT question_version_v2_grading_check CHECK ((
    jsonb_typeof(grading) = 'object'
    AND grading->>'mode' = CASE public_question->>'type'
      WHEN 'SINGLE_CHOICE' THEN 'CHOICE_SET'
      WHEN 'MULTIPLE_CHOICE' THEN 'CHOICE_SET'
      WHEN 'FILL_BLANK' THEN 'ALIASES_OR_REVIEW'
      ELSE 'REVIEW_REQUIRED'
    END
  ) IS TRUE);

CREATE INDEX question_version_published_idx
  ON question_version (question_key, version DESC) WHERE is_published;

CREATE OR REPLACE FUNCTION protect_published_question() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF (
    OLD.id, OLD.question_key, OLD.version, OLD.knowledge_point_id, OLD.stem,
    OLD.options, OLD.correct_option_id, OLD.explanation, OLD.figure, OLD.source_note,
    OLD.public_question, OLD.reference_answer, OLD.grading, OLD.source
  ) IS DISTINCT FROM (
    NEW.id, NEW.question_key, NEW.version, NEW.knowledge_point_id, NEW.stem,
    NEW.options, NEW.correct_option_id, NEW.explanation, NEW.figure, NEW.source_note,
    NEW.public_question, NEW.reference_answer, NEW.grading, NEW.source
  ) THEN
    RAISE EXCEPTION 'Question version content is immutable; create a new version';
  END IF;
  RETURN NEW;
END
$$;

ALTER TABLE practice ADD COLUMN selection jsonb;
UPDATE practice
SET selection = jsonb_build_object('mode', 'FILTERED', 'knowledgePointId', knowledge_point_id,
  'count', 5);
ALTER TABLE practice
  ALTER COLUMN knowledge_point_id DROP NOT NULL,
  ALTER COLUMN selection SET NOT NULL,
  ADD CONSTRAINT practice_selection_check CHECK ((
    jsonb_typeof(selection) = 'object'
    AND selection->>'mode' IN ('ALL', 'FILTERED', 'EXPLICIT')
  ) IS TRUE);

ALTER TABLE practice_item
  DROP CONSTRAINT practice_item_position_check,
  ADD CONSTRAINT practice_item_position_check CHECK (position BETWEEN 1 AND 100);

ALTER TABLE submission ADD COLUMN graded_count integer;
UPDATE submission SET graded_count = total_count;
ALTER TABLE submission
  DROP CONSTRAINT submission_correct_count_check,
  DROP CONSTRAINT submission_total_count_check,
  ALTER COLUMN total_count DROP DEFAULT,
  ALTER COLUMN graded_count SET NOT NULL,
  ADD CONSTRAINT submission_v2_counts_check CHECK (
    total_count BETWEEN 1 AND 100 AND 0 <= correct_count
    AND correct_count <= graded_count AND graded_count <= total_count
  ),
  ADD COLUMN pending_count integer GENERATED ALWAYS AS (total_count - graded_count) STORED,
  ADD COLUMN grading_status text GENERATED ALWAYS AS (
    CASE WHEN graded_count = total_count THEN 'GRADED' ELSE 'PENDING_REVIEW' END
  ) STORED,
  ADD COLUMN score integer GENERATED ALWAYS AS (
    CASE WHEN graded_count = total_count THEN correct_count ELSE NULL END
  ) STORED;

ALTER TABLE submission_answer ADD COLUMN answer jsonb;
UPDATE submission_answer
SET answer = jsonb_build_object('type', 'SINGLE_CHOICE', 'selectedOptionId', selected_option_id);
ALTER TABLE submission_answer
  ALTER COLUMN selected_option_id DROP NOT NULL,
  ALTER COLUMN is_correct DROP NOT NULL,
  ALTER COLUMN answer SET NOT NULL,
  ADD CONSTRAINT submission_answer_v2_check CHECK ((
    jsonb_typeof(answer) = 'object' AND answer->>'type' IN (
      'SINGLE_CHOICE', 'MULTIPLE_CHOICE', 'FILL_BLANK', 'JUDGMENT_REASON',
      'PROOF', 'PROOF_CALCULATION', 'EXPLORATION_PROOF', 'COMPREHENSIVE'
    )
  ) IS TRUE),
  ADD COLUMN evaluation_status text GENERATED ALWAYS AS (
    CASE WHEN is_correct THEN 'CORRECT' WHEN NOT is_correct THEN 'INCORRECT' ELSE 'PENDING_REVIEW' END
  ) STORED,
  ADD COLUMN score integer GENERATED ALWAYS AS (
    CASE WHEN is_correct THEN 1 WHEN NOT is_correct THEN 0 ELSE NULL END
  ) STORED;
