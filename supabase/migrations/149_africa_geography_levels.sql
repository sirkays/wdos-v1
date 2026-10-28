-- ============================================================================
-- WDOS Migration 149 — State/region and LGA/district equivalents for every
-- African country (Phase 197). Idempotent: a unit is created only when a unit
-- of the same name does not already exist under the same parent.
--   • Level 2 (state_region) for all 53 countries other than Nigeria (774 units)
--   • Level 3 (district_lga) for 13 countries where the lists are established
--     (Rwanda, Uganda, Malawi, Sierra Leone, South Africa, Cameroon, Togo,
--     Senegal, Benin, Zimbabwe, Zambia, The Gambia, Liberia, Ghana: Greater
--     Accra and Ashanti). Others: the form lets her type the name.
-- ============================================================================
do $$
declare cid uuid; sid uuid; r record;
begin
  select id into cid from org_units where level = 'country' and country_iso = 'DZ' limit 1;
  if cid is not null then
    for r in select * from unnest(array['Adrar','Chlef','Laghouat','Oum El Bouaghi','Batna','Béjaïa','Biskra','Béchar','Blida','Bouira','Tamanrasset','Tébessa','Tlemcen','Tiaret','Tizi Ouzou','Algiers','Djelfa','Jijel','Sétif','Saïda','Skikda','Sidi Bel Abbès','Annaba','Guelma','Constantine','Médéa','Mostaganem','M''Sila','Mascara','Ouargla','Oran','El Bayadh','Illizi','Bordj Bou Arréridj','Boumerdès','El Tarf','Tindouf','Tissemsilt','El Oued','Khenchela','Souk Ahras','Tipaza','Mila','Aïn Defla','Naâma','Aïn Témouchent','Ghardaïa','Relizane','Timimoun','Bordj Badji Mokhtar','Ouled Djellal','Béni Abbès','In Salah','In Guezzam','Touggourt','Djanet','El M''Ghair','El Meniaa']) as s(n) loop
      if not exists (select 1 from org_units where parent_id = cid and level = 'state_region' and name = r.n) then
        insert into org_units (parent_id, level, name, country_iso) values (cid, 'state_region', r.n, 'DZ');
      end if;
    end loop;
  end if;
  select id into cid from org_units where level = 'country' and country_iso = 'AO' limit 1;
  if cid is not null then
    for r in select * from unnest(array['Bengo','Benguela','Bié','Cabinda','Cuando Cubango','Cuanza Norte','Cuanza Sul','Cunene','Huambo','Huíla','Luanda','Lunda Norte','Lunda Sul','Malanje','Moxico','Namibe','Uíge','Zaire']) as s(n) loop
      if not exists (select 1 from org_units where parent_id = cid and level = 'state_region' and name = r.n) then
        insert into org_units (parent_id, level, name, country_iso) values (cid, 'state_region', r.n, 'AO');
      end if;
    end loop;
  end if;
  select id into cid from org_units where level = 'country' and country_iso = 'BJ' limit 1;
  if cid is not null then
    for r in select * from unnest(array['Alibori','Atakora','Atlantique','Borgou','Collines','Couffo','Donga','Littoral','Mono','Ouémé','Plateau','Zou']) as s(n) loop
      if not exists (select 1 from org_units where parent_id = cid and level = 'state_region' and name = r.n) then
        insert into org_units (parent_id, level, name, country_iso) values (cid, 'state_region', r.n, 'BJ');
      end if;
    end loop;
  end if;
  select id into cid from org_units where level = 'country' and country_iso = 'BW' limit 1;
  if cid is not null then
    for r in select * from unnest(array['Central','Chobe','Ghanzi','Kgalagadi','Kgatleng','Kweneng','North-East','North-West','South-East','Southern','Gaborone','Francistown','Lobatse','Selebi-Phikwe','Jwaneng','Sowa Town']) as s(n) loop
      if not exists (select 1 from org_units where parent_id = cid and level = 'state_region' and name = r.n) then
        insert into org_units (parent_id, level, name, country_iso) values (cid, 'state_region', r.n, 'BW');
      end if;
    end loop;
  end if;
  select id into cid from org_units where level = 'country' and country_iso = 'BF' limit 1;
  if cid is not null then
    for r in select * from unnest(array['Boucle du Mouhoun','Cascades','Centre','Centre-Est','Centre-Nord','Centre-Ouest','Centre-Sud','Est','Hauts-Bassins','Nord','Plateau-Central','Sahel','Sud-Ouest']) as s(n) loop
      if not exists (select 1 from org_units where parent_id = cid and level = 'state_region' and name = r.n) then
        insert into org_units (parent_id, level, name, country_iso) values (cid, 'state_region', r.n, 'BF');
      end if;
    end loop;
  end if;
  select id into cid from org_units where level = 'country' and country_iso = 'BI' limit 1;
  if cid is not null then
    for r in select * from unnest(array['Bubanza','Bujumbura Mairie','Bujumbura Rural','Bururi','Cankuzo','Cibitoke','Gitega','Karuzi','Kayanza','Kirundo','Makamba','Muramvya','Muyinga','Mwaro','Ngozi','Rumonge','Rutana','Ruyigi']) as s(n) loop
      if not exists (select 1 from org_units where parent_id = cid and level = 'state_region' and name = r.n) then
        insert into org_units (parent_id, level, name, country_iso) values (cid, 'state_region', r.n, 'BI');
      end if;
    end loop;
  end if;
  select id into cid from org_units where level = 'country' and country_iso = 'CV' limit 1;
  if cid is not null then
    for r in select * from unnest(array['Boa Vista','Brava','Maio','Mosteiros','Paul','Porto Novo','Praia','Ribeira Brava','Ribeira Grande','Ribeira Grande de Santiago','Sal','Santa Catarina','Santa Catarina do Fogo','Santa Cruz','São Domingos','São Filipe','São Lourenço dos Órgãos','São Miguel','São Salvador do Mundo','São Vicente','Tarrafal','Tarrafal de São Nicolau']) as s(n) loop
      if not exists (select 1 from org_units where parent_id = cid and level = 'state_region' and name = r.n) then
        insert into org_units (parent_id, level, name, country_iso) values (cid, 'state_region', r.n, 'CV');
      end if;
    end loop;
  end if;
  select id into cid from org_units where level = 'country' and country_iso = 'CM' limit 1;
  if cid is not null then
    for r in select * from unnest(array['Adamawa','Centre','East','Far North','Littoral','North','North-West','South','South-West','West']) as s(n) loop
      if not exists (select 1 from org_units where parent_id = cid and level = 'state_region' and name = r.n) then
        insert into org_units (parent_id, level, name, country_iso) values (cid, 'state_region', r.n, 'CM');
      end if;
    end loop;
  end if;
  select id into cid from org_units where level = 'country' and country_iso = 'CF' limit 1;
  if cid is not null then
    for r in select * from unnest(array['Bamingui-Bangoran','Bangui','Basse-Kotto','Haute-Kotto','Haut-Mbomou','Kémo','Lobaye','Mambéré-Kadéï','Mbomou','Nana-Grébizi','Nana-Mambéré','Ombella-M''Poko','Ouaka','Ouham','Ouham-Pendé','Sangha-Mbaéré','Vakaga']) as s(n) loop
      if not exists (select 1 from org_units where parent_id = cid and level = 'state_region' and name = r.n) then
        insert into org_units (parent_id, level, name, country_iso) values (cid, 'state_region', r.n, 'CF');
      end if;
    end loop;
  end if;
  select id into cid from org_units where level = 'country' and country_iso = 'TD' limit 1;
  if cid is not null then
    for r in select * from unnest(array['Batha','Borkou','Chari-Baguirmi','Ennedi-Est','Ennedi-Ouest','Guéra','Hadjer-Lamis','Kanem','Lac','Logone Occidental','Logone Oriental','Mandoul','Mayo-Kebbi Est','Mayo-Kebbi Ouest','Moyen-Chari','N''Djamena','Ouaddaï','Salamat','Sila','Tandjilé','Tibesti','Wadi Fira','Barh El Gazel']) as s(n) loop
      if not exists (select 1 from org_units where parent_id = cid and level = 'state_region' and name = r.n) then
        insert into org_units (parent_id, level, name, country_iso) values (cid, 'state_region', r.n, 'TD');
      end if;
    end loop;
  end if;
  select id into cid from org_units where level = 'country' and country_iso = 'KM' limit 1;
  if cid is not null then
    for r in select * from unnest(array['Grande Comore','Anjouan','Mohéli']) as s(n) loop
      if not exists (select 1 from org_units where parent_id = cid and level = 'state_region' and name = r.n) then
        insert into org_units (parent_id, level, name, country_iso) values (cid, 'state_region', r.n, 'KM');
      end if;
    end loop;
  end if;
  select id into cid from org_units where level = 'country' and country_iso = 'CG' limit 1;
  if cid is not null then
    for r in select * from unnest(array['Bouenza','Brazzaville','Cuvette','Cuvette-Ouest','Kouilou','Lékoumou','Likouala','Niari','Plateaux','Pointe-Noire','Pool','Sangha']) as s(n) loop
      if not exists (select 1 from org_units where parent_id = cid and level = 'state_region' and name = r.n) then
        insert into org_units (parent_id, level, name, country_iso) values (cid, 'state_region', r.n, 'CG');
      end if;
    end loop;
  end if;
  select id into cid from org_units where level = 'country' and country_iso = 'CD' limit 1;
  if cid is not null then
    for r in select * from unnest(array['Bas-Uélé','Équateur','Haut-Katanga','Haut-Lomami','Haut-Uélé','Ituri','Kasaï','Kasaï-Central','Kasaï-Oriental','Kinshasa','Kongo-Central','Kwango','Kwilu','Lomami','Lualaba','Mai-Ndombe','Maniema','Mongala','Nord-Kivu','Nord-Ubangi','Sankuru','Sud-Kivu','Sud-Ubangi','Tanganyika','Tshopo','Tshuapa']) as s(n) loop
      if not exists (select 1 from org_units where parent_id = cid and level = 'state_region' and name = r.n) then
        insert into org_units (parent_id, level, name, country_iso) values (cid, 'state_region', r.n, 'CD');
      end if;
    end loop;
  end if;
  select id into cid from org_units where level = 'country' and country_iso = 'CI' limit 1;
  if cid is not null then
    for r in select * from unnest(array['Abidjan','Bas-Sassandra','Comoé','Denguélé','Gôh-Djiboua','Lacs','Lagunes','Montagnes','Sassandra-Marahoué','Savanes','Vallée du Bandama','Woroba','Yamoussoukro','Zanzan']) as s(n) loop
      if not exists (select 1 from org_units where parent_id = cid and level = 'state_region' and name = r.n) then
        insert into org_units (parent_id, level, name, country_iso) values (cid, 'state_region', r.n, 'CI');
      end if;
    end loop;
  end if;
  select id into cid from org_units where level = 'country' and country_iso = 'DJ' limit 1;
  if cid is not null then
    for r in select * from unnest(array['Ali Sabieh','Arta','Dikhil','Djibouti','Obock','Tadjourah']) as s(n) loop
      if not exists (select 1 from org_units where parent_id = cid and level = 'state_region' and name = r.n) then
        insert into org_units (parent_id, level, name, country_iso) values (cid, 'state_region', r.n, 'DJ');
      end if;
    end loop;
  end if;
  select id into cid from org_units where level = 'country' and country_iso = 'EG' limit 1;
  if cid is not null then
    for r in select * from unnest(array['Alexandria','Aswan','Asyut','Beheira','Beni Suef','Cairo','Dakahlia','Damietta','Faiyum','Gharbia','Giza','Ismailia','Kafr El Sheikh','Luxor','Matrouh','Minya','Monufia','New Valley','North Sinai','Port Said','Qalyubia','Qena','Red Sea','Sharqia','Sohag','South Sinai','Suez']) as s(n) loop
      if not exists (select 1 from org_units where parent_id = cid and level = 'state_region' and name = r.n) then
        insert into org_units (parent_id, level, name, country_iso) values (cid, 'state_region', r.n, 'EG');
      end if;
    end loop;
  end if;
  select id into cid from org_units where level = 'country' and country_iso = 'GQ' limit 1;
  if cid is not null then
    for r in select * from unnest(array['Annobón','Bioko Norte','Bioko Sur','Centro Sur','Djibloho','Kié-Ntem','Litoral','Wele-Nzas']) as s(n) loop
      if not exists (select 1 from org_units where parent_id = cid and level = 'state_region' and name = r.n) then
        insert into org_units (parent_id, level, name, country_iso) values (cid, 'state_region', r.n, 'GQ');
      end if;
    end loop;
  end if;
  select id into cid from org_units where level = 'country' and country_iso = 'ER' limit 1;
  if cid is not null then
    for r in select * from unnest(array['Anseba','Debub','Gash-Barka','Maekel','Northern Red Sea','Southern Red Sea']) as s(n) loop
      if not exists (select 1 from org_units where parent_id = cid and level = 'state_region' and name = r.n) then
        insert into org_units (parent_id, level, name, country_iso) values (cid, 'state_region', r.n, 'ER');
      end if;
    end loop;
  end if;
  select id into cid from org_units where level = 'country' and country_iso = 'SZ' limit 1;
  if cid is not null then
    for r in select * from unnest(array['Hhohho','Lubombo','Manzini','Shiselweni']) as s(n) loop
      if not exists (select 1 from org_units where parent_id = cid and level = 'state_region' and name = r.n) then
        insert into org_units (parent_id, level, name, country_iso) values (cid, 'state_region', r.n, 'SZ');
      end if;
    end loop;
  end if;
  select id into cid from org_units where level = 'country' and country_iso = 'ET' limit 1;
  if cid is not null then
    for r in select * from unnest(array['Addis Ababa','Afar','Amhara','Benishangul-Gumuz','Central Ethiopia','Dire Dawa','Gambela','Harari','Oromia','Sidama','Somali','South Ethiopia','South West Ethiopia Peoples','Tigray']) as s(n) loop
      if not exists (select 1 from org_units where parent_id = cid and level = 'state_region' and name = r.n) then
        insert into org_units (parent_id, level, name, country_iso) values (cid, 'state_region', r.n, 'ET');
      end if;
    end loop;
  end if;
  select id into cid from org_units where level = 'country' and country_iso = 'GA' limit 1;
  if cid is not null then
    for r in select * from unnest(array['Estuaire','Haut-Ogooué','Moyen-Ogooué','Ngounié','Nyanga','Ogooué-Ivindo','Ogooué-Lolo','Ogooué-Maritime','Woleu-Ntem']) as s(n) loop
      if not exists (select 1 from org_units where parent_id = cid and level = 'state_region' and name = r.n) then
        insert into org_units (parent_id, level, name, country_iso) values (cid, 'state_region', r.n, 'GA');
      end if;
    end loop;
  end if;
  select id into cid from org_units where level = 'country' and country_iso = 'GM' limit 1;
  if cid is not null then
    for r in select * from unnest(array['Banjul','Central River','Lower River','North Bank','Upper River','West Coast']) as s(n) loop
      if not exists (select 1 from org_units where parent_id = cid and level = 'state_region' and name = r.n) then
        insert into org_units (parent_id, level, name, country_iso) values (cid, 'state_region', r.n, 'GM');
      end if;
    end loop;
  end if;
  select id into cid from org_units where level = 'country' and country_iso = 'GH' limit 1;
  if cid is not null then
    for r in select * from unnest(array['Ahafo','Ashanti','Bono','Bono East','Central','Eastern','Greater Accra','North East','Northern','Oti','Savannah','Upper East','Upper West','Volta','Western','Western North']) as s(n) loop
      if not exists (select 1 from org_units where parent_id = cid and level = 'state_region' and name = r.n) then
        insert into org_units (parent_id, level, name, country_iso) values (cid, 'state_region', r.n, 'GH');
      end if;
    end loop;
  end if;
  select id into cid from org_units where level = 'country' and country_iso = 'GN' limit 1;
  if cid is not null then
    for r in select * from unnest(array['Boké','Conakry','Faranah','Kankan','Kindia','Labé','Mamou','Nzérékoré']) as s(n) loop
      if not exists (select 1 from org_units where parent_id = cid and level = 'state_region' and name = r.n) then
        insert into org_units (parent_id, level, name, country_iso) values (cid, 'state_region', r.n, 'GN');
      end if;
    end loop;
  end if;
  select id into cid from org_units where level = 'country' and country_iso = 'GW' limit 1;
  if cid is not null then
    for r in select * from unnest(array['Bafatá','Biombo','Bissau','Bolama','Cacheu','Gabú','Oio','Quinara','Tombali']) as s(n) loop
      if not exists (select 1 from org_units where parent_id = cid and level = 'state_region' and name = r.n) then
        insert into org_units (parent_id, level, name, country_iso) values (cid, 'state_region', r.n, 'GW');
      end if;
    end loop;
  end if;
  select id into cid from org_units where level = 'country' and country_iso = 'KE' limit 1;
  if cid is not null then
    for r in select * from unnest(array['Baringo','Bomet','Bungoma','Busia','Elgeyo-Marakwet','Embu','Garissa','Homa Bay','Isiolo','Kajiado','Kakamega','Kericho','Kiambu','Kilifi','Kirinyaga','Kisii','Kisumu','Kitui','Kwale','Laikipia','Lamu','Machakos','Makueni','Mandera','Marsabit','Meru','Migori','Mombasa','Murang''a','Nairobi','Nakuru','Nandi','Narok','Nyamira','Nyandarua','Nyeri','Samburu','Siaya','Taita-Taveta','Tana River','Tharaka-Nithi','Trans-Nzoia','Turkana','Uasin Gishu','Vihiga','Wajir','West Pokot']) as s(n) loop
      if not exists (select 1 from org_units where parent_id = cid and level = 'state_region' and name = r.n) then
        insert into org_units (parent_id, level, name, country_iso) values (cid, 'state_region', r.n, 'KE');
      end if;
    end loop;
  end if;
  select id into cid from org_units where level = 'country' and country_iso = 'LS' limit 1;
  if cid is not null then
    for r in select * from unnest(array['Berea','Butha-Buthe','Leribe','Mafeteng','Maseru','Mohale''s Hoek','Mokhotlong','Qacha''s Nek','Quthing','Thaba-Tseka']) as s(n) loop
      if not exists (select 1 from org_units where parent_id = cid and level = 'state_region' and name = r.n) then
        insert into org_units (parent_id, level, name, country_iso) values (cid, 'state_region', r.n, 'LS');
      end if;
    end loop;
  end if;
  select id into cid from org_units where level = 'country' and country_iso = 'LR' limit 1;
  if cid is not null then
    for r in select * from unnest(array['Bomi','Bong','Gbarpolu','Grand Bassa','Grand Cape Mount','Grand Gedeh','Grand Kru','Lofa','Margibi','Maryland','Montserrado','Nimba','River Cess','River Gee','Sinoe']) as s(n) loop
      if not exists (select 1 from org_units where parent_id = cid and level = 'state_region' and name = r.n) then
        insert into org_units (parent_id, level, name, country_iso) values (cid, 'state_region', r.n, 'LR');
      end if;
    end loop;
  end if;
  select id into cid from org_units where level = 'country' and country_iso = 'LY' limit 1;
  if cid is not null then
    for r in select * from unnest(array['Al Butnan','Al Jabal al Akhdar','Al Jabal al Gharbi','Al Jafara','Al Jufra','Al Kufrah','Al Marj','Al Marqab','Al Wahat','An Nuqat al Khams','Az Zawiyah','Benghazi','Derna','Ghat','Misrata','Murzuq','Nalut','Sabha','Sirte','Tripoli','Wadi al Hayat','Wadi ash Shati']) as s(n) loop
      if not exists (select 1 from org_units where parent_id = cid and level = 'state_region' and name = r.n) then
        insert into org_units (parent_id, level, name, country_iso) values (cid, 'state_region', r.n, 'LY');
      end if;
    end loop;
  end if;
  select id into cid from org_units where level = 'country' and country_iso = 'MG' limit 1;
  if cid is not null then
    for r in select * from unnest(array['Alaotra-Mangoro','Amoron''i Mania','Analamanga','Analanjirofo','Androy','Anosy','Atsimo-Andrefana','Atsimo-Atsinanana','Atsinanana','Betsiboka','Boeny','Bongolava','Diana','Fitovinany','Haute Matsiatra','Ihorombe','Itasy','Melaky','Menabe','Sava','Sofia','Vakinankaratra','Vatovavy']) as s(n) loop
      if not exists (select 1 from org_units where parent_id = cid and level = 'state_region' and name = r.n) then
        insert into org_units (parent_id, level, name, country_iso) values (cid, 'state_region', r.n, 'MG');
      end if;
    end loop;
  end if;
  select id into cid from org_units where level = 'country' and country_iso = 'MW' limit 1;
  if cid is not null then
    for r in select * from unnest(array['Central Region','Northern Region','Southern Region']) as s(n) loop
      if not exists (select 1 from org_units where parent_id = cid and level = 'state_region' and name = r.n) then
        insert into org_units (parent_id, level, name, country_iso) values (cid, 'state_region', r.n, 'MW');
      end if;
    end loop;
  end if;
  select id into cid from org_units where level = 'country' and country_iso = 'ML' limit 1;
  if cid is not null then
    for r in select * from unnest(array['Bamako','Gao','Kayes','Kidal','Koulikoro','Mopti','Ménaka','Ségou','Sikasso','Taoudénit','Tombouctou']) as s(n) loop
      if not exists (select 1 from org_units where parent_id = cid and level = 'state_region' and name = r.n) then
        insert into org_units (parent_id, level, name, country_iso) values (cid, 'state_region', r.n, 'ML');
      end if;
    end loop;
  end if;
  select id into cid from org_units where level = 'country' and country_iso = 'MR' limit 1;
  if cid is not null then
    for r in select * from unnest(array['Adrar','Assaba','Brakna','Dakhlet Nouadhibou','Gorgol','Guidimaka','Hodh Ech Chargui','Hodh El Gharbi','Inchiri','Nouakchott Nord','Nouakchott Ouest','Nouakchott Sud','Tagant','Tiris Zemmour','Trarza']) as s(n) loop
      if not exists (select 1 from org_units where parent_id = cid and level = 'state_region' and name = r.n) then
        insert into org_units (parent_id, level, name, country_iso) values (cid, 'state_region', r.n, 'MR');
      end if;
    end loop;
  end if;
  select id into cid from org_units where level = 'country' and country_iso = 'MU' limit 1;
  if cid is not null then
    for r in select * from unnest(array['Black River','Flacq','Grand Port','Moka','Pamplemousses','Plaines Wilhems','Port Louis','Rivière du Rempart','Savanne','Rodrigues','Agaléga','Cargados Carajos']) as s(n) loop
      if not exists (select 1 from org_units where parent_id = cid and level = 'state_region' and name = r.n) then
        insert into org_units (parent_id, level, name, country_iso) values (cid, 'state_region', r.n, 'MU');
      end if;
    end loop;
  end if;
  select id into cid from org_units where level = 'country' and country_iso = 'MA' limit 1;
  if cid is not null then
    for r in select * from unnest(array['Tanger-Tétouan-Al Hoceïma','Oriental','Fès-Meknès','Rabat-Salé-Kénitra','Béni Mellal-Khénifra','Casablanca-Settat','Marrakech-Safi','Drâa-Tafilalet','Souss-Massa','Guelmim-Oued Noun','Laâyoune-Sakia El Hamra','Dakhla-Oued Ed-Dahab']) as s(n) loop
      if not exists (select 1 from org_units where parent_id = cid and level = 'state_region' and name = r.n) then
        insert into org_units (parent_id, level, name, country_iso) values (cid, 'state_region', r.n, 'MA');
      end if;
    end loop;
  end if;
  select id into cid from org_units where level = 'country' and country_iso = 'MZ' limit 1;
  if cid is not null then
    for r in select * from unnest(array['Cabo Delgado','Gaza','Inhambane','Manica','Maputo','Maputo City','Nampula','Niassa','Sofala','Tete','Zambézia']) as s(n) loop
      if not exists (select 1 from org_units where parent_id = cid and level = 'state_region' and name = r.n) then
        insert into org_units (parent_id, level, name, country_iso) values (cid, 'state_region', r.n, 'MZ');
      end if;
    end loop;
  end if;
  select id into cid from org_units where level = 'country' and country_iso = 'NA' limit 1;
  if cid is not null then
    for r in select * from unnest(array['Erongo','Hardap','Karas','Kavango East','Kavango West','Khomas','Kunene','Ohangwena','Omaheke','Omusati','Oshana','Oshikoto','Otjozondjupa','Zambezi']) as s(n) loop
      if not exists (select 1 from org_units where parent_id = cid and level = 'state_region' and name = r.n) then
        insert into org_units (parent_id, level, name, country_iso) values (cid, 'state_region', r.n, 'NA');
      end if;
    end loop;
  end if;
  select id into cid from org_units where level = 'country' and country_iso = 'NE' limit 1;
  if cid is not null then
    for r in select * from unnest(array['Agadez','Diffa','Dosso','Maradi','Niamey','Tahoua','Tillabéri','Zinder']) as s(n) loop
      if not exists (select 1 from org_units where parent_id = cid and level = 'state_region' and name = r.n) then
        insert into org_units (parent_id, level, name, country_iso) values (cid, 'state_region', r.n, 'NE');
      end if;
    end loop;
  end if;
  select id into cid from org_units where level = 'country' and country_iso = 'RW' limit 1;
  if cid is not null then
    for r in select * from unnest(array['City of Kigali','Eastern Province','Northern Province','Southern Province','Western Province']) as s(n) loop
      if not exists (select 1 from org_units where parent_id = cid and level = 'state_region' and name = r.n) then
        insert into org_units (parent_id, level, name, country_iso) values (cid, 'state_region', r.n, 'RW');
      end if;
    end loop;
  end if;
  select id into cid from org_units where level = 'country' and country_iso = 'ST' limit 1;
  if cid is not null then
    for r in select * from unnest(array['Água Grande','Cantagalo','Caué','Lembá','Lobata','Mé-Zóchi','Príncipe']) as s(n) loop
      if not exists (select 1 from org_units where parent_id = cid and level = 'state_region' and name = r.n) then
        insert into org_units (parent_id, level, name, country_iso) values (cid, 'state_region', r.n, 'ST');
      end if;
    end loop;
  end if;
  select id into cid from org_units where level = 'country' and country_iso = 'SN' limit 1;
  if cid is not null then
    for r in select * from unnest(array['Dakar','Diourbel','Fatick','Kaffrine','Kaolack','Kédougou','Kolda','Louga','Matam','Saint-Louis','Sédhiou','Tambacounda','Thiès','Ziguinchor']) as s(n) loop
      if not exists (select 1 from org_units where parent_id = cid and level = 'state_region' and name = r.n) then
        insert into org_units (parent_id, level, name, country_iso) values (cid, 'state_region', r.n, 'SN');
      end if;
    end loop;
  end if;
  select id into cid from org_units where level = 'country' and country_iso = 'SC' limit 1;
  if cid is not null then
    for r in select * from unnest(array['Anse aux Pins','Anse Boileau','Anse Etoile','Anse Royale','Au Cap','Baie Lazare','Baie Sainte Anne','Beau Vallon','Bel Air','Bel Ombre','Cascade','Glacis','Grand''Anse Mahé','Grand''Anse Praslin','Ile Perseverance I','Ile Perseverance II','La Digue','Les Mamelles','Mont Buxton','Mont Fleuri','Plaisance','Pointe La Rue','Port Glaud','Roche Caïman','Saint Louis','Takamaka']) as s(n) loop
      if not exists (select 1 from org_units where parent_id = cid and level = 'state_region' and name = r.n) then
        insert into org_units (parent_id, level, name, country_iso) values (cid, 'state_region', r.n, 'SC');
      end if;
    end loop;
  end if;
  select id into cid from org_units where level = 'country' and country_iso = 'SL' limit 1;
  if cid is not null then
    for r in select * from unnest(array['Eastern','Northern','North West','Southern','Western Area']) as s(n) loop
      if not exists (select 1 from org_units where parent_id = cid and level = 'state_region' and name = r.n) then
        insert into org_units (parent_id, level, name, country_iso) values (cid, 'state_region', r.n, 'SL');
      end if;
    end loop;
  end if;
  select id into cid from org_units where level = 'country' and country_iso = 'SO' limit 1;
  if cid is not null then
    for r in select * from unnest(array['Awdal','Bakool','Banaadir','Bari','Bay','Galguduud','Gedo','Hiiraan','Jubbada Dhexe','Jubbada Hoose','Mudug','Nugaal','Sanaag','Shabeellaha Dhexe','Shabeellaha Hoose','Sool','Togdheer','Woqooyi Galbeed']) as s(n) loop
      if not exists (select 1 from org_units where parent_id = cid and level = 'state_region' and name = r.n) then
        insert into org_units (parent_id, level, name, country_iso) values (cid, 'state_region', r.n, 'SO');
      end if;
    end loop;
  end if;
  select id into cid from org_units where level = 'country' and country_iso = 'ZA' limit 1;
  if cid is not null then
    for r in select * from unnest(array['Eastern Cape','Free State','Gauteng','KwaZulu-Natal','Limpopo','Mpumalanga','North West','Northern Cape','Western Cape']) as s(n) loop
      if not exists (select 1 from org_units where parent_id = cid and level = 'state_region' and name = r.n) then
        insert into org_units (parent_id, level, name, country_iso) values (cid, 'state_region', r.n, 'ZA');
      end if;
    end loop;
  end if;
  select id into cid from org_units where level = 'country' and country_iso = 'SS' limit 1;
  if cid is not null then
    for r in select * from unnest(array['Central Equatoria','Eastern Equatoria','Jonglei','Lakes','Northern Bahr el Ghazal','Unity','Upper Nile','Warrap','Western Bahr el Ghazal','Western Equatoria']) as s(n) loop
      if not exists (select 1 from org_units where parent_id = cid and level = 'state_region' and name = r.n) then
        insert into org_units (parent_id, level, name, country_iso) values (cid, 'state_region', r.n, 'SS');
      end if;
    end loop;
  end if;
  select id into cid from org_units where level = 'country' and country_iso = 'SD' limit 1;
  if cid is not null then
    for r in select * from unnest(array['Al Jazirah','Al Qadarif','Blue Nile','Central Darfur','East Darfur','Kassala','Khartoum','North Darfur','North Kordofan','Northern','Red Sea','River Nile','Sennar','South Darfur','South Kordofan','West Darfur','West Kordofan','White Nile']) as s(n) loop
      if not exists (select 1 from org_units where parent_id = cid and level = 'state_region' and name = r.n) then
        insert into org_units (parent_id, level, name, country_iso) values (cid, 'state_region', r.n, 'SD');
      end if;
    end loop;
  end if;
  select id into cid from org_units where level = 'country' and country_iso = 'TZ' limit 1;
  if cid is not null then
    for r in select * from unnest(array['Arusha','Dar es Salaam','Dodoma','Geita','Iringa','Kagera','Katavi','Kigoma','Kilimanjaro','Lindi','Manyara','Mara','Mbeya','Morogoro','Mtwara','Mwanza','Njombe','Pemba North','Pemba South','Pwani','Rukwa','Ruvuma','Shinyanga','Simiyu','Singida','Songwe','Tabora','Tanga','Zanzibar North','Zanzibar South and Central','Zanzibar Urban/West']) as s(n) loop
      if not exists (select 1 from org_units where parent_id = cid and level = 'state_region' and name = r.n) then
        insert into org_units (parent_id, level, name, country_iso) values (cid, 'state_region', r.n, 'TZ');
      end if;
    end loop;
  end if;
  select id into cid from org_units where level = 'country' and country_iso = 'TG' limit 1;
  if cid is not null then
    for r in select * from unnest(array['Centrale','Kara','Maritime','Plateaux','Savanes']) as s(n) loop
      if not exists (select 1 from org_units where parent_id = cid and level = 'state_region' and name = r.n) then
        insert into org_units (parent_id, level, name, country_iso) values (cid, 'state_region', r.n, 'TG');
      end if;
    end loop;
  end if;
  select id into cid from org_units where level = 'country' and country_iso = 'TN' limit 1;
  if cid is not null then
    for r in select * from unnest(array['Ariana','Béja','Ben Arous','Bizerte','Gabès','Gafsa','Jendouba','Kairouan','Kasserine','Kébili','Kef','Mahdia','Manouba','Médenine','Monastir','Nabeul','Sfax','Sidi Bouzid','Siliana','Sousse','Tataouine','Tozeur','Tunis','Zaghouan']) as s(n) loop
      if not exists (select 1 from org_units where parent_id = cid and level = 'state_region' and name = r.n) then
        insert into org_units (parent_id, level, name, country_iso) values (cid, 'state_region', r.n, 'TN');
      end if;
    end loop;
  end if;
  select id into cid from org_units where level = 'country' and country_iso = 'UG' limit 1;
  if cid is not null then
    for r in select * from unnest(array['Central Region','Eastern Region','Northern Region','Western Region']) as s(n) loop
      if not exists (select 1 from org_units where parent_id = cid and level = 'state_region' and name = r.n) then
        insert into org_units (parent_id, level, name, country_iso) values (cid, 'state_region', r.n, 'UG');
      end if;
    end loop;
  end if;
  select id into cid from org_units where level = 'country' and country_iso = 'ZM' limit 1;
  if cid is not null then
    for r in select * from unnest(array['Central','Copperbelt','Eastern','Luapula','Lusaka','Muchinga','Northern','North-Western','Southern','Western']) as s(n) loop
      if not exists (select 1 from org_units where parent_id = cid and level = 'state_region' and name = r.n) then
        insert into org_units (parent_id, level, name, country_iso) values (cid, 'state_region', r.n, 'ZM');
      end if;
    end loop;
  end if;
  select id into cid from org_units where level = 'country' and country_iso = 'ZW' limit 1;
  if cid is not null then
    for r in select * from unnest(array['Bulawayo','Harare','Manicaland','Mashonaland Central','Mashonaland East','Mashonaland West','Masvingo','Matabeleland North','Matabeleland South','Midlands']) as s(n) loop
      if not exists (select 1 from org_units where parent_id = cid and level = 'state_region' and name = r.n) then
        insert into org_units (parent_id, level, name, country_iso) values (cid, 'state_region', r.n, 'ZW');
      end if;
    end loop;
  end if;
  select s.id into sid from org_units s join org_units c on c.id = s.parent_id
   where c.level = 'country' and c.country_iso = 'RW' and s.level = 'state_region' and s.name = 'City of Kigali' limit 1;
  if sid is not null then
    for r in select * from unnest(array['Gasabo','Kicukiro','Nyarugenge']) as s(n) loop
      if not exists (select 1 from org_units where parent_id = sid and level = 'district_lga' and name = r.n) then
        insert into org_units (parent_id, level, name, country_iso) values (sid, 'district_lga', r.n, 'RW');
      end if;
    end loop;
  end if;
  select s.id into sid from org_units s join org_units c on c.id = s.parent_id
   where c.level = 'country' and c.country_iso = 'RW' and s.level = 'state_region' and s.name = 'Eastern Province' limit 1;
  if sid is not null then
    for r in select * from unnest(array['Bugesera','Gatsibo','Kayonza','Kirehe','Ngoma','Nyagatare','Rwamagana']) as s(n) loop
      if not exists (select 1 from org_units where parent_id = sid and level = 'district_lga' and name = r.n) then
        insert into org_units (parent_id, level, name, country_iso) values (sid, 'district_lga', r.n, 'RW');
      end if;
    end loop;
  end if;
  select s.id into sid from org_units s join org_units c on c.id = s.parent_id
   where c.level = 'country' and c.country_iso = 'RW' and s.level = 'state_region' and s.name = 'Northern Province' limit 1;
  if sid is not null then
    for r in select * from unnest(array['Burera','Gakenke','Gicumbi','Musanze','Rulindo']) as s(n) loop
      if not exists (select 1 from org_units where parent_id = sid and level = 'district_lga' and name = r.n) then
        insert into org_units (parent_id, level, name, country_iso) values (sid, 'district_lga', r.n, 'RW');
      end if;
    end loop;
  end if;
  select s.id into sid from org_units s join org_units c on c.id = s.parent_id
   where c.level = 'country' and c.country_iso = 'RW' and s.level = 'state_region' and s.name = 'Southern Province' limit 1;
  if sid is not null then
    for r in select * from unnest(array['Gisagara','Huye','Kamonyi','Muhanga','Nyamagabe','Nyanza','Nyaruguru','Ruhango']) as s(n) loop
      if not exists (select 1 from org_units where parent_id = sid and level = 'district_lga' and name = r.n) then
        insert into org_units (parent_id, level, name, country_iso) values (sid, 'district_lga', r.n, 'RW');
      end if;
    end loop;
  end if;
  select s.id into sid from org_units s join org_units c on c.id = s.parent_id
   where c.level = 'country' and c.country_iso = 'RW' and s.level = 'state_region' and s.name = 'Western Province' limit 1;
  if sid is not null then
    for r in select * from unnest(array['Karongi','Ngororero','Nyabihu','Nyamasheke','Rubavu','Rusizi','Rutsiro']) as s(n) loop
      if not exists (select 1 from org_units where parent_id = sid and level = 'district_lga' and name = r.n) then
        insert into org_units (parent_id, level, name, country_iso) values (sid, 'district_lga', r.n, 'RW');
      end if;
    end loop;
  end if;
  select s.id into sid from org_units s join org_units c on c.id = s.parent_id
   where c.level = 'country' and c.country_iso = 'UG' and s.level = 'state_region' and s.name = 'Central Region' limit 1;
  if sid is not null then
    for r in select * from unnest(array['Buikwe','Bukomansimbi','Butambala','Buvuma','Gomba','Kalangala','Kalungu','Kampala','Kassanda','Kayunga','Kiboga','Kyankwanzi','Kyotera','Luwero','Lwengo','Lyantonde','Masaka','Mityana','Mpigi','Mubende','Mukono','Nakaseke','Nakasongola','Rakai','Sembabule','Wakiso']) as s(n) loop
      if not exists (select 1 from org_units where parent_id = sid and level = 'district_lga' and name = r.n) then
        insert into org_units (parent_id, level, name, country_iso) values (sid, 'district_lga', r.n, 'UG');
      end if;
    end loop;
  end if;
  select s.id into sid from org_units s join org_units c on c.id = s.parent_id
   where c.level = 'country' and c.country_iso = 'UG' and s.level = 'state_region' and s.name = 'Eastern Region' limit 1;
  if sid is not null then
    for r in select * from unnest(array['Amuria','Budaka','Bududa','Bugiri','Bugweri','Bukedea','Bukwo','Bulambuli','Busia','Butaleja','Butebo','Buyende','Iganga','Jinja','Kaberamaido','Kalaki','Kamuli','Kapchorwa','Kapelebyong','Katakwi','Kibuku','Kumi','Kween','Luuka','Manafwa','Mayuge','Mbale','Namayingo','Namisindwa','Namutumba','Ngora','Pallisa','Serere','Sironko','Soroti','Tororo']) as s(n) loop
      if not exists (select 1 from org_units where parent_id = sid and level = 'district_lga' and name = r.n) then
        insert into org_units (parent_id, level, name, country_iso) values (sid, 'district_lga', r.n, 'UG');
      end if;
    end loop;
  end if;
  select s.id into sid from org_units s join org_units c on c.id = s.parent_id
   where c.level = 'country' and c.country_iso = 'UG' and s.level = 'state_region' and s.name = 'Northern Region' limit 1;
  if sid is not null then
    for r in select * from unnest(array['Abim','Adjumani','Agago','Alebtong','Amolatar','Amudat','Amuru','Apac','Arua','Dokolo','Gulu','Kaabong','Karenga','Kitgum','Koboko','Kole','Kotido','Kwania','Lamwo','Lira','Madi-Okollo','Maracha','Moroto','Moyo','Nabilatuk','Nakapiripirit','Napak','Nebbi','Nwoya','Obongi','Omoro','Otuke','Oyam','Pader','Pakwach','Terego','Yumbe','Zombo']) as s(n) loop
      if not exists (select 1 from org_units where parent_id = sid and level = 'district_lga' and name = r.n) then
        insert into org_units (parent_id, level, name, country_iso) values (sid, 'district_lga', r.n, 'UG');
      end if;
    end loop;
  end if;
  select s.id into sid from org_units s join org_units c on c.id = s.parent_id
   where c.level = 'country' and c.country_iso = 'UG' and s.level = 'state_region' and s.name = 'Western Region' limit 1;
  if sid is not null then
    for r in select * from unnest(array['Buhweju','Buliisa','Bundibugyo','Bunyangabu','Bushenyi','Hoima','Ibanda','Isingiro','Kabale','Kabarole','Kagadi','Kakumiro','Kamwenge','Kanungu','Kasese','Kazo','Kibaale','Kikuube','Kiruhura','Kiryandongo','Kisoro','Kitagwenda','Kyegegwa','Kyenjojo','Masindi','Mbarara','Mitooma','Ntoroko','Ntungamo','Rubanda','Rubirizi','Rukiga','Rukungiri','Rwampara','Sheema']) as s(n) loop
      if not exists (select 1 from org_units where parent_id = sid and level = 'district_lga' and name = r.n) then
        insert into org_units (parent_id, level, name, country_iso) values (sid, 'district_lga', r.n, 'UG');
      end if;
    end loop;
  end if;
  select s.id into sid from org_units s join org_units c on c.id = s.parent_id
   where c.level = 'country' and c.country_iso = 'MW' and s.level = 'state_region' and s.name = 'Northern Region' limit 1;
  if sid is not null then
    for r in select * from unnest(array['Chitipa','Karonga','Likoma','Mzimba','Nkhata Bay','Rumphi']) as s(n) loop
      if not exists (select 1 from org_units where parent_id = sid and level = 'district_lga' and name = r.n) then
        insert into org_units (parent_id, level, name, country_iso) values (sid, 'district_lga', r.n, 'MW');
      end if;
    end loop;
  end if;
  select s.id into sid from org_units s join org_units c on c.id = s.parent_id
   where c.level = 'country' and c.country_iso = 'MW' and s.level = 'state_region' and s.name = 'Central Region' limit 1;
  if sid is not null then
    for r in select * from unnest(array['Dedza','Dowa','Kasungu','Lilongwe','Mchinji','Nkhotakota','Ntcheu','Ntchisi','Salima']) as s(n) loop
      if not exists (select 1 from org_units where parent_id = sid and level = 'district_lga' and name = r.n) then
        insert into org_units (parent_id, level, name, country_iso) values (sid, 'district_lga', r.n, 'MW');
      end if;
    end loop;
  end if;
  select s.id into sid from org_units s join org_units c on c.id = s.parent_id
   where c.level = 'country' and c.country_iso = 'MW' and s.level = 'state_region' and s.name = 'Southern Region' limit 1;
  if sid is not null then
    for r in select * from unnest(array['Balaka','Blantyre','Chikwawa','Chiradzulu','Machinga','Mangochi','Mulanje','Mwanza','Neno','Nsanje','Phalombe','Thyolo','Zomba']) as s(n) loop
      if not exists (select 1 from org_units where parent_id = sid and level = 'district_lga' and name = r.n) then
        insert into org_units (parent_id, level, name, country_iso) values (sid, 'district_lga', r.n, 'MW');
      end if;
    end loop;
  end if;
  select s.id into sid from org_units s join org_units c on c.id = s.parent_id
   where c.level = 'country' and c.country_iso = 'SL' and s.level = 'state_region' and s.name = 'Eastern' limit 1;
  if sid is not null then
    for r in select * from unnest(array['Kailahun','Kenema','Kono']) as s(n) loop
      if not exists (select 1 from org_units where parent_id = sid and level = 'district_lga' and name = r.n) then
        insert into org_units (parent_id, level, name, country_iso) values (sid, 'district_lga', r.n, 'SL');
      end if;
    end loop;
  end if;
  select s.id into sid from org_units s join org_units c on c.id = s.parent_id
   where c.level = 'country' and c.country_iso = 'SL' and s.level = 'state_region' and s.name = 'Northern' limit 1;
  if sid is not null then
    for r in select * from unnest(array['Bombali','Falaba','Koinadugu','Tonkolili']) as s(n) loop
      if not exists (select 1 from org_units where parent_id = sid and level = 'district_lga' and name = r.n) then
        insert into org_units (parent_id, level, name, country_iso) values (sid, 'district_lga', r.n, 'SL');
      end if;
    end loop;
  end if;
  select s.id into sid from org_units s join org_units c on c.id = s.parent_id
   where c.level = 'country' and c.country_iso = 'SL' and s.level = 'state_region' and s.name = 'North West' limit 1;
  if sid is not null then
    for r in select * from unnest(array['Kambia','Karene','Port Loko']) as s(n) loop
      if not exists (select 1 from org_units where parent_id = sid and level = 'district_lga' and name = r.n) then
        insert into org_units (parent_id, level, name, country_iso) values (sid, 'district_lga', r.n, 'SL');
      end if;
    end loop;
  end if;
  select s.id into sid from org_units s join org_units c on c.id = s.parent_id
   where c.level = 'country' and c.country_iso = 'SL' and s.level = 'state_region' and s.name = 'Southern' limit 1;
  if sid is not null then
    for r in select * from unnest(array['Bo','Bonthe','Moyamba','Pujehun']) as s(n) loop
      if not exists (select 1 from org_units where parent_id = sid and level = 'district_lga' and name = r.n) then
        insert into org_units (parent_id, level, name, country_iso) values (sid, 'district_lga', r.n, 'SL');
      end if;
    end loop;
  end if;
  select s.id into sid from org_units s join org_units c on c.id = s.parent_id
   where c.level = 'country' and c.country_iso = 'SL' and s.level = 'state_region' and s.name = 'Western Area' limit 1;
  if sid is not null then
    for r in select * from unnest(array['Western Area Rural','Western Area Urban']) as s(n) loop
      if not exists (select 1 from org_units where parent_id = sid and level = 'district_lga' and name = r.n) then
        insert into org_units (parent_id, level, name, country_iso) values (sid, 'district_lga', r.n, 'SL');
      end if;
    end loop;
  end if;
  select s.id into sid from org_units s join org_units c on c.id = s.parent_id
   where c.level = 'country' and c.country_iso = 'ZA' and s.level = 'state_region' and s.name = 'Eastern Cape' limit 1;
  if sid is not null then
    for r in select * from unnest(array['Alfred Nzo','Amathole','Buffalo City','Chris Hani','Joe Gqabi','Nelson Mandela Bay','OR Tambo','Sarah Baartman']) as s(n) loop
      if not exists (select 1 from org_units where parent_id = sid and level = 'district_lga' and name = r.n) then
        insert into org_units (parent_id, level, name, country_iso) values (sid, 'district_lga', r.n, 'ZA');
      end if;
    end loop;
  end if;
  select s.id into sid from org_units s join org_units c on c.id = s.parent_id
   where c.level = 'country' and c.country_iso = 'ZA' and s.level = 'state_region' and s.name = 'Free State' limit 1;
  if sid is not null then
    for r in select * from unnest(array['Fezile Dabi','Lejweleputswa','Mangaung','Thabo Mofutsanyana','Xhariep']) as s(n) loop
      if not exists (select 1 from org_units where parent_id = sid and level = 'district_lga' and name = r.n) then
        insert into org_units (parent_id, level, name, country_iso) values (sid, 'district_lga', r.n, 'ZA');
      end if;
    end loop;
  end if;
  select s.id into sid from org_units s join org_units c on c.id = s.parent_id
   where c.level = 'country' and c.country_iso = 'ZA' and s.level = 'state_region' and s.name = 'Gauteng' limit 1;
  if sid is not null then
    for r in select * from unnest(array['City of Ekurhuleni','City of Johannesburg','City of Tshwane','Sedibeng','West Rand']) as s(n) loop
      if not exists (select 1 from org_units where parent_id = sid and level = 'district_lga' and name = r.n) then
        insert into org_units (parent_id, level, name, country_iso) values (sid, 'district_lga', r.n, 'ZA');
      end if;
    end loop;
  end if;
  select s.id into sid from org_units s join org_units c on c.id = s.parent_id
   where c.level = 'country' and c.country_iso = 'ZA' and s.level = 'state_region' and s.name = 'KwaZulu-Natal' limit 1;
  if sid is not null then
    for r in select * from unnest(array['Amajuba','eThekwini','Harry Gwala','iLembe','King Cetshwayo','Ugu','uMgungundlovu','uMkhanyakude','uMzinyathi','uThukela','Zululand']) as s(n) loop
      if not exists (select 1 from org_units where parent_id = sid and level = 'district_lga' and name = r.n) then
        insert into org_units (parent_id, level, name, country_iso) values (sid, 'district_lga', r.n, 'ZA');
      end if;
    end loop;
  end if;
  select s.id into sid from org_units s join org_units c on c.id = s.parent_id
   where c.level = 'country' and c.country_iso = 'ZA' and s.level = 'state_region' and s.name = 'Limpopo' limit 1;
  if sid is not null then
    for r in select * from unnest(array['Capricorn','Mopani','Sekhukhune','Vhembe','Waterberg']) as s(n) loop
      if not exists (select 1 from org_units where parent_id = sid and level = 'district_lga' and name = r.n) then
        insert into org_units (parent_id, level, name, country_iso) values (sid, 'district_lga', r.n, 'ZA');
      end if;
    end loop;
  end if;
  select s.id into sid from org_units s join org_units c on c.id = s.parent_id
   where c.level = 'country' and c.country_iso = 'ZA' and s.level = 'state_region' and s.name = 'Mpumalanga' limit 1;
  if sid is not null then
    for r in select * from unnest(array['Ehlanzeni','Gert Sibande','Nkangala']) as s(n) loop
      if not exists (select 1 from org_units where parent_id = sid and level = 'district_lga' and name = r.n) then
        insert into org_units (parent_id, level, name, country_iso) values (sid, 'district_lga', r.n, 'ZA');
      end if;
    end loop;
  end if;
  select s.id into sid from org_units s join org_units c on c.id = s.parent_id
   where c.level = 'country' and c.country_iso = 'ZA' and s.level = 'state_region' and s.name = 'North West' limit 1;
  if sid is not null then
    for r in select * from unnest(array['Bojanala Platinum','Dr Kenneth Kaunda','Dr Ruth Segomotsi Mompati','Ngaka Modiri Molema']) as s(n) loop
      if not exists (select 1 from org_units where parent_id = sid and level = 'district_lga' and name = r.n) then
        insert into org_units (parent_id, level, name, country_iso) values (sid, 'district_lga', r.n, 'ZA');
      end if;
    end loop;
  end if;
  select s.id into sid from org_units s join org_units c on c.id = s.parent_id
   where c.level = 'country' and c.country_iso = 'ZA' and s.level = 'state_region' and s.name = 'Northern Cape' limit 1;
  if sid is not null then
    for r in select * from unnest(array['Frances Baard','John Taolo Gaetsewe','Namakwa','Pixley ka Seme','ZF Mgcawu']) as s(n) loop
      if not exists (select 1 from org_units where parent_id = sid and level = 'district_lga' and name = r.n) then
        insert into org_units (parent_id, level, name, country_iso) values (sid, 'district_lga', r.n, 'ZA');
      end if;
    end loop;
  end if;
  select s.id into sid from org_units s join org_units c on c.id = s.parent_id
   where c.level = 'country' and c.country_iso = 'ZA' and s.level = 'state_region' and s.name = 'Western Cape' limit 1;
  if sid is not null then
    for r in select * from unnest(array['Cape Winelands','Central Karoo','City of Cape Town','Garden Route','Overberg','West Coast']) as s(n) loop
      if not exists (select 1 from org_units where parent_id = sid and level = 'district_lga' and name = r.n) then
        insert into org_units (parent_id, level, name, country_iso) values (sid, 'district_lga', r.n, 'ZA');
      end if;
    end loop;
  end if;
  select s.id into sid from org_units s join org_units c on c.id = s.parent_id
   where c.level = 'country' and c.country_iso = 'CM' and s.level = 'state_region' and s.name = 'Adamawa' limit 1;
  if sid is not null then
    for r in select * from unnest(array['Djérem','Faro-et-Déo','Mayo-Banyo','Mbéré','Vina']) as s(n) loop
      if not exists (select 1 from org_units where parent_id = sid and level = 'district_lga' and name = r.n) then
        insert into org_units (parent_id, level, name, country_iso) values (sid, 'district_lga', r.n, 'CM');
      end if;
    end loop;
  end if;
  select s.id into sid from org_units s join org_units c on c.id = s.parent_id
   where c.level = 'country' and c.country_iso = 'CM' and s.level = 'state_region' and s.name = 'Centre' limit 1;
  if sid is not null then
    for r in select * from unnest(array['Haute-Sanaga','Lekié','Mbam-et-Inoubou','Mbam-et-Kim','Méfou-et-Afamba','Méfou-et-Akono','Mfoundi','Nyong-et-Kéllé','Nyong-et-Mfoumou','Nyong-et-So''o']) as s(n) loop
      if not exists (select 1 from org_units where parent_id = sid and level = 'district_lga' and name = r.n) then
        insert into org_units (parent_id, level, name, country_iso) values (sid, 'district_lga', r.n, 'CM');
      end if;
    end loop;
  end if;
  select s.id into sid from org_units s join org_units c on c.id = s.parent_id
   where c.level = 'country' and c.country_iso = 'CM' and s.level = 'state_region' and s.name = 'East' limit 1;
  if sid is not null then
    for r in select * from unnest(array['Boumba-et-Ngoko','Haut-Nyong','Kadey','Lom-et-Djérem']) as s(n) loop
      if not exists (select 1 from org_units where parent_id = sid and level = 'district_lga' and name = r.n) then
        insert into org_units (parent_id, level, name, country_iso) values (sid, 'district_lga', r.n, 'CM');
      end if;
    end loop;
  end if;
  select s.id into sid from org_units s join org_units c on c.id = s.parent_id
   where c.level = 'country' and c.country_iso = 'CM' and s.level = 'state_region' and s.name = 'Far North' limit 1;
  if sid is not null then
    for r in select * from unnest(array['Diamaré','Logone-et-Chari','Mayo-Danay','Mayo-Kani','Mayo-Sava','Mayo-Tsanaga']) as s(n) loop
      if not exists (select 1 from org_units where parent_id = sid and level = 'district_lga' and name = r.n) then
        insert into org_units (parent_id, level, name, country_iso) values (sid, 'district_lga', r.n, 'CM');
      end if;
    end loop;
  end if;
  select s.id into sid from org_units s join org_units c on c.id = s.parent_id
   where c.level = 'country' and c.country_iso = 'CM' and s.level = 'state_region' and s.name = 'Littoral' limit 1;
  if sid is not null then
    for r in select * from unnest(array['Moungo','Nkam','Sanaga-Maritime','Wouri']) as s(n) loop
      if not exists (select 1 from org_units where parent_id = sid and level = 'district_lga' and name = r.n) then
        insert into org_units (parent_id, level, name, country_iso) values (sid, 'district_lga', r.n, 'CM');
      end if;
    end loop;
  end if;
  select s.id into sid from org_units s join org_units c on c.id = s.parent_id
   where c.level = 'country' and c.country_iso = 'CM' and s.level = 'state_region' and s.name = 'North' limit 1;
  if sid is not null then
    for r in select * from unnest(array['Bénoué','Faro','Mayo-Louti','Mayo-Rey']) as s(n) loop
      if not exists (select 1 from org_units where parent_id = sid and level = 'district_lga' and name = r.n) then
        insert into org_units (parent_id, level, name, country_iso) values (sid, 'district_lga', r.n, 'CM');
      end if;
    end loop;
  end if;
  select s.id into sid from org_units s join org_units c on c.id = s.parent_id
   where c.level = 'country' and c.country_iso = 'CM' and s.level = 'state_region' and s.name = 'North-West' limit 1;
  if sid is not null then
    for r in select * from unnest(array['Boyo','Bui','Donga-Mantung','Menchum','Mezam','Momo','Ngo-Ketunjia']) as s(n) loop
      if not exists (select 1 from org_units where parent_id = sid and level = 'district_lga' and name = r.n) then
        insert into org_units (parent_id, level, name, country_iso) values (sid, 'district_lga', r.n, 'CM');
      end if;
    end loop;
  end if;
  select s.id into sid from org_units s join org_units c on c.id = s.parent_id
   where c.level = 'country' and c.country_iso = 'CM' and s.level = 'state_region' and s.name = 'South' limit 1;
  if sid is not null then
    for r in select * from unnest(array['Dja-et-Lobo','Mvila','Océan','Vallée-du-Ntem']) as s(n) loop
      if not exists (select 1 from org_units where parent_id = sid and level = 'district_lga' and name = r.n) then
        insert into org_units (parent_id, level, name, country_iso) values (sid, 'district_lga', r.n, 'CM');
      end if;
    end loop;
  end if;
  select s.id into sid from org_units s join org_units c on c.id = s.parent_id
   where c.level = 'country' and c.country_iso = 'CM' and s.level = 'state_region' and s.name = 'South-West' limit 1;
  if sid is not null then
    for r in select * from unnest(array['Fako','Koupé-Manengouba','Lebialem','Manyu','Meme','Ndian']) as s(n) loop
      if not exists (select 1 from org_units where parent_id = sid and level = 'district_lga' and name = r.n) then
        insert into org_units (parent_id, level, name, country_iso) values (sid, 'district_lga', r.n, 'CM');
      end if;
    end loop;
  end if;
  select s.id into sid from org_units s join org_units c on c.id = s.parent_id
   where c.level = 'country' and c.country_iso = 'CM' and s.level = 'state_region' and s.name = 'West' limit 1;
  if sid is not null then
    for r in select * from unnest(array['Bamboutos','Haut-Nkam','Hauts-Plateaux','Koung-Khi','Menoua','Mifi','Ndé','Noun']) as s(n) loop
      if not exists (select 1 from org_units where parent_id = sid and level = 'district_lga' and name = r.n) then
        insert into org_units (parent_id, level, name, country_iso) values (sid, 'district_lga', r.n, 'CM');
      end if;
    end loop;
  end if;
  select s.id into sid from org_units s join org_units c on c.id = s.parent_id
   where c.level = 'country' and c.country_iso = 'TG' and s.level = 'state_region' and s.name = 'Maritime' limit 1;
  if sid is not null then
    for r in select * from unnest(array['Agoè-Nyivé','Avé','Bas-Mono','Golfe','Lacs','Vo','Yoto','Zio']) as s(n) loop
      if not exists (select 1 from org_units where parent_id = sid and level = 'district_lga' and name = r.n) then
        insert into org_units (parent_id, level, name, country_iso) values (sid, 'district_lga', r.n, 'TG');
      end if;
    end loop;
  end if;
  select s.id into sid from org_units s join org_units c on c.id = s.parent_id
   where c.level = 'country' and c.country_iso = 'TG' and s.level = 'state_region' and s.name = 'Plateaux' limit 1;
  if sid is not null then
    for r in select * from unnest(array['Agou','Akébou','Amou','Anié','Danyi','Est-Mono','Haho','Kloto','Kpélé','Moyen-Mono','Ogou','Wawa']) as s(n) loop
      if not exists (select 1 from org_units where parent_id = sid and level = 'district_lga' and name = r.n) then
        insert into org_units (parent_id, level, name, country_iso) values (sid, 'district_lga', r.n, 'TG');
      end if;
    end loop;
  end if;
  select s.id into sid from org_units s join org_units c on c.id = s.parent_id
   where c.level = 'country' and c.country_iso = 'TG' and s.level = 'state_region' and s.name = 'Centrale' limit 1;
  if sid is not null then
    for r in select * from unnest(array['Blitta','Mô','Sotouboua','Tchamba','Tchaoudjo']) as s(n) loop
      if not exists (select 1 from org_units where parent_id = sid and level = 'district_lga' and name = r.n) then
        insert into org_units (parent_id, level, name, country_iso) values (sid, 'district_lga', r.n, 'TG');
      end if;
    end loop;
  end if;
  select s.id into sid from org_units s join org_units c on c.id = s.parent_id
   where c.level = 'country' and c.country_iso = 'TG' and s.level = 'state_region' and s.name = 'Kara' limit 1;
  if sid is not null then
    for r in select * from unnest(array['Assoli','Bassar','Binah','Dankpen','Doufelgou','Kéran','Kozah']) as s(n) loop
      if not exists (select 1 from org_units where parent_id = sid and level = 'district_lga' and name = r.n) then
        insert into org_units (parent_id, level, name, country_iso) values (sid, 'district_lga', r.n, 'TG');
      end if;
    end loop;
  end if;
  select s.id into sid from org_units s join org_units c on c.id = s.parent_id
   where c.level = 'country' and c.country_iso = 'TG' and s.level = 'state_region' and s.name = 'Savanes' limit 1;
  if sid is not null then
    for r in select * from unnest(array['Cinkassé','Kpendjal','Kpendjal-Ouest','Oti','Oti-Sud','Tandjouaré','Tône']) as s(n) loop
      if not exists (select 1 from org_units where parent_id = sid and level = 'district_lga' and name = r.n) then
        insert into org_units (parent_id, level, name, country_iso) values (sid, 'district_lga', r.n, 'TG');
      end if;
    end loop;
  end if;
  select s.id into sid from org_units s join org_units c on c.id = s.parent_id
   where c.level = 'country' and c.country_iso = 'SN' and s.level = 'state_region' and s.name = 'Dakar' limit 1;
  if sid is not null then
    for r in select * from unnest(array['Dakar','Guédiawaye','Keur Massar','Pikine','Rufisque']) as s(n) loop
      if not exists (select 1 from org_units where parent_id = sid and level = 'district_lga' and name = r.n) then
        insert into org_units (parent_id, level, name, country_iso) values (sid, 'district_lga', r.n, 'SN');
      end if;
    end loop;
  end if;
  select s.id into sid from org_units s join org_units c on c.id = s.parent_id
   where c.level = 'country' and c.country_iso = 'SN' and s.level = 'state_region' and s.name = 'Diourbel' limit 1;
  if sid is not null then
    for r in select * from unnest(array['Bambey','Diourbel','Mbacké']) as s(n) loop
      if not exists (select 1 from org_units where parent_id = sid and level = 'district_lga' and name = r.n) then
        insert into org_units (parent_id, level, name, country_iso) values (sid, 'district_lga', r.n, 'SN');
      end if;
    end loop;
  end if;
  select s.id into sid from org_units s join org_units c on c.id = s.parent_id
   where c.level = 'country' and c.country_iso = 'SN' and s.level = 'state_region' and s.name = 'Fatick' limit 1;
  if sid is not null then
    for r in select * from unnest(array['Fatick','Foundiougne','Gossas']) as s(n) loop
      if not exists (select 1 from org_units where parent_id = sid and level = 'district_lga' and name = r.n) then
        insert into org_units (parent_id, level, name, country_iso) values (sid, 'district_lga', r.n, 'SN');
      end if;
    end loop;
  end if;
  select s.id into sid from org_units s join org_units c on c.id = s.parent_id
   where c.level = 'country' and c.country_iso = 'SN' and s.level = 'state_region' and s.name = 'Kaffrine' limit 1;
  if sid is not null then
    for r in select * from unnest(array['Birkelane','Kaffrine','Koungheul','Malem-Hodar']) as s(n) loop
      if not exists (select 1 from org_units where parent_id = sid and level = 'district_lga' and name = r.n) then
        insert into org_units (parent_id, level, name, country_iso) values (sid, 'district_lga', r.n, 'SN');
      end if;
    end loop;
  end if;
  select s.id into sid from org_units s join org_units c on c.id = s.parent_id
   where c.level = 'country' and c.country_iso = 'SN' and s.level = 'state_region' and s.name = 'Kaolack' limit 1;
  if sid is not null then
    for r in select * from unnest(array['Guinguinéo','Kaolack','Nioro du Rip']) as s(n) loop
      if not exists (select 1 from org_units where parent_id = sid and level = 'district_lga' and name = r.n) then
        insert into org_units (parent_id, level, name, country_iso) values (sid, 'district_lga', r.n, 'SN');
      end if;
    end loop;
  end if;
  select s.id into sid from org_units s join org_units c on c.id = s.parent_id
   where c.level = 'country' and c.country_iso = 'SN' and s.level = 'state_region' and s.name = 'Kédougou' limit 1;
  if sid is not null then
    for r in select * from unnest(array['Kédougou','Salémata','Saraya']) as s(n) loop
      if not exists (select 1 from org_units where parent_id = sid and level = 'district_lga' and name = r.n) then
        insert into org_units (parent_id, level, name, country_iso) values (sid, 'district_lga', r.n, 'SN');
      end if;
    end loop;
  end if;
  select s.id into sid from org_units s join org_units c on c.id = s.parent_id
   where c.level = 'country' and c.country_iso = 'SN' and s.level = 'state_region' and s.name = 'Kolda' limit 1;
  if sid is not null then
    for r in select * from unnest(array['Kolda','Médina Yoro Foulah','Vélingara']) as s(n) loop
      if not exists (select 1 from org_units where parent_id = sid and level = 'district_lga' and name = r.n) then
        insert into org_units (parent_id, level, name, country_iso) values (sid, 'district_lga', r.n, 'SN');
      end if;
    end loop;
  end if;
  select s.id into sid from org_units s join org_units c on c.id = s.parent_id
   where c.level = 'country' and c.country_iso = 'SN' and s.level = 'state_region' and s.name = 'Louga' limit 1;
  if sid is not null then
    for r in select * from unnest(array['Kébémer','Linguère','Louga']) as s(n) loop
      if not exists (select 1 from org_units where parent_id = sid and level = 'district_lga' and name = r.n) then
        insert into org_units (parent_id, level, name, country_iso) values (sid, 'district_lga', r.n, 'SN');
      end if;
    end loop;
  end if;
  select s.id into sid from org_units s join org_units c on c.id = s.parent_id
   where c.level = 'country' and c.country_iso = 'SN' and s.level = 'state_region' and s.name = 'Matam' limit 1;
  if sid is not null then
    for r in select * from unnest(array['Kanel','Matam','Ranérou']) as s(n) loop
      if not exists (select 1 from org_units where parent_id = sid and level = 'district_lga' and name = r.n) then
        insert into org_units (parent_id, level, name, country_iso) values (sid, 'district_lga', r.n, 'SN');
      end if;
    end loop;
  end if;
  select s.id into sid from org_units s join org_units c on c.id = s.parent_id
   where c.level = 'country' and c.country_iso = 'SN' and s.level = 'state_region' and s.name = 'Saint-Louis' limit 1;
  if sid is not null then
    for r in select * from unnest(array['Dagana','Podor','Saint-Louis']) as s(n) loop
      if not exists (select 1 from org_units where parent_id = sid and level = 'district_lga' and name = r.n) then
        insert into org_units (parent_id, level, name, country_iso) values (sid, 'district_lga', r.n, 'SN');
      end if;
    end loop;
  end if;
  select s.id into sid from org_units s join org_units c on c.id = s.parent_id
   where c.level = 'country' and c.country_iso = 'SN' and s.level = 'state_region' and s.name = 'Sédhiou' limit 1;
  if sid is not null then
    for r in select * from unnest(array['Bounkiling','Goudomp','Sédhiou']) as s(n) loop
      if not exists (select 1 from org_units where parent_id = sid and level = 'district_lga' and name = r.n) then
        insert into org_units (parent_id, level, name, country_iso) values (sid, 'district_lga', r.n, 'SN');
      end if;
    end loop;
  end if;
  select s.id into sid from org_units s join org_units c on c.id = s.parent_id
   where c.level = 'country' and c.country_iso = 'SN' and s.level = 'state_region' and s.name = 'Tambacounda' limit 1;
  if sid is not null then
    for r in select * from unnest(array['Bakel','Goudiry','Koumpentoum','Tambacounda']) as s(n) loop
      if not exists (select 1 from org_units where parent_id = sid and level = 'district_lga' and name = r.n) then
        insert into org_units (parent_id, level, name, country_iso) values (sid, 'district_lga', r.n, 'SN');
      end if;
    end loop;
  end if;
  select s.id into sid from org_units s join org_units c on c.id = s.parent_id
   where c.level = 'country' and c.country_iso = 'SN' and s.level = 'state_region' and s.name = 'Thiès' limit 1;
  if sid is not null then
    for r in select * from unnest(array['Mbour','Thiès','Tivaouane']) as s(n) loop
      if not exists (select 1 from org_units where parent_id = sid and level = 'district_lga' and name = r.n) then
        insert into org_units (parent_id, level, name, country_iso) values (sid, 'district_lga', r.n, 'SN');
      end if;
    end loop;
  end if;
  select s.id into sid from org_units s join org_units c on c.id = s.parent_id
   where c.level = 'country' and c.country_iso = 'SN' and s.level = 'state_region' and s.name = 'Ziguinchor' limit 1;
  if sid is not null then
    for r in select * from unnest(array['Bignona','Oussouye','Ziguinchor']) as s(n) loop
      if not exists (select 1 from org_units where parent_id = sid and level = 'district_lga' and name = r.n) then
        insert into org_units (parent_id, level, name, country_iso) values (sid, 'district_lga', r.n, 'SN');
      end if;
    end loop;
  end if;
  select s.id into sid from org_units s join org_units c on c.id = s.parent_id
   where c.level = 'country' and c.country_iso = 'BJ' and s.level = 'state_region' and s.name = 'Alibori' limit 1;
  if sid is not null then
    for r in select * from unnest(array['Banikoara','Gogounou','Kandi','Karimama','Malanville','Ségbana']) as s(n) loop
      if not exists (select 1 from org_units where parent_id = sid and level = 'district_lga' and name = r.n) then
        insert into org_units (parent_id, level, name, country_iso) values (sid, 'district_lga', r.n, 'BJ');
      end if;
    end loop;
  end if;
  select s.id into sid from org_units s join org_units c on c.id = s.parent_id
   where c.level = 'country' and c.country_iso = 'BJ' and s.level = 'state_region' and s.name = 'Atakora' limit 1;
  if sid is not null then
    for r in select * from unnest(array['Boukoumbé','Cobly','Kérou','Kouandé','Matéri','Natitingou','Péhunco','Tanguiéta','Toucountouna']) as s(n) loop
      if not exists (select 1 from org_units where parent_id = sid and level = 'district_lga' and name = r.n) then
        insert into org_units (parent_id, level, name, country_iso) values (sid, 'district_lga', r.n, 'BJ');
      end if;
    end loop;
  end if;
  select s.id into sid from org_units s join org_units c on c.id = s.parent_id
   where c.level = 'country' and c.country_iso = 'BJ' and s.level = 'state_region' and s.name = 'Atlantique' limit 1;
  if sid is not null then
    for r in select * from unnest(array['Abomey-Calavi','Allada','Kpomassè','Ouidah','Sô-Ava','Toffo','Tori-Bossito','Zè']) as s(n) loop
      if not exists (select 1 from org_units where parent_id = sid and level = 'district_lga' and name = r.n) then
        insert into org_units (parent_id, level, name, country_iso) values (sid, 'district_lga', r.n, 'BJ');
      end if;
    end loop;
  end if;
  select s.id into sid from org_units s join org_units c on c.id = s.parent_id
   where c.level = 'country' and c.country_iso = 'BJ' and s.level = 'state_region' and s.name = 'Borgou' limit 1;
  if sid is not null then
    for r in select * from unnest(array['Bembèrèkè','Kalalé','N''Dali','Nikki','Parakou','Pèrèrè','Sinendé','Tchaourou']) as s(n) loop
      if not exists (select 1 from org_units where parent_id = sid and level = 'district_lga' and name = r.n) then
        insert into org_units (parent_id, level, name, country_iso) values (sid, 'district_lga', r.n, 'BJ');
      end if;
    end loop;
  end if;
  select s.id into sid from org_units s join org_units c on c.id = s.parent_id
   where c.level = 'country' and c.country_iso = 'BJ' and s.level = 'state_region' and s.name = 'Collines' limit 1;
  if sid is not null then
    for r in select * from unnest(array['Bantè','Dassa-Zoumè','Glazoué','Ouèssè','Savalou','Savè']) as s(n) loop
      if not exists (select 1 from org_units where parent_id = sid and level = 'district_lga' and name = r.n) then
        insert into org_units (parent_id, level, name, country_iso) values (sid, 'district_lga', r.n, 'BJ');
      end if;
    end loop;
  end if;
  select s.id into sid from org_units s join org_units c on c.id = s.parent_id
   where c.level = 'country' and c.country_iso = 'BJ' and s.level = 'state_region' and s.name = 'Couffo' limit 1;
  if sid is not null then
    for r in select * from unnest(array['Aplahoué','Djakotomey','Dogbo','Klouékanmè','Lalo','Toviklin']) as s(n) loop
      if not exists (select 1 from org_units where parent_id = sid and level = 'district_lga' and name = r.n) then
        insert into org_units (parent_id, level, name, country_iso) values (sid, 'district_lga', r.n, 'BJ');
      end if;
    end loop;
  end if;
  select s.id into sid from org_units s join org_units c on c.id = s.parent_id
   where c.level = 'country' and c.country_iso = 'BJ' and s.level = 'state_region' and s.name = 'Donga' limit 1;
  if sid is not null then
    for r in select * from unnest(array['Bassila','Copargo','Djougou','Ouaké']) as s(n) loop
      if not exists (select 1 from org_units where parent_id = sid and level = 'district_lga' and name = r.n) then
        insert into org_units (parent_id, level, name, country_iso) values (sid, 'district_lga', r.n, 'BJ');
      end if;
    end loop;
  end if;
  select s.id into sid from org_units s join org_units c on c.id = s.parent_id
   where c.level = 'country' and c.country_iso = 'BJ' and s.level = 'state_region' and s.name = 'Littoral' limit 1;
  if sid is not null then
    for r in select * from unnest(array['Cotonou']) as s(n) loop
      if not exists (select 1 from org_units where parent_id = sid and level = 'district_lga' and name = r.n) then
        insert into org_units (parent_id, level, name, country_iso) values (sid, 'district_lga', r.n, 'BJ');
      end if;
    end loop;
  end if;
  select s.id into sid from org_units s join org_units c on c.id = s.parent_id
   where c.level = 'country' and c.country_iso = 'BJ' and s.level = 'state_region' and s.name = 'Mono' limit 1;
  if sid is not null then
    for r in select * from unnest(array['Athiémé','Bopa','Comè','Grand-Popo','Houéyogbé','Lokossa']) as s(n) loop
      if not exists (select 1 from org_units where parent_id = sid and level = 'district_lga' and name = r.n) then
        insert into org_units (parent_id, level, name, country_iso) values (sid, 'district_lga', r.n, 'BJ');
      end if;
    end loop;
  end if;
  select s.id into sid from org_units s join org_units c on c.id = s.parent_id
   where c.level = 'country' and c.country_iso = 'BJ' and s.level = 'state_region' and s.name = 'Ouémé' limit 1;
  if sid is not null then
    for r in select * from unnest(array['Adjarra','Adjohoun','Aguégués','Akpro-Missérété','Avrankou','Bonou','Dangbo','Porto-Novo','Sèmè-Kpodji']) as s(n) loop
      if not exists (select 1 from org_units where parent_id = sid and level = 'district_lga' and name = r.n) then
        insert into org_units (parent_id, level, name, country_iso) values (sid, 'district_lga', r.n, 'BJ');
      end if;
    end loop;
  end if;
  select s.id into sid from org_units s join org_units c on c.id = s.parent_id
   where c.level = 'country' and c.country_iso = 'BJ' and s.level = 'state_region' and s.name = 'Plateau' limit 1;
  if sid is not null then
    for r in select * from unnest(array['Adja-Ouèrè','Ifangni','Kétou','Pobè','Sakété']) as s(n) loop
      if not exists (select 1 from org_units where parent_id = sid and level = 'district_lga' and name = r.n) then
        insert into org_units (parent_id, level, name, country_iso) values (sid, 'district_lga', r.n, 'BJ');
      end if;
    end loop;
  end if;
  select s.id into sid from org_units s join org_units c on c.id = s.parent_id
   where c.level = 'country' and c.country_iso = 'BJ' and s.level = 'state_region' and s.name = 'Zou' limit 1;
  if sid is not null then
    for r in select * from unnest(array['Abomey','Agbangnizoun','Bohicon','Covè','Djidja','Ouinhi','Zagnanado','Za-Kpota','Zogbodomey']) as s(n) loop
      if not exists (select 1 from org_units where parent_id = sid and level = 'district_lga' and name = r.n) then
        insert into org_units (parent_id, level, name, country_iso) values (sid, 'district_lga', r.n, 'BJ');
      end if;
    end loop;
  end if;
  select s.id into sid from org_units s join org_units c on c.id = s.parent_id
   where c.level = 'country' and c.country_iso = 'ZW' and s.level = 'state_region' and s.name = 'Bulawayo' limit 1;
  if sid is not null then
    for r in select * from unnest(array['Bulawayo']) as s(n) loop
      if not exists (select 1 from org_units where parent_id = sid and level = 'district_lga' and name = r.n) then
        insert into org_units (parent_id, level, name, country_iso) values (sid, 'district_lga', r.n, 'ZW');
      end if;
    end loop;
  end if;
  select s.id into sid from org_units s join org_units c on c.id = s.parent_id
   where c.level = 'country' and c.country_iso = 'ZW' and s.level = 'state_region' and s.name = 'Harare' limit 1;
  if sid is not null then
    for r in select * from unnest(array['Harare','Chitungwiza','Epworth']) as s(n) loop
      if not exists (select 1 from org_units where parent_id = sid and level = 'district_lga' and name = r.n) then
        insert into org_units (parent_id, level, name, country_iso) values (sid, 'district_lga', r.n, 'ZW');
      end if;
    end loop;
  end if;
  select s.id into sid from org_units s join org_units c on c.id = s.parent_id
   where c.level = 'country' and c.country_iso = 'ZW' and s.level = 'state_region' and s.name = 'Manicaland' limit 1;
  if sid is not null then
    for r in select * from unnest(array['Buhera','Chimanimani','Chipinge','Makoni','Mutare','Mutasa','Nyanga']) as s(n) loop
      if not exists (select 1 from org_units where parent_id = sid and level = 'district_lga' and name = r.n) then
        insert into org_units (parent_id, level, name, country_iso) values (sid, 'district_lga', r.n, 'ZW');
      end if;
    end loop;
  end if;
  select s.id into sid from org_units s join org_units c on c.id = s.parent_id
   where c.level = 'country' and c.country_iso = 'ZW' and s.level = 'state_region' and s.name = 'Mashonaland Central' limit 1;
  if sid is not null then
    for r in select * from unnest(array['Bindura','Guruve','Mazowe','Mbire','Mount Darwin','Muzarabani','Rushinga','Shamva']) as s(n) loop
      if not exists (select 1 from org_units where parent_id = sid and level = 'district_lga' and name = r.n) then
        insert into org_units (parent_id, level, name, country_iso) values (sid, 'district_lga', r.n, 'ZW');
      end if;
    end loop;
  end if;
  select s.id into sid from org_units s join org_units c on c.id = s.parent_id
   where c.level = 'country' and c.country_iso = 'ZW' and s.level = 'state_region' and s.name = 'Mashonaland East' limit 1;
  if sid is not null then
    for r in select * from unnest(array['Chikomba','Goromonzi','Hwedza','Marondera','Mudzi','Murehwa','Mutoko','Seke','Uzumba-Maramba-Pfungwe']) as s(n) loop
      if not exists (select 1 from org_units where parent_id = sid and level = 'district_lga' and name = r.n) then
        insert into org_units (parent_id, level, name, country_iso) values (sid, 'district_lga', r.n, 'ZW');
      end if;
    end loop;
  end if;
  select s.id into sid from org_units s join org_units c on c.id = s.parent_id
   where c.level = 'country' and c.country_iso = 'ZW' and s.level = 'state_region' and s.name = 'Mashonaland West' limit 1;
  if sid is not null then
    for r in select * from unnest(array['Chegutu','Hurungwe','Kariba','Makonde','Mhondoro-Ngezi','Sanyati','Zvimba']) as s(n) loop
      if not exists (select 1 from org_units where parent_id = sid and level = 'district_lga' and name = r.n) then
        insert into org_units (parent_id, level, name, country_iso) values (sid, 'district_lga', r.n, 'ZW');
      end if;
    end loop;
  end if;
  select s.id into sid from org_units s join org_units c on c.id = s.parent_id
   where c.level = 'country' and c.country_iso = 'ZW' and s.level = 'state_region' and s.name = 'Masvingo' limit 1;
  if sid is not null then
    for r in select * from unnest(array['Bikita','Chiredzi','Chivi','Gutu','Masvingo','Mwenezi','Zaka']) as s(n) loop
      if not exists (select 1 from org_units where parent_id = sid and level = 'district_lga' and name = r.n) then
        insert into org_units (parent_id, level, name, country_iso) values (sid, 'district_lga', r.n, 'ZW');
      end if;
    end loop;
  end if;
  select s.id into sid from org_units s join org_units c on c.id = s.parent_id
   where c.level = 'country' and c.country_iso = 'ZW' and s.level = 'state_region' and s.name = 'Matabeleland North' limit 1;
  if sid is not null then
    for r in select * from unnest(array['Binga','Bubi','Hwange','Lupane','Nkayi','Tsholotsho','Umguza']) as s(n) loop
      if not exists (select 1 from org_units where parent_id = sid and level = 'district_lga' and name = r.n) then
        insert into org_units (parent_id, level, name, country_iso) values (sid, 'district_lga', r.n, 'ZW');
      end if;
    end loop;
  end if;
  select s.id into sid from org_units s join org_units c on c.id = s.parent_id
   where c.level = 'country' and c.country_iso = 'ZW' and s.level = 'state_region' and s.name = 'Matabeleland South' limit 1;
  if sid is not null then
    for r in select * from unnest(array['Beitbridge','Bulilima','Gwanda','Insiza','Mangwe','Matobo','Umzingwane']) as s(n) loop
      if not exists (select 1 from org_units where parent_id = sid and level = 'district_lga' and name = r.n) then
        insert into org_units (parent_id, level, name, country_iso) values (sid, 'district_lga', r.n, 'ZW');
      end if;
    end loop;
  end if;
  select s.id into sid from org_units s join org_units c on c.id = s.parent_id
   where c.level = 'country' and c.country_iso = 'ZW' and s.level = 'state_region' and s.name = 'Midlands' limit 1;
  if sid is not null then
    for r in select * from unnest(array['Chirumhanzu','Gokwe North','Gokwe South','Gweru','Kwekwe','Mberengwa','Shurugwi','Zvishavane']) as s(n) loop
      if not exists (select 1 from org_units where parent_id = sid and level = 'district_lga' and name = r.n) then
        insert into org_units (parent_id, level, name, country_iso) values (sid, 'district_lga', r.n, 'ZW');
      end if;
    end loop;
  end if;
  select s.id into sid from org_units s join org_units c on c.id = s.parent_id
   where c.level = 'country' and c.country_iso = 'ZM' and s.level = 'state_region' and s.name = 'Central' limit 1;
  if sid is not null then
    for r in select * from unnest(array['Chibombo','Chisamba','Chitambo','Itezhi-Tezhi','Kabwe','Kapiri Mposhi','Luano','Mkushi','Mumbwa','Ngabwe','Serenje','Shibuyunji']) as s(n) loop
      if not exists (select 1 from org_units where parent_id = sid and level = 'district_lga' and name = r.n) then
        insert into org_units (parent_id, level, name, country_iso) values (sid, 'district_lga', r.n, 'ZM');
      end if;
    end loop;
  end if;
  select s.id into sid from org_units s join org_units c on c.id = s.parent_id
   where c.level = 'country' and c.country_iso = 'ZM' and s.level = 'state_region' and s.name = 'Copperbelt' limit 1;
  if sid is not null then
    for r in select * from unnest(array['Chililabombwe','Chingola','Kalulushi','Kitwe','Luanshya','Lufwanyama','Masaiti','Mpongwe','Mufulira','Ndola']) as s(n) loop
      if not exists (select 1 from org_units where parent_id = sid and level = 'district_lga' and name = r.n) then
        insert into org_units (parent_id, level, name, country_iso) values (sid, 'district_lga', r.n, 'ZM');
      end if;
    end loop;
  end if;
  select s.id into sid from org_units s join org_units c on c.id = s.parent_id
   where c.level = 'country' and c.country_iso = 'ZM' and s.level = 'state_region' and s.name = 'Eastern' limit 1;
  if sid is not null then
    for r in select * from unnest(array['Chadiza','Chasefu','Chipangali','Chipata','Kasenengwa','Katete','Lumezi','Lundazi','Lusangazi','Mambwe','Nyimba','Petauke','Sinda','Vubwi']) as s(n) loop
      if not exists (select 1 from org_units where parent_id = sid and level = 'district_lga' and name = r.n) then
        insert into org_units (parent_id, level, name, country_iso) values (sid, 'district_lga', r.n, 'ZM');
      end if;
    end loop;
  end if;
  select s.id into sid from org_units s join org_units c on c.id = s.parent_id
   where c.level = 'country' and c.country_iso = 'ZM' and s.level = 'state_region' and s.name = 'Luapula' limit 1;
  if sid is not null then
    for r in select * from unnest(array['Chembe','Chiengi','Chifunabuli','Chipili','Kawambwa','Lunga','Mansa','Milenge','Mwansabombwe','Mwense','Nchelenge','Samfya']) as s(n) loop
      if not exists (select 1 from org_units where parent_id = sid and level = 'district_lga' and name = r.n) then
        insert into org_units (parent_id, level, name, country_iso) values (sid, 'district_lga', r.n, 'ZM');
      end if;
    end loop;
  end if;
  select s.id into sid from org_units s join org_units c on c.id = s.parent_id
   where c.level = 'country' and c.country_iso = 'ZM' and s.level = 'state_region' and s.name = 'Lusaka' limit 1;
  if sid is not null then
    for r in select * from unnest(array['Chilanga','Chongwe','Kafue','Luangwa','Lusaka','Rufunsa']) as s(n) loop
      if not exists (select 1 from org_units where parent_id = sid and level = 'district_lga' and name = r.n) then
        insert into org_units (parent_id, level, name, country_iso) values (sid, 'district_lga', r.n, 'ZM');
      end if;
    end loop;
  end if;
  select s.id into sid from org_units s join org_units c on c.id = s.parent_id
   where c.level = 'country' and c.country_iso = 'ZM' and s.level = 'state_region' and s.name = 'Muchinga' limit 1;
  if sid is not null then
    for r in select * from unnest(array['Chama','Chinsali','Isoka','Kanchibiya','Lavushimanda','Mafinga','Mpika','Nakonde','Shiwang''andu']) as s(n) loop
      if not exists (select 1 from org_units where parent_id = sid and level = 'district_lga' and name = r.n) then
        insert into org_units (parent_id, level, name, country_iso) values (sid, 'district_lga', r.n, 'ZM');
      end if;
    end loop;
  end if;
  select s.id into sid from org_units s join org_units c on c.id = s.parent_id
   where c.level = 'country' and c.country_iso = 'ZM' and s.level = 'state_region' and s.name = 'Northern' limit 1;
  if sid is not null then
    for r in select * from unnest(array['Chilubi','Kaputa','Kasama','Lunte','Luwingu','Mbala','Mporokoso','Mpulungu','Mungwi','Nsama','Senga Hill','Lupososhi']) as s(n) loop
      if not exists (select 1 from org_units where parent_id = sid and level = 'district_lga' and name = r.n) then
        insert into org_units (parent_id, level, name, country_iso) values (sid, 'district_lga', r.n, 'ZM');
      end if;
    end loop;
  end if;
  select s.id into sid from org_units s join org_units c on c.id = s.parent_id
   where c.level = 'country' and c.country_iso = 'ZM' and s.level = 'state_region' and s.name = 'North-Western' limit 1;
  if sid is not null then
    for r in select * from unnest(array['Chavuma','Ikelenge','Kabompo','Kalumbila','Kasempa','Manyinga','Mufumbwe','Mushindamo','Mwinilunga','Solwezi','Zambezi']) as s(n) loop
      if not exists (select 1 from org_units where parent_id = sid and level = 'district_lga' and name = r.n) then
        insert into org_units (parent_id, level, name, country_iso) values (sid, 'district_lga', r.n, 'ZM');
      end if;
    end loop;
  end if;
  select s.id into sid from org_units s join org_units c on c.id = s.parent_id
   where c.level = 'country' and c.country_iso = 'ZM' and s.level = 'state_region' and s.name = 'Southern' limit 1;
  if sid is not null then
    for r in select * from unnest(array['Chikankata','Chirundu','Choma','Gwembe','Kalomo','Kazungula','Livingstone','Mazabuka','Monze','Namwala','Pemba','Siavonga','Sinazongwe','Zimba']) as s(n) loop
      if not exists (select 1 from org_units where parent_id = sid and level = 'district_lga' and name = r.n) then
        insert into org_units (parent_id, level, name, country_iso) values (sid, 'district_lga', r.n, 'ZM');
      end if;
    end loop;
  end if;
  select s.id into sid from org_units s join org_units c on c.id = s.parent_id
   where c.level = 'country' and c.country_iso = 'ZM' and s.level = 'state_region' and s.name = 'Western' limit 1;
  if sid is not null then
    for r in select * from unnest(array['Kalabo','Kaoma','Limulunga','Luampa','Lukulu','Mitete','Mongu','Mulobezi','Mwandi','Nalolo','Nkeyema','Senanga','Sesheke','Shangombo','Sikongo','Sioma']) as s(n) loop
      if not exists (select 1 from org_units where parent_id = sid and level = 'district_lga' and name = r.n) then
        insert into org_units (parent_id, level, name, country_iso) values (sid, 'district_lga', r.n, 'ZM');
      end if;
    end loop;
  end if;
  select s.id into sid from org_units s join org_units c on c.id = s.parent_id
   where c.level = 'country' and c.country_iso = 'GM' and s.level = 'state_region' and s.name = 'Banjul' limit 1;
  if sid is not null then
    for r in select * from unnest(array['Banjul']) as s(n) loop
      if not exists (select 1 from org_units where parent_id = sid and level = 'district_lga' and name = r.n) then
        insert into org_units (parent_id, level, name, country_iso) values (sid, 'district_lga', r.n, 'GM');
      end if;
    end loop;
  end if;
  select s.id into sid from org_units s join org_units c on c.id = s.parent_id
   where c.level = 'country' and c.country_iso = 'GM' and s.level = 'state_region' and s.name = 'West Coast' limit 1;
  if sid is not null then
    for r in select * from unnest(array['Foni Bintang-Karenai','Foni Bondali','Foni Brefet','Foni Jarrol','Foni Kansala','Kombo Central','Kombo East','Kombo North','Kombo South','Kanifing']) as s(n) loop
      if not exists (select 1 from org_units where parent_id = sid and level = 'district_lga' and name = r.n) then
        insert into org_units (parent_id, level, name, country_iso) values (sid, 'district_lga', r.n, 'GM');
      end if;
    end loop;
  end if;
  select s.id into sid from org_units s join org_units c on c.id = s.parent_id
   where c.level = 'country' and c.country_iso = 'GM' and s.level = 'state_region' and s.name = 'North Bank' limit 1;
  if sid is not null then
    for r in select * from unnest(array['Central Baddibu','Jokadu','Lower Baddibu','Lower Niumi','Upper Baddibu','Upper Niumi']) as s(n) loop
      if not exists (select 1 from org_units where parent_id = sid and level = 'district_lga' and name = r.n) then
        insert into org_units (parent_id, level, name, country_iso) values (sid, 'district_lga', r.n, 'GM');
      end if;
    end loop;
  end if;
  select s.id into sid from org_units s join org_units c on c.id = s.parent_id
   where c.level = 'country' and c.country_iso = 'GM' and s.level = 'state_region' and s.name = 'Lower River' limit 1;
  if sid is not null then
    for r in select * from unnest(array['Jarra Central','Jarra East','Jarra West','Kiang Central','Kiang East','Kiang West']) as s(n) loop
      if not exists (select 1 from org_units where parent_id = sid and level = 'district_lga' and name = r.n) then
        insert into org_units (parent_id, level, name, country_iso) values (sid, 'district_lga', r.n, 'GM');
      end if;
    end loop;
  end if;
  select s.id into sid from org_units s join org_units c on c.id = s.parent_id
   where c.level = 'country' and c.country_iso = 'GM' and s.level = 'state_region' and s.name = 'Central River' limit 1;
  if sid is not null then
    for r in select * from unnest(array['Fulladu West','Janjanbureh','Lower Saloum','Niamina Dankunku','Niamina East','Niamina West','Niani','Nianija','Sami','Upper Saloum']) as s(n) loop
      if not exists (select 1 from org_units where parent_id = sid and level = 'district_lga' and name = r.n) then
        insert into org_units (parent_id, level, name, country_iso) values (sid, 'district_lga', r.n, 'GM');
      end if;
    end loop;
  end if;
  select s.id into sid from org_units s join org_units c on c.id = s.parent_id
   where c.level = 'country' and c.country_iso = 'GM' and s.level = 'state_region' and s.name = 'Upper River' limit 1;
  if sid is not null then
    for r in select * from unnest(array['Basse','Fulladu East','Jimara','Kantora','Sandu','Wuli East','Wuli West']) as s(n) loop
      if not exists (select 1 from org_units where parent_id = sid and level = 'district_lga' and name = r.n) then
        insert into org_units (parent_id, level, name, country_iso) values (sid, 'district_lga', r.n, 'GM');
      end if;
    end loop;
  end if;
  select s.id into sid from org_units s join org_units c on c.id = s.parent_id
   where c.level = 'country' and c.country_iso = 'LR' and s.level = 'state_region' and s.name = 'Montserrado' limit 1;
  if sid is not null then
    for r in select * from unnest(array['Careysburg','Commonwealth','Greater Monrovia','St. Paul River','Todee']) as s(n) loop
      if not exists (select 1 from org_units where parent_id = sid and level = 'district_lga' and name = r.n) then
        insert into org_units (parent_id, level, name, country_iso) values (sid, 'district_lga', r.n, 'LR');
      end if;
    end loop;
  end if;
  select s.id into sid from org_units s join org_units c on c.id = s.parent_id
   where c.level = 'country' and c.country_iso = 'LR' and s.level = 'state_region' and s.name = 'Nimba' limit 1;
  if sid is not null then
    for r in select * from unnest(array['Buu-Yao','Doe','Garr-Bain','Gbehlay-Geh','Kparblee','Leewehpea-Mahn','Meinpea-Mahn','Nimba','Saclepea-Mahn','Sanniquellie-Mahn','Twan-River','Wee-Gbehy-Mahn','Yarwein-Mehnsonnoh','Zoe-Gbao']) as s(n) loop
      if not exists (select 1 from org_units where parent_id = sid and level = 'district_lga' and name = r.n) then
        insert into org_units (parent_id, level, name, country_iso) values (sid, 'district_lga', r.n, 'LR');
      end if;
    end loop;
  end if;
  select s.id into sid from org_units s join org_units c on c.id = s.parent_id
   where c.level = 'country' and c.country_iso = 'LR' and s.level = 'state_region' and s.name = 'Bong' limit 1;
  if sid is not null then
    for r in select * from unnest(array['Boinsen','Fuamah','Jorquelleh','Kokoyah','Kpaai','Panta','Salala','Sanoyea','Suakoko','Tukpahblee','Yeallequelleh','Zota']) as s(n) loop
      if not exists (select 1 from org_units where parent_id = sid and level = 'district_lga' and name = r.n) then
        insert into org_units (parent_id, level, name, country_iso) values (sid, 'district_lga', r.n, 'LR');
      end if;
    end loop;
  end if;
  select s.id into sid from org_units s join org_units c on c.id = s.parent_id
   where c.level = 'country' and c.country_iso = 'LR' and s.level = 'state_region' and s.name = 'Grand Bassa' limit 1;
  if sid is not null then
    for r in select * from unnest(array['Commonwealth','District #1','District #2','District #3','District #4','Neekreen','Owensgrove','St. John River']) as s(n) loop
      if not exists (select 1 from org_units where parent_id = sid and level = 'district_lga' and name = r.n) then
        insert into org_units (parent_id, level, name, country_iso) values (sid, 'district_lga', r.n, 'LR');
      end if;
    end loop;
  end if;
  select s.id into sid from org_units s join org_units c on c.id = s.parent_id
   where c.level = 'country' and c.country_iso = 'LR' and s.level = 'state_region' and s.name = 'Margibi' limit 1;
  if sid is not null then
    for r in select * from unnest(array['Firestone','Gibi','Kakata','Mambah-Kaba']) as s(n) loop
      if not exists (select 1 from org_units where parent_id = sid and level = 'district_lga' and name = r.n) then
        insert into org_units (parent_id, level, name, country_iso) values (sid, 'district_lga', r.n, 'LR');
      end if;
    end loop;
  end if;
  select s.id into sid from org_units s join org_units c on c.id = s.parent_id
   where c.level = 'country' and c.country_iso = 'LR' and s.level = 'state_region' and s.name = 'Lofa' limit 1;
  if sid is not null then
    for r in select * from unnest(array['Foya','Kolahun','Quardu Gboni','Salayea','Vahun','Voinjama','Zorzor']) as s(n) loop
      if not exists (select 1 from org_units where parent_id = sid and level = 'district_lga' and name = r.n) then
        insert into org_units (parent_id, level, name, country_iso) values (sid, 'district_lga', r.n, 'LR');
      end if;
    end loop;
  end if;
  select s.id into sid from org_units s join org_units c on c.id = s.parent_id
   where c.level = 'country' and c.country_iso = 'LR' and s.level = 'state_region' and s.name = 'Bomi' limit 1;
  if sid is not null then
    for r in select * from unnest(array['Dewoin','Klay','Mecca','Senjeh']) as s(n) loop
      if not exists (select 1 from org_units where parent_id = sid and level = 'district_lga' and name = r.n) then
        insert into org_units (parent_id, level, name, country_iso) values (sid, 'district_lga', r.n, 'LR');
      end if;
    end loop;
  end if;
  select s.id into sid from org_units s join org_units c on c.id = s.parent_id
   where c.level = 'country' and c.country_iso = 'LR' and s.level = 'state_region' and s.name = 'Grand Cape Mount' limit 1;
  if sid is not null then
    for r in select * from unnest(array['Commonwealth','Garwula','Gola Konneh','Porkpa','Tewor']) as s(n) loop
      if not exists (select 1 from org_units where parent_id = sid and level = 'district_lga' and name = r.n) then
        insert into org_units (parent_id, level, name, country_iso) values (sid, 'district_lga', r.n, 'LR');
      end if;
    end loop;
  end if;
  select s.id into sid from org_units s join org_units c on c.id = s.parent_id
   where c.level = 'country' and c.country_iso = 'LR' and s.level = 'state_region' and s.name = 'Gbarpolu' limit 1;
  if sid is not null then
    for r in select * from unnest(array['Belleh','Bokomu','Bopolu','Gbarma','Kongba']) as s(n) loop
      if not exists (select 1 from org_units where parent_id = sid and level = 'district_lga' and name = r.n) then
        insert into org_units (parent_id, level, name, country_iso) values (sid, 'district_lga', r.n, 'LR');
      end if;
    end loop;
  end if;
  select s.id into sid from org_units s join org_units c on c.id = s.parent_id
   where c.level = 'country' and c.country_iso = 'LR' and s.level = 'state_region' and s.name = 'Grand Gedeh' limit 1;
  if sid is not null then
    for r in select * from unnest(array['B''hai','Cavala','Gbao','Glio-Twarbo','Konobo','Putu','Tchien']) as s(n) loop
      if not exists (select 1 from org_units where parent_id = sid and level = 'district_lga' and name = r.n) then
        insert into org_units (parent_id, level, name, country_iso) values (sid, 'district_lga', r.n, 'LR');
      end if;
    end loop;
  end if;
  select s.id into sid from org_units s join org_units c on c.id = s.parent_id
   where c.level = 'country' and c.country_iso = 'LR' and s.level = 'state_region' and s.name = 'Grand Kru' limit 1;
  if sid is not null then
    for r in select * from unnest(array['Barclayville','Bolloh','Buah','Dorbor','Dweh','Felo-Jekwi','Fenetoe','Forpoh','Garraway','Jloh','Kpi','Lower Jloh','Nrokwia-Wesldow','Sasstown','Trehn','Upper Jloh','Wedabo']) as s(n) loop
      if not exists (select 1 from org_units where parent_id = sid and level = 'district_lga' and name = r.n) then
        insert into org_units (parent_id, level, name, country_iso) values (sid, 'district_lga', r.n, 'LR');
      end if;
    end loop;
  end if;
  select s.id into sid from org_units s join org_units c on c.id = s.parent_id
   where c.level = 'country' and c.country_iso = 'LR' and s.level = 'state_region' and s.name = 'Maryland' limit 1;
  if sid is not null then
    for r in select * from unnest(array['Barrobo','Gwelekpoken','Harper','Karluway #1','Karluway #2','Nyorken','Pleebo/Sodoken','Whojah']) as s(n) loop
      if not exists (select 1 from org_units where parent_id = sid and level = 'district_lga' and name = r.n) then
        insert into org_units (parent_id, level, name, country_iso) values (sid, 'district_lga', r.n, 'LR');
      end if;
    end loop;
  end if;
  select s.id into sid from org_units s join org_units c on c.id = s.parent_id
   where c.level = 'country' and c.country_iso = 'LR' and s.level = 'state_region' and s.name = 'River Cess' limit 1;
  if sid is not null then
    for r in select * from unnest(array['Beawor','Central River Cess','Doedain','Fen River','Jo River','Norwein','Sam Gbalor','Zarflahn']) as s(n) loop
      if not exists (select 1 from org_units where parent_id = sid and level = 'district_lga' and name = r.n) then
        insert into org_units (parent_id, level, name, country_iso) values (sid, 'district_lga', r.n, 'LR');
      end if;
    end loop;
  end if;
  select s.id into sid from org_units s join org_units c on c.id = s.parent_id
   where c.level = 'country' and c.country_iso = 'LR' and s.level = 'state_region' and s.name = 'River Gee' limit 1;
  if sid is not null then
    for r in select * from unnest(array['Chedepo','Gbeapo','Glaro','Karforh','Nanee','Nyenawliken','Nyenebo','Potupo','Sarbo','Tuobo']) as s(n) loop
      if not exists (select 1 from org_units where parent_id = sid and level = 'district_lga' and name = r.n) then
        insert into org_units (parent_id, level, name, country_iso) values (sid, 'district_lga', r.n, 'LR');
      end if;
    end loop;
  end if;
  select s.id into sid from org_units s join org_units c on c.id = s.parent_id
   where c.level = 'country' and c.country_iso = 'LR' and s.level = 'state_region' and s.name = 'Sinoe' limit 1;
  if sid is not null then
    for r in select * from unnest(array['Bodae','Bokon','Butaw','Dugbe River','Greenville','Jaedae','Jeadepo','Juarzon','Kpayan','Kulu Shaw Boe','Plahn Nyarn','Pynes Town','Sanquin District #1','Sanquin District #2','Sanquin District #3','Seekon','Wedjah']) as s(n) loop
      if not exists (select 1 from org_units where parent_id = sid and level = 'district_lga' and name = r.n) then
        insert into org_units (parent_id, level, name, country_iso) values (sid, 'district_lga', r.n, 'LR');
      end if;
    end loop;
  end if;
  select s.id into sid from org_units s join org_units c on c.id = s.parent_id
   where c.level = 'country' and c.country_iso = 'GH' and s.level = 'state_region' and s.name = 'Greater Accra' limit 1;
  if sid is not null then
    for r in select * from unnest(array['Ablekuma Central','Ablekuma North','Ablekuma West','Accra Metropolitan','Ada East','Ada West','Adentan','Ashaiman','Ayawaso Central','Ayawaso East','Ayawaso North','Ayawaso West','Ga Central','Ga East','Ga North','Ga South','Ga West','Korle Klottey','Kpone Katamanso','Krowor','La Dade-Kotopon','La Nkwantanang-Madina','Ledzokuku','Ningo-Prampram','Okaikwei North','Shai-Osudoku','Tema Metropolitan','Tema West','Weija-Gbawe']) as s(n) loop
      if not exists (select 1 from org_units where parent_id = sid and level = 'district_lga' and name = r.n) then
        insert into org_units (parent_id, level, name, country_iso) values (sid, 'district_lga', r.n, 'GH');
      end if;
    end loop;
  end if;
  select s.id into sid from org_units s join org_units c on c.id = s.parent_id
   where c.level = 'country' and c.country_iso = 'GH' and s.level = 'state_region' and s.name = 'Ashanti' limit 1;
  if sid is not null then
    for r in select * from unnest(array['Adansi Asokwa','Adansi North','Adansi South','Afigya Kwabre North','Afigya Kwabre South','Ahafo Ano North','Ahafo Ano South East','Ahafo Ano South West','Akrofuom','Amansie Central','Amansie South','Amansie West','Asante Akim Central','Asante Akim North','Asante Akim South','Asokore Mampong','Asokwa','Atwima Kwanwoma','Atwima Mponua','Atwima Nwabiagya North','Atwima Nwabiagya South','Bekwai','Bosome Freho','Bosomtwe','Ejisu','Ejura Sekyedumase','Juaben','Kumasi Metropolitan','Kwabre East','Kwadaso','Mampong','Obuasi East','Obuasi Municipal','Offinso Municipal','Offinso North','Oforikrom','Old Tafo','Sekyere Afram Plains','Sekyere Central','Sekyere East','Sekyere Kumawu','Sekyere South','Suame']) as s(n) loop
      if not exists (select 1 from org_units where parent_id = sid and level = 'district_lga' and name = r.n) then
        insert into org_units (parent_id, level, name, country_iso) values (sid, 'district_lga', r.n, 'GH');
      end if;
    end loop;
  end if;
end $$;

-- confirm
select c.name as country, count(*) filter (where s.level = 'state_region') as level2,
       (select count(*) from org_units d join org_units s2 on s2.id = d.parent_id where s2.parent_id = c.id and d.level = 'district_lga') as level3
  from org_units c left join org_units s on s.parent_id = c.id
 where c.level = 'country' group by c.id, c.name order by c.name;

insert into public.schema_migrations (version, name) values (149, 'africa_geography_levels') on conflict (version) do nothing;
