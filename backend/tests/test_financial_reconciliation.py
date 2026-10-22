from datetime import timedelta
from decimal import Decimal
from app.models.savings import SavingsLedgerEntry
from app.services.financial_reports import records
from app.security.auth import now
from tests.test_auth import accounts
from tests.test_savings_workflow import setup,record,confirm,decision,URL


def test_report_agrees_with_ledger_pending_and_preserved_reversal(client,db,setup):
    s=setup
    _,r=record(client,s);assert r.status_code==201
    _,confirmed=confirm(client,s,r.json())
    assert client.post(f"{URL}/{confirmed['id']}/reverse",headers=s['admin'],json=decision(confirmed,'Reversed')).status_code==200
    _,pending=record(client,s,reference='SYNTHETIC-PENDING-REPORT');assert pending.status_code==201
    result=records(db,now().date()-timedelta(days=1),now().date()+timedelta(days=1))
    ledger=[r for r in result['items'] if r['category']=='savings_ledger']
    assert len(ledger)==2 and sum(Decimal(r['amount']) for r in ledger)==0
    assert result['net_ledger_movement']==[{'currency':'USD','amount':'0.00'}]
    reversal=next(r for r in ledger if r['status']=='Reversal')
    assert reversal['linked_id']==str(db.query(SavingsLedgerEntry).filter_by(kind='Credit').one().id)
    assert any(r['category']=='savings_pending' and r['amount']=='10.00' for r in result['items'])
    # Historical registration fees/subscription obligations are never ledger credits.
    assert all(r['category']=='savings_ledger' for r in ledger)
