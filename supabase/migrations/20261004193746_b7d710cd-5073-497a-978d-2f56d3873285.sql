GRANT SELECT, INSERT, UPDATE, DELETE ON public.attendance TO authenticated;
GRANT ALL ON public.attendance TO service_role;
CREATE POLICY "admin inserts attendance" ON public.attendance FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "admin updates attendance" ON public.attendance FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "admin deletes attendance" ON public.attendance FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));