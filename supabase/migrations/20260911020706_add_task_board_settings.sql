CREATE TABLE IF NOT EXISTS public.task_board_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.task_board_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.task_board_settings FROM anon, authenticated;
GRANT ALL ON public.task_board_settings TO service_role;
