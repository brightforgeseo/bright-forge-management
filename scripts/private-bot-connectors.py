#!/usr/bin/env python3
"""Fixed read connectors. No user-selected profile/path, shell or arbitrary Google URL."""
import datetime
import json
import os
import sys
from pathlib import Path
sys.path.insert(0, os.path.expanduser('~/.hermes/hermes-agent'))
import hermes_bootstrap


def main():
    request=json.load(sys.stdin)
    op=request['operation']; args=request['arguments']
    if op=='business_report_read':
        import importlib.util
        spec=importlib.util.spec_from_file_location('business_report_reader',Path(__file__).with_name('private-bot-report-reader.py'))
        module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
        return module.execute(request)
    if op=='work_history_read':
        import importlib.util
        spec=importlib.util.spec_from_file_location('private_work_history',Path(__file__).with_name('private-bot-work-history.py'))
        module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
        return module.execute(request)
    if op in ('client_gsc_read','client_drive_discovery','client_doc_read','client_ga4_read','client_seranking_read','client_cms_read'):
        import importlib.util
        spec=importlib.util.spec_from_file_location('private_client_reads',Path(__file__).with_name('private-bot-client-connectors.py'))
        module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
        return module.execute(request)
    if op=='web_search':
        from tools.web_tools import web_search_tool
        data=json.loads(web_search_tool(args['query'],limit=5))
        return {'provider':'configured public web search','retrievedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'query':args['query'],'data':data}
    if op not in ('get_gsc_performance','get_ga4_traffic') or args.get('site')!='brightforge':
        raise ValueError('CONNECTOR_SCOPE_DENIED')
    from google.oauth2.credentials import Credentials
    from google.auth.transport.requests import AuthorizedSession, Request
    credentials=Credentials.from_authorized_user_info(json.loads(Path.home().joinpath('.hermes/profiles/personal-google/google_token.json').read_text()))
    if not credentials.valid: credentials.refresh(Request())
    session=AuthorizedSession(credentials)
    identity=session.get('https://www.googleapis.com/drive/v3/about',params={'fields':'user(emailAddress)'},timeout=20)
    if not identity.ok or identity.json().get('user',{}).get('emailAddress')!='bensocialbeesmedia@gmail.com':raise ValueError('CONNECTOR_IDENTITY_DENIED')
    common={'accountLane':'Ben personal-google / authorised business-property adapter','site':'brightforge.com.ph','retrievedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'startDate':args['start_date'],'endDate':args['end_date']}
    if op=='get_gsc_performance':
        payload={'startDate':args['start_date'],'endDate':args['end_date'],'type':'web','dataState':'final','rowLimit':1}
        if args.get('query'):payload['dimensionFilterGroups']=[{'filters':[{'dimension':'query','operator':'equals','expression':args['query']}]}]
        response=session.post('https://www.googleapis.com/webmasters/v3/sites/sc-domain%3Abrightforge.com.ph/searchAnalytics/query',json=payload,timeout=30)
        if not response.ok:raise ValueError('GSC_READ_UNAVAILABLE')
        return {**common,'provider':'Google Search Console','property':'sc-domain:brightforge.com.ph','metricDefinitions':{'clicks':'Google web organic search clicks, not all-site traffic','impressions':'Google web search impressions','position':'impression-weighted average position, NOT live SERP rank'},'request':payload,'data':response.json()}
    streams=session.get('https://analyticsadmin.googleapis.com/v1beta/properties/474232099/dataStreams',timeout=20)
    if not streams.ok:raise ValueError('GA4_PROPERTY_UNAVAILABLE')
    payload={'dateRanges':[{'startDate':args['start_date'],'endDate':args['end_date']}],'metrics':[{'name':'sessions'},{'name':'totalUsers'},{'name':'screenPageViews'}],'dimensionFilter':{'filter':{'fieldName':'hostName','inListFilter':{'values':['brightforge.com.ph','www.brightforge.com.ph']}}}}
    response=session.post('https://analyticsdata.googleapis.com/v1beta/properties/474232099:runReport',json=payload,timeout=30)
    if not response.ok:raise ValueError('GA4_READ_UNAVAILABLE')
    return {**common,'provider':'Google Analytics 4','property':'properties/474232099','metricDefinition':'All-channel sessions/users/page views filtered to current Bright Forge hostnames; not GSC clicks','propertyNote':'Stream is still named brightforgeseo.com; current-host filter prevents reporting unrelated legacy hosts.','streams':[{'name':x.get('name'),'displayName':x.get('displayName'),'defaultUri':x.get('webStreamData',{}).get('defaultUri')}for x in streams.json().get('dataStreams',[])],'request':payload,'data':response.json()}


if __name__=='__main__':
    try: print(json.dumps(main()))
    except Exception:
        print(json.dumps({'error':'CONNECTOR_UNAVAILABLE','detail':'Authorised connector request failed; no credentials or raw provider exception are disclosed.'}))
        sys.exit(1)
