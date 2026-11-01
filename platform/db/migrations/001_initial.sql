-- 维护人：穆泓烨。已执行的迁移不得修改；新增变更使用后续编号。
CREATE TABLE app_user (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  username text NOT NULL UNIQUE
    CHECK (username ~ '^[a-z0-9_]{4,20}$'),
  password_hash text NOT NULL CHECK (length(password_hash) > 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE app_session (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE CHECK (length(token_hash) = 64),
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (expires_at > created_at)
);
CREATE INDEX app_session_user_idx ON app_session(user_id);
CREATE INDEX app_session_expiry_idx ON app_session(expires_at);

CREATE TABLE knowledge_point (
  id text PRIMARY KEY,
  topic_id text NOT NULL DEFAULT 'solid-geometry-basics',
  title text NOT NULL CHECK (length(trim(title)) > 0),
  summary text NOT NULL DEFAULT '',
  sort_order integer NOT NULL CHECK (sort_order > 0),
  content jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(content) = 'object'),
  examples jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(examples) = 'array'),
  figure jsonb CHECK (figure IS NULL OR jsonb_typeof(figure) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE FUNCTION valid_choice_options(value jsonb) RETURNS boolean
LANGUAGE sql IMMUTABLE STRICT AS $$
  SELECT CASE WHEN jsonb_typeof(value) <> 'array' THEN false ELSE (
    SELECT count(*) = 4 AND count(DISTINCT item->>'id') = 4 AND
      bool_and(coalesce(
        jsonb_typeof(item) = 'object' AND
        jsonb_typeof(item->'id') = 'string' AND length(item->>'id') > 0 AND
        jsonb_typeof(item->'text') = 'string' AND length(trim(item->>'text')) > 0,
      false))
    FROM jsonb_array_elements(value) AS item
  ) END
$$;

CREATE TABLE question_version (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question_key text NOT NULL,
  version integer NOT NULL CHECK (version > 0),
  knowledge_point_id text NOT NULL REFERENCES knowledge_point(id) ON DELETE RESTRICT,
  stem text NOT NULL CHECK (length(trim(stem)) > 0),
  options jsonb NOT NULL CHECK (valid_choice_options(options)),
  correct_option_id text NOT NULL,
  explanation jsonb NOT NULL CHECK (
    jsonb_typeof(explanation) = 'object' AND
    explanation ? 'steps' AND
    jsonb_typeof(explanation->'steps') = 'array' AND
    jsonb_array_length(explanation->'steps') > 0
  ),
  figure jsonb CHECK (figure IS NULL OR jsonb_typeof(figure) = 'object'),
  source_note text NOT NULL DEFAULT '',
  is_published boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (question_key, version),
  CHECK (jsonb_path_exists(options, '$[*] ? (@.id == $answer)',
    jsonb_build_object('answer', correct_option_id)))
);
CREATE INDEX question_version_knowledge_idx ON question_version(knowledge_point_id);

CREATE FUNCTION protect_published_question() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF (
    OLD.question_key, OLD.version, OLD.knowledge_point_id, OLD.stem,
    OLD.options, OLD.correct_option_id, OLD.explanation, OLD.figure, OLD.source_note
  ) IS DISTINCT FROM (
    NEW.question_key, NEW.version, NEW.knowledge_point_id, NEW.stem,
    NEW.options, NEW.correct_option_id, NEW.explanation, NEW.figure, NEW.source_note
  ) THEN
    RAISE EXCEPTION 'Question version content is immutable; create a new version';
  END IF;
  RETURN NEW;
END
$$;
CREATE TRIGGER question_version_immutable
BEFORE UPDATE ON question_version
FOR EACH ROW EXECUTE FUNCTION protect_published_question();

CREATE TABLE practice (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES app_user(id) ON DELETE RESTRICT,
  knowledge_point_id text NOT NULL REFERENCES knowledge_point(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'SUBMITTED')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX practice_user_idx ON practice(user_id, created_at DESC);

CREATE TABLE practice_item (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_id uuid NOT NULL REFERENCES practice(id) ON DELETE CASCADE,
  question_version_id uuid NOT NULL REFERENCES question_version(id) ON DELETE RESTRICT,
  position integer NOT NULL CHECK (position BETWEEN 1 AND 5),
  UNIQUE (practice_id, position),
  UNIQUE (practice_id, question_version_id),
  UNIQUE (id, practice_id)
);

CREATE TABLE submission (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_id uuid NOT NULL UNIQUE REFERENCES practice(id) ON DELETE RESTRICT,
  correct_count integer NOT NULL CHECK (correct_count BETWEEN 0 AND 5),
  total_count integer NOT NULL DEFAULT 5 CHECK (total_count = 5),
  submitted_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, practice_id)
);

CREATE TABLE submission_answer (
  submission_id uuid NOT NULL,
  practice_id uuid NOT NULL,
  practice_item_id uuid NOT NULL,
  selected_option_id text NOT NULL CHECK (length(selected_option_id) > 0),
  is_correct boolean NOT NULL,
  PRIMARY KEY (submission_id, practice_item_id),
  FOREIGN KEY (submission_id, practice_id)
    REFERENCES submission(id, practice_id) ON DELETE CASCADE,
  FOREIGN KEY (practice_item_id, practice_id)
    REFERENCES practice_item(id, practice_id) ON DELETE RESTRICT
);
