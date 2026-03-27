-- 園マスタ実データ投入（spothoiku.com/works から取得）
-- 実行: wrangler d1 execute line-crm-test --file=packages/db/seeds/nurseries-seed.sql

INSERT OR IGNORE INTO nurseries (id, name, prefecture, area, nursery_type, qualification_req, address, station, access_info, hp_url, description, requirements, notes, transport_fee, break_minutes, photo_r2_keys, is_active, created_at, updated_at) VALUES
-- 1. Baby Kids Smile 関内園
('nrs-001', 'Baby Kids Smile 関内園', '神奈川県', '横浜市中区', NULL, '保育士資格必須', NULL, '伊勢佐木長者町駅、関内駅', 'ブルーライン 伊勢佐木長者町駅から徒歩6分・JR根岸線 関内駅から徒歩11分', NULL, NULL, NULL, NULL, 0, 60, '[]', 1, strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours'), strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours')),

-- 2. ピノキオ幼児舎荻窪保育園
('nrs-002', 'ピノキオ幼児舎荻窪保育園', '東京都', '杉並区', NULL, '保育士資格必須', NULL, '荻窪駅', 'JR線・東京メトロ丸ノ内線 荻窪駅から徒歩2分', NULL, NULL, NULL, NULL, 0, 60, '[]', 1, strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours'), strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours')),

-- 3. ピノキオ幼児舎桃井保育園
('nrs-003', 'ピノキオ幼児舎桃井保育園', '東京都', '杉並区', NULL, '保育士資格必須', NULL, '西荻窪駅、上井草駅', 'JR中央・総武線 西荻窪駅から徒歩約15分・荻窪駅からバス約6分', NULL, NULL, NULL, NULL, 0, 60, '[]', 1, strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours'), strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours')),

-- 4. ピノキオ幼児舎吉祥寺保育園
('nrs-004', 'ピノキオ幼児舎吉祥寺保育園', '東京都', '武蔵野市', NULL, '保育士資格必須', NULL, '吉祥寺駅', 'JR中央・総武線 吉祥寺駅', NULL, NULL, NULL, NULL, 0, 60, '[]', 1, strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours'), strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours')),

-- 5. ピノキオ幼児舎阿佐谷北保育園
('nrs-005', 'ピノキオ幼児舎阿佐谷北保育園', '東京都', '杉並区', NULL, '保育士資格必須', NULL, '鷺ノ宮駅、阿佐ケ谷駅', '西武新宿線 鷺ノ宮駅から徒歩13分・JR中央線 阿佐ケ谷駅から徒歩17分', NULL, NULL, NULL, NULL, 0, 60, '[]', 1, strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours'), strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours')),

-- 6. ピノキオ幼児舎井荻保育園
('nrs-006', 'ピノキオ幼児舎井荻保育園', '東京都', '杉並区', NULL, '保育士資格必須', NULL, '井荻駅', '西武新宿線 井荻駅から徒歩9分', NULL, NULL, NULL, NULL, 0, 60, '[]', 1, strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours'), strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours')),

-- 7. unico船橋
('nrs-007', 'unico船橋', '千葉県', '船橋市', '児童発達支援', NULL, NULL, '北習志野駅、習志野駅', '新京成電鉄 北習志野駅 徒歩8分・新京成電鉄 習志野駅 徒歩5分', NULL, NULL, NULL, NULL, 0, 60, '[]', 1, strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours'), strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours')),

-- 8. unico練馬錦
('nrs-008', 'unico練馬錦', '東京都', '練馬区', '児童発達支援', NULL, NULL, '上板橋駅、東武練馬駅', '東武東上線 上板橋駅から徒歩14分・東武東上線 東武練馬駅から徒歩14分', NULL, NULL, NULL, NULL, 0, 60, '[]', 1, strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours'), strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours')),

-- 9. unico城南大田
('nrs-009', 'unico城南大田', '東京都', '大田区', '児童発達支援', NULL, NULL, '雑色駅', '京浜急行電鉄 雑色駅から徒歩2分', NULL, NULL, NULL, NULL, 0, 60, '[]', 1, strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours'), strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours')),

-- 10. unico武蔵中原
('nrs-010', 'unico武蔵中原', '神奈川県', '川崎市中原区', '児童発達支援', NULL, NULL, '武蔵中原駅', 'JR武蔵中原駅より徒歩3分', NULL, NULL, NULL, NULL, 0, 60, '[]', 1, strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours'), strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours')),

-- 11. unico赤羽
('nrs-011', 'unico赤羽', '東京都', '北区', '児童発達支援', NULL, NULL, '志茂駅、赤羽駅', '南北線 志茂駅から徒歩5分・JR赤羽駅から徒歩13分', NULL, NULL, NULL, NULL, 0, 60, '[]', 1, strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours'), strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours')),

-- 12. フェニックスキッズ向原
('nrs-012', 'フェニックスキッズ向原', '東京都', '板橋区', NULL, '保育士資格必須', NULL, '千川駅、小竹向原駅', '東京メトロ有楽町線 千川駅から徒歩9分・副都心線 千川駅から徒歩9分・西武有楽町線 小竹向原駅から徒歩10分', NULL, NULL, NULL, NULL, 0, 60, '[]', 1, strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours'), strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours')),

-- 13. マイシェルパジュニア馬込-上池台
('nrs-013', 'マイシェルパジュニア馬込-上池台', '東京都', '大田区', '児童発達支援', NULL, NULL, '馬込駅、長原駅、荏原町駅', '都営浅草線 馬込駅から徒歩13分・東急池上線 長原駅から徒歩13分・東急大井町線 荏原町駅から徒歩16分', NULL, NULL, NULL, NULL, 0, 60, '[]', 1, strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours'), strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours')),

-- 14. マイシェルパジュニア常盤台
('nrs-014', 'マイシェルパジュニア常盤台', '東京都', '板橋区', '児童発達支援', NULL, NULL, 'ときわ台駅、中板橋駅', '東武東上線 ときわ台駅から徒歩7分・東武東上線 中板橋駅から徒歩14分', NULL, NULL, NULL, NULL, 0, 60, '[]', 1, strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours'), strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours')),

-- 15. ネスインターナショナルスクール世田谷駒沢
('nrs-015', 'ネスインターナショナルスクール世田谷駒沢', '東京都', '世田谷区', 'インターナショナルスクール', NULL, NULL, '駒沢大学駅', '田園都市線 駒沢大学駅 徒歩1分', NULL, NULL, NULL, NULL, 0, 60, '[]', 1, strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours'), strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours')),

-- 16. ネスインターナショナルスクール五反田
('nrs-016', 'ネスインターナショナルスクール五反田', '東京都', '品川区', 'インターナショナルスクール', NULL, NULL, '五反田駅、大崎広小路駅', 'JR五反田駅 徒歩5分・大崎広小路駅 徒歩5分', NULL, NULL, NULL, NULL, 0, 60, '[]', 1, strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours'), strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours')),

-- 17. マフィス横濱元町
('nrs-017', 'マフィス横濱元町', '神奈川県', '横浜市中区', NULL, '保育士資格必須', NULL, '元町・中華街駅', 'みなとみらい線 元町・中華街駅から徒歩2分', NULL, NULL, NULL, NULL, 0, 60, '[]', 1, strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours'), strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours')),

-- 18. マフィス北参道
('nrs-018', 'マフィス北参道', '東京都', '渋谷区', NULL, '保育士資格必須', NULL, '北参道駅、千駄ヶ谷駅', '東京メトロ副都心線 北参道駅 徒歩3分・JR総武線 千駄ヶ谷駅 徒歩9分・JR山手線 原宿駅 徒歩10分', NULL, NULL, NULL, NULL, 0, 60, '[]', 1, strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours'), strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours')),

-- 19. マジオひまわり保育園 本郷
('nrs-019', 'マジオひまわり保育園 本郷', '東京都', '文京区', NULL, '保育士資格必須', NULL, '本郷三丁目駅、水道橋駅', '東京メトロ丸ノ内線 本郷三丁目駅より徒歩3分・都営三田線 水道橋駅より徒歩6分', NULL, NULL, NULL, NULL, 0, 60, '[]', 1, strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours'), strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours')),

-- 20. 空と虹の家保育園
('nrs-020', '空と虹の家保育園', '東京都', '世田谷区', NULL, '保育士資格必須', NULL, '松陰神社前駅', '東急世田谷線 松陰神社前駅から徒歩4分', NULL, NULL, NULL, NULL, 0, 60, '[]', 1, strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours'), strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours')),

-- 21. 世田谷おとぎの森保育園
('nrs-021', '世田谷おとぎの森保育園', '東京都', '世田谷区', NULL, '保育士資格必須', NULL, '二子玉川駅', '東急田園都市線 二子玉川駅から徒歩17分・バス「世田谷総合高校前」下車徒歩3分', NULL, NULL, NULL, NULL, 0, 60, '[]', 1, strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours'), strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours')),

-- 22. みちくさ保育園
('nrs-022', 'みちくさ保育園', '東京都', '葛飾区', NULL, '保育士資格必須', NULL, '新小岩駅', 'JR中央・総武線 新小岩駅から徒歩5分', NULL, NULL, NULL, NULL, 0, 60, '[]', 1, strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours'), strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours')),

-- 23. ぽっけナーサリールーム
('nrs-023', 'ぽっけナーサリールーム', '神奈川県', '川崎市多摩区', NULL, '保育士資格必須', NULL, '向ヶ丘遊園駅、登戸駅', '小田急線 向ヶ丘遊園駅から徒歩3分・JR南武線 登戸駅から徒歩6分', NULL, NULL, NULL, NULL, 0, 60, '[]', 1, strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours'), strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours')),

-- 24. キラママ保育園
('nrs-024', 'キラママ保育園', '東京都', '品川区', NULL, '保育士資格必須', NULL, '高輪台駅、五反田駅', '都営浅草線 高輪台駅から徒歩4分・JR山手線 五反田駅から徒歩10分', NULL, NULL, NULL, NULL, 0, 60, '[]', 1, strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours'), strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours')),

-- 25. のぱるキッズ東麻布
('nrs-025', 'のぱるキッズ東麻布', '東京都', '港区', NULL, '保育士資格必須', NULL, '赤羽橋駅', '大江戸線 赤羽橋駅中之橋口より徒歩3分', NULL, NULL, NULL, NULL, 0, 60, '[]', 1, strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours'), strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours')),

-- 26. 保育ルームすまいる世田谷奥沢園
('nrs-026', '保育ルームすまいる世田谷奥沢園', '東京都', '世田谷区', NULL, '保育士資格必須', NULL, '九品仏駅、尾山台駅、自由が丘駅', '東急大井町線 九品仏駅より徒歩3分・東急大井町線 尾山台駅より徒歩7分・東急東横線 自由が丘駅より徒歩11分', NULL, NULL, NULL, NULL, 0, 60, '[]', 1, strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours'), strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours'));
