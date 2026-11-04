BEGIN;
SELECT public.private_bot_enqueue('a1e57188-a322-42b2-9d33-b5df08033685',(SELECT id FROM public.private_bots WHERE owner_id='a1e57188-a322-42b2-9d33-b5df08033685' AND slot=8),'qa-red-receipt-fixture','{"message":"Controlled administrative QA receipt fixture"}');
ROLLBACK;
