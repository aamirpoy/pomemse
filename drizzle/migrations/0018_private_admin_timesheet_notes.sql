CREATE TABLE public.attendance_admin_notes (
 attendance_id uuid PRIMARY KEY REFERENCES public.attendance(id) ON DELETE CASCADE,
 user_id uuid NOT NULL REFERENCES public.profiles(id),
 note text NOT NULL CHECK (length(note) <= 500),
 author_name text NOT NULL DEFAULT 'Admin',
 updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.attendance_admin_notes TO authenticated;
GRANT ALL ON public.attendance_admin_notes TO service_role;
ALTER TABLE public.attendance_admin_notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read private attendance notes" ON public.attendance_admin_notes FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));
INSERT INTO public.attendance_admin_notes(attendance_id,user_id,note,author_name,updated_at)
 SELECT id,user_id,left(trim(admin_note),500),coalesce(admin_note_by,'Admin'),coalesce(admin_note_at,now()) FROM public.attendance WHERE nullif(trim(admin_note),'') IS NOT NULL;
CREATE OR REPLACE FUNCTION public.stamp_admin_note() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 NEW.admin_note:=nullif(left(trim(coalesce(NEW.admin_note,'')),500),'');
 NEW.admin_note_by:=NULL; NEW.admin_note_at:=NULL;
 RETURN NEW;
END $$;
CREATE FUNCTION public.store_private_attendance_note() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE author text;
BEGIN
 IF NEW.admin_note IS NOT NULL THEN
  IF auth.uid() IS NOT NULL AND NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Admins only'; END IF;
  SELECT coalesce(nullif(full_name,''),'Admin') INTO author FROM public.profiles WHERE id=auth.uid();
  INSERT INTO public.attendance_admin_notes(attendance_id,user_id,note,author_name,updated_at) VALUES(NEW.id,NEW.user_id,NEW.admin_note,coalesce(author,'Admin'),now())
  ON CONFLICT(attendance_id) DO UPDATE SET note=excluded.note,author_name=excluded.author_name,updated_at=excluded.updated_at;
  UPDATE public.attendance SET admin_note=NULL,admin_note_by=NULL,admin_note_at=NULL WHERE id=NEW.id;
 END IF;
 RETURN NULL;
END $$;
CREATE TRIGGER attendance_store_private_note AFTER INSERT OR UPDATE ON public.attendance FOR EACH ROW EXECUTE FUNCTION public.store_private_attendance_note();
UPDATE public.attendance SET admin_note=NULL,admin_note_by=NULL,admin_note_at=NULL WHERE admin_note IS NOT NULL OR admin_note_by IS NOT NULL OR admin_note_at IS NOT NULL;
CREATE TRIGGER audit_private_attendance_notes AFTER INSERT OR UPDATE OR DELETE ON public.attendance_admin_notes FOR EACH ROW EXECUTE FUNCTION public.log_admin_change();
CREATE FUNCTION public.clear_private_attendance_note(_attendance uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Admins only'; END IF;
 DELETE FROM public.attendance_admin_notes WHERE attendance_id=_attendance;
END $$;
REVOKE ALL ON FUNCTION public.clear_private_attendance_note(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.clear_private_attendance_note(uuid) TO authenticated;
COMMENT ON COLUMN public.attendance.admin_note IS 'DEPRECATED for reads: compatibility write input moved by trigger into admin-only attendance_admin_notes and cleared immediately.';
COMMENT ON COLUMN public.attendance.admin_note_by IS 'DEPRECATED: author stored privately in attendance_admin_notes.';
COMMENT ON COLUMN public.attendance.admin_note_at IS 'DEPRECATED: timestamp stored privately in attendance_admin_notes.';