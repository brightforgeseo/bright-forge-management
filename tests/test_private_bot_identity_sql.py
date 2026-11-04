"""Isolated SQL-predicate fixtures. No network and no production Auth writes.
Executes the exact SQL SELECT extracted from the migration on in-memory SQLite.
This is NOT a PostgreSQL RLS/privilege execution test; parent must verify that gate.
"""
import sqlite3
from pathlib import Path
import re
import unittest

ROOT=Path(__file__).parents[1]
MIGRATION=ROOT/'supabase/migrations/20261016203000_private_bot_confirmed_identity.sql'

class ConfirmationPredicate(unittest.TestCase):
    def test_exact_predicate_fixtures_and_rls_rpc_wiring(self):
        sql=MIGRATION.read_text().split('AS $$',1)[1].split('$$;',1)[0].strip()
        db=sqlite3.connect(':memory:')
        db.execute("ATTACH ':memory:' AS public")
        db.execute("ATTACH ':memory:' AS auth")
        db.create_function('now',0,lambda:'2026-10-16T00:00:00Z')
        db.execute('CREATE TABLE public.private_bot_owners(owner_id TEXT,email TEXT)')
        db.execute('CREATE TABLE auth.users(id TEXT,email TEXT,deleted_at TEXT,email_confirmed_at TEXT,banned_until TEXT)')
        # Deliberately fictitious identities, never inserted into live auth.users.
        db.execute("INSERT INTO public.private_bot_owners VALUES ('fixture-owner','fixture@example.invalid')")
        cases=[('confirmed','fixture-owner','fixture@example.invalid',None,'2026-01-01T00:00:00Z',None,1),('unconfirmed','fixture-owner','fixture@example.invalid',None,None,None,0),('email-changed','fixture-owner','changed@example.invalid',None,'2026-01-01T00:00:00Z',None,0),('wrong-id','other-owner','fixture@example.invalid',None,'2026-01-01T00:00:00Z',None,0),('deleted','fixture-owner','fixture@example.invalid','2026-01-01T00:00:00Z','2026-01-01T00:00:00Z',None,0),('banned','fixture-owner','fixture@example.invalid',None,'2026-01-01T00:00:00Z','2099-01-01T00:00:00Z',0),('future-confirmed','fixture-owner','fixture@example.invalid',None,'2099-01-01T00:00:00Z',None,0)]
        sql=re.sub(r'\bsubject\b',':subject',sql)
        for name,*row,expected in cases:
            with self.subTest(name=name):
                db.execute('DELETE FROM auth.users')
                db.execute('INSERT INTO auth.users VALUES (?,?,?,?,?)',row)
                self.assertEqual(db.execute(sql,{'subject':'fixture-owner'}).fetchone()[0],expected)
        db.execute('DELETE FROM auth.users')
        self.assertEqual(db.execute(sql,{'subject':'fixture-owner'}).fetchone()[0],0)
        base=(ROOT/'supabase/migrations/20261016093000_private_bots.sql').read_text()
        self.assertEqual(base.count('USING(owner_id=auth.uid() AND public.private_bot_access(auth.uid()))'),2)
        linking=(ROOT/'supabase/migrations/20261016110000_private_bot_telegram.sql').read_text()
        self.assertIn('NOT public.private_bot_access(row.owner_id)',linking)
        self.assertEqual(linking.count('NOT public.private_bot_access(subject)'),2)
        self.assertIn('REVOKE ALL ON FUNCTION public.private_bot_access(uuid) FROM PUBLIC,anon;',MIGRATION.read_text())
        db.close()

if __name__=='__main__':unittest.main(verbosity=2)
