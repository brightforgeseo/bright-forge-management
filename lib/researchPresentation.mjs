const ORDER={
 competitors:['domain','intersections','avg_position','full_domain_metrics.organic.count','full_domain_metrics.organic.etv'],
 'domain-overview':['target','metrics.organic.count','metrics.organic.etv','metrics.organic.pos_1','metrics.organic.pos_2_3'],
 'ranked-keywords':['keyword_data.keyword','keyword_data.keyword_info.search_volume','ranked_serp_element.serp_item.rank_group','ranked_serp_element.serp_item.url','keyword_data.keyword_properties.keyword_difficulty'],
 keywords:['keyword','search_volume','competition','cpc','low_top_of_page_bid','high_top_of_page_bid'],
 'keyword-ideas':['keyword','search_volume','competition','cpc'],
 suggestions:['keyword','keyword_info.search_volume','keyword_properties.keyword_difficulty'],
 'related-keywords':['keyword_data.keyword','keyword_data.keyword_info.search_volume','keyword_data.keyword_properties.keyword_difficulty'],
 'keyword-difficulty':['keyword','keyword_difficulty'],
 'search-intent':['keyword','keyword_intent.label','keyword_intent.probability','search_intent_info.main_intent'],
 'backlinks':['url_from','url_to','anchor','rank','dofollow'],
 'referring-domains':['domain','backlinks','rank','backlinks_spam_score'],
 'backlink-summary':['target','backlinks','referring_domains','referring_pages','rank'],
 'anchors':['anchor','backlinks','referring_domains','rank'],
 'backlink-competitors':['target','domain','intersections','rank'],
 'serp':['rank_group','title','domain','url','type'],
 'ai-keywords':['keyword','ai_search_volume'],
};
const LABELS={'keyword_intent.label':'Search intent','keyword_intent.probability':'Confidence (0 to 1)','keyword_data.keyword':'Keyword','keyword_data.keyword_info.search_volume':'Search volume','keyword_info.search_volume':'Search volume','keyword_data.keyword_properties.keyword_difficulty':'Difficulty','keyword_properties.keyword_difficulty':'Difficulty','ranked_serp_element.serp_item.rank_group':'Position','ranked_serp_element.serp_item.url':'Ranking page','full_domain_metrics.organic.count':'Ranking keywords','full_domain_metrics.organic.etv':'Est. monthly traffic','metrics.organic.count':'Ranking keywords','metrics.organic.etv':'Est. monthly traffic','metrics.organic.pos_1':'Position 1','metrics.organic.pos_2_3':'Positions 2 to 3','url_from':'Source page','url_to':'Destination','rank_group':'Position','avg_position':'Average position','intersections':'Shared keywords','search_intent_info.main_intent':'Main intent','ai_search_volume':'AI search volume','cpc':'CPC (USD)'};
export function researchColumns(operation,available){const chosen=(ORDER[operation]||[]).filter(key=>available.includes(key));return chosen.length?chosen:available.filter(k=>!['location_code','language_code','se_type'].includes(k)).slice(0,7);}
export function researchColumnLabel(key,operation){if(key==='intersections'&&operation==='backlink-competitors')return 'Shared referring domains';return LABELS[key]||key.split('.').at(-1).replaceAll('_',' ').replace(/^./,letter=>letter.toUpperCase());}
