# Dulmar Dhamaystiran: Qaabka Faa'iidada iyo Socodka Lacagta ee Ludo App

Wada sheekeysigeennii wuxuu xoogga saaray sidii loo fahmi lahaa qaabka faa'iidada ee `Admin`-ka iyo `Agent`-ka, iyadoo la adeegsanayo tusaalayaal ciyaaro iyo macaamilada lacag dhigashada/kala bixista. Hoos waxaa ku qoran soo koobid faahfaahsan oo ah sida lacagtu u socoto iyo cidda hesha faa'iidada.

## Hay'adaha Muhiimka ah

1.  **Admin (Maamule):** Milkiilaha ama maamulaha guud ee nidaamka. Waxa uu maamulaa agents-ka, go'aamiyaa sicirka rake-ka, waxaana u soo xarooda dakhliga ka soo baxa ciyaaraha.
2.  **Agent (Wakiil):** Qof u dhexeeya ciyaartoyda iyo admin-ka. Waxa uu ka iibsadaa float (lacagta ciyaarta) admin-ka isagoo qiimo jaban ku helaya, ka dibna wuxuu ku iibiyaa ciyaartoyda qiimaheeda caadiga ah. Waxa kale oo uu maamulaa lacag dhigashada iyo kala bixista ciyaartoyda.
3.  **Player (Ciyaartoy):** Isticmaalaha ciyaara Ludo, lacag dhigta, ciyaara, guuleysta ama laga guuleysto, kadibna lacagta kala baxa.

## Isha Faa'iidada Admin-ka

Admin-ku waxa uu faa'iido ka helaa laba qaab oo waaweyn:

1.  **Rake-ka Ciyaarta (Game Rake):**
    *   **Sidee u shaqeysaa:** Ciyaar kasta oo Ludo ah oo leh lacag lagu ciyaaro, boqolley cayiman (hadda **10%**) ayaa laga jarayaa lacagta guud ee lagu ciyaaray (`escrowBalance`). Lacagtan la jaray waxa loo yaqaan `rake`.
    *   **Tusaale:** Haddii laba ciyaartoy ay ku ciyaaraan min $1 (wadarta $2), waxaa laga jarayaa $0.20 (10% ee $2). Lacagtan $0.20 ah waxay si toos ah ugu biireysaa `houseRevenue` (dakhliga admin-ka). Waxaa loo diiwaangeliyaa macaamil `app_commission` ah.
    *   **Faa'iidada Admin-ka:** Tani waa isha ugu weyn ee faa'iidada admin-ka ee nidaamka. Waa faa'iido toos ah oo ka timaada ciyaaraha dhexdeeda.

2.  **Iibinta Float-ka ee Agents-ka:**
    *   **Sidee u shaqeysaa:** Admin-ku waxa uu agents-ka ka iibiyaa float (tusaale, $100 float ah), isagoo ka qaadanaya lacag caddaan ah oo ka yar qiimaha float-ka (tusaale, $80 oo caddaan ah).
    *   **Faa'iidada Admin-ka:** Lacagta $80 ah ee admin-ku ka helo agent-ka waa lacag caddaan ah oo jeebka u gasha, laakiin system-ka dhexdiisa looma diiwaangeliyo "faa'iido". Waa macaamil ganacsi oo u dhexeeya admin-ka iyo agent-ka, kaas oo ujeedadiisu tahay in float la geeyo suuqa. Faa'iidada "system-ka" ee rasmiga ah waxay si gaar ah uga timaadaa rake-ka ciyaaraha.

3.  **Soo-jeedin Faa'iido dheeraad ah (Future Feature):**
    *   Waxaa la soo jeediyay in admin-ku uu ku darsado komishan yar oo dheeraad ah lacag dhigashada iyo kala bixista ay maamulaan agents-ka. Tani hadda ma jirto, laakiin waa la hirgelin karaa.

## Isha Faa'iidada Agent-ka

Agent-ku waxa uu faa'iido ka helaa:

1.  **Qiimo dhimista Iibsashada Float-ka:**
    *   **Sidee u shaqeysaa:** Agent-ku waxa uu float ka soo iibsadaa admin-ka isagoo qiimo dhimis ah ku helaya. Tusaale, $100 float ah wuxuu ku soo iibsanayaa $80 oo caddaan ah.
    *   **Faa'iidada Agent-ka:** Marka agent-ku uu iibiyo dhammaan $100 float ah qiimaheeda caadiga ah, wuxuu kasbanayaa $20 oo faa'iido ah. Faa'iidada agent-ka waa farqiga u dhexeeya qiimaha uu float-ka ku soo iibsaday iyo qiimaha uu ku iibiyey ciyaartoyda.

2.  **Maaraynta Lacag Dhigashada iyo Kala Bixista Ciyaartoyda:**
    *   **Lacag dhigasho:** Ciyaartoygu wuxuu siinayaa agent-ka $10 oo caddaan ah, agent-kuna wuxuu ciyaaryahanka ugu shubayaa $10 float ah (balance-ka ciyaarta). Float-ka agent-ka wuu yaraanayaa $10, kan ciyaaryahankuna wuu kordhayaa $10.
    *   **Lacag kala bixis:** Ciyaartoygu wuxuu doonayaa inuu kala baxo $18 oo uu ku guuleystay. Balance-ka ciyaaryahanka wuu yaraanayaa $18, float-ka agent-kuna wuu kordhayaa $18. Agent-ka wuxuu markaa ciyaaryahanka siinayaa $18 oo caddaan ah.
    *   **Faa'iidada Agent-ka:** Hadda, agent-ku **ma helo komishan toos ah** (faa'iido dheeraad ah) marka uu maamulayo lacag dhigashada ama kala bixista ciyaartoyda. Float-kiisu wuxuu u shaqeeyaa sidii keyd lacageed oo uu ciyaartoyda ku bixiyo ama ka helo. Faa'iidadiisa waxay si gaar ah uga timaadaa qiimo dhimista uu float-ka ku soo iibsaday.

## Aragtida Ciyaartoyga

Ciyaartoydu waxa ay la macaamilaan agent-ka si ay u ciyaaraan oo ay lacag uga sameeyaan:

1.  **Lacag Dhigasho:** Ciyaartoygu waxa uu ka iibsadaa float agent-ka, isagoo ku beddelanaya lacag caddaan ah (tusaale, $10 oo caddaan ah wuxuu ku helayaa $10 float ah).
2.  **Ciyaarista Ciyaaraha:** Ciyaartoygu wuxuu isticmaalaa float-kiisa si uu ugu ciyaaro Ludo (tusaale, $1 bet ah ciyaar kasta).
3.  **Guuleysashada Ciyaarta:**
    *   Haddii ciyaaryahan uu guuleysto ciyaar ay laba qof ku ciyaareen min $1 (wadarta $2), ka dib marka rake-ka $0.20 laga jaro, ciyaaryahanku wuxuu helayaa **$1.80**.
    *   Haddii ciyaaryahan uu guuleysto 10 ciyaarood oo noocaas ah, wuxuu ku guuleysan doonaa **$18.00** guud ahaan. Lacagtan waxay ugu biiraysaa balance-kiisa ciyaarta.
4.  **Lacag Kala Bixis:** Ciyaartoygu waxa uu lacagta ku guuleystay ka kala baxaa agent-ka, isagoo lacagtiisa ciyaarta ku beddelanaya lacag caddaan ah.

## Tusaale Socodka Lacagta oo Dhamaystiran

Aan ku qaadanno tusaale dhamaystiran si loo caddeeyo socodka:

1.  **Admin-ka iyo Agent-ka:** Admin-ku wuxuu Agent A ka iibiyey $100 float ah. Admin-ku wuxuu ka helay $80 oo caddaan ah. Agent A wuxuu leeyahay $100 oo float ah (balance-ka ciyaarta). Agent A faa'iidadiisu waa $20.
2.  **Ciyaartoyga iyo Agent-ka:** Ciyaartoy B wuxuu Agent A ka iibsaday $10 float ah. Ciyaartoy B wuxuu siiyey Agent A $10 oo caddaan ah. Float-kii Agent A wuxuu noqday $90 ($100 - $10), Balance-kii Ciyaartoy B wuxuu noqday $10.
3.  **Ciyaaraha:** Ciyaartoy B wuxuu ciyaaray 10 ciyaarood oo kala duwan isagoo $1 ciyaar kasta dhigaya, wuxuuna ku guuleystay dhammaantood.
    *   Ciyaar kasta oo $2 ah, $0.20 rake ah ayaa u soo xarooda **Admin-ka** (`houseRevenue`).
    *   Ciyaar kasta wuxuu Ciyaartoy B ka helay $1.80.
    *   Wadar ahaan 10 ciyaarood, Ciyaartoy B wuxuu ku guuleystay 10 \* $1.80 = **$18.00**.
    *   Balance-kii Ciyaartoy B wuxuu noqday $10 (deposit) + $18 (winnings) = **$28**.
4.  **Ciyaartoyga oo Lacag kala baxaya:** Ciyaartoy B wuxuu doonayaa inuu kala baxo $18 oo uu ku guuleystay.
    *   Ciyaartoy B wuxuu ka codsanayaa Agent A inuu ka kala bixiyo.
    *   Balance-ka Ciyaartoy B wuxuu ka yaraanayaa $18, wuxuuna noqonayaa $10 ($28 - $18).
    *   Float-ka Agent A wuxuu ku kordhayaa $18, wuxuuna noqonayaa $108 ($90 + $18).
    *   Agent A wuxuu siinayaa Ciyaartoy B $18 oo caddaan ah.

## Gunaanad

Admin-ka wuxuu faa'iido joogto ah ka helaa rake-ka ciyaaraha. Agent-ka wuxuu faa'iido ka helaa qiimo dhimista uu float-ka ku soo iibsado. Ciyaartoydu waxay isticmaalaan system-ka si ay u ciyaaraan oo ay lacag uga sameeyaan, iyadoo rake laga jarayo guulahooda.

Haddii aad rabto in admin-ka uu faa'iido toos ah ka helo lacag dhigashada iyo kala bixista ay wakiiladu maamulaan, waa inaan ku darsanaa functionality cusub, sida sicir komishan oo gaar ah oo lagu daro agent kasta.
