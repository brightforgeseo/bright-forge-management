-- Parent-review release only. Apply after 20260907090000 in the same transaction.
-- Trusted source triggers preserve old client events. Never expose service keys.
-- Applies only to these two tables. No changes to the push trigger/pilot.
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '15s';
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public'
      AND tablename IN ('notifications','push_subscriptions')) THEN
    RAISE EXCEPTION 'Policy baseline drift: review before applying';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid IN
       ('public.notifications'::regclass,'public.push_subscriptions'::regclass)
       AND attnum>0 AND NOT attisdropped AND attacl IS NOT NULL) THEN
    RAISE EXCEPTION 'Column ACL baseline drift: review before applying';
  END IF;
END $$;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.notifications, public.push_subscriptions FROM PUBLIC, anon, authenticated;
GRANT SELECT, DELETE ON TABLE public.notifications TO authenticated;
GRANT UPDATE (is_read) ON public.notifications TO authenticated;
-- Self reminders remain possible; recipient-generated payloads are never a
-- trusted cross-user event. Service role is the trusted producer boundary.
GRANT INSERT (user_id,title,message,type,link_view,link_data) ON public.notifications TO authenticated;
CREATE POLICY notification_owner_read ON public.notifications FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()) AND (SELECT astra_portal_access.active_member()));
CREATE POLICY notification_owner_read_state ON public.notifications FOR UPDATE TO authenticated
  USING (user_id = (SELECT auth.uid()) AND (SELECT astra_portal_access.active_member())) WITH CHECK (user_id = (SELECT auth.uid()) AND (SELECT astra_portal_access.active_member()));
CREATE POLICY notification_owner_delete ON public.notifications FOR DELETE TO authenticated
  USING (user_id = (SELECT auth.uid()) AND (SELECT astra_portal_access.active_member()));
CREATE POLICY notification_self_create ON public.notifications FOR INSERT TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()) AND (SELECT astra_portal_access.active_member()));

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.push_subscriptions TO authenticated;
CREATE POLICY push_subscription_owner_read ON public.push_subscriptions FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()) AND (SELECT astra_portal_access.active_member()));
CREATE POLICY push_subscription_owner_create ON public.push_subscriptions FOR INSERT TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()) AND (SELECT astra_portal_access.active_member()));
CREATE POLICY push_subscription_owner_update ON public.push_subscriptions FOR UPDATE TO authenticated
  USING (user_id = (SELECT auth.uid()) AND (SELECT astra_portal_access.active_member())) WITH CHECK (user_id = (SELECT auth.uid()) AND (SELECT astra_portal_access.active_member()));
CREATE POLICY push_subscription_owner_delete ON public.push_subscriptions FOR DELETE TO authenticated
  USING (user_id = (SELECT auth.uid()) AND (SELECT astra_portal_access.active_member()));
-- Required by the actual client's upsert(..., {onConflict:'endpoint'}).
-- Current live table has zero rows and only a primary key, not this unique key.
-- A duplicate-filled future baseline fails safely; never delete/dedupe user rows.
CREATE UNIQUE INDEX push_subscriptions_endpoint_owner_security_uq ON public.push_subscriptions(endpoint);
-- Keep existing service_role ACL and BYPASSRLS unchanged. Never alter defaults,
-- shared schemas, public API functions, auth users or notification push trigger.
