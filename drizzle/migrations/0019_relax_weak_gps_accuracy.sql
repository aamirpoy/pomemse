DO $$
DECLARE f text; def text;
BEGIN
  FOREACH f IN ARRAY ARRAY['clock_action','outing_action'] LOOP
    SELECT pg_get_functiondef(p.oid) INTO def FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname=f;
    def := replace(def, '_acc<=150', '_acc<=500');
    def := replace(def, 'Your phone GPS is not accurate enough right now. Move to an open area and tap again.', 'Your phone GPS signal is too weak right now. Turn on precise location and Wi-Fi, step near a window, then tap again.');
    EXECUTE def;
  END LOOP;
END $$;