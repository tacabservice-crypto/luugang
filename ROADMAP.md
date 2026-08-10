# Qorshaha Hirgelinta ee Dhamaystiran: Kordhinta Dakhliga & Dhisidda Shabakadda Wakiilada ee Ludo$om

**Hadafka Guud:** In la dhiso saddex nidaam oo waaweyn oo isku xiran si loo kordhiyo ka-qaybgalka ciyaartoyda loona abuuro ilo dakhli oo kala duwan oo waara oo loogu talagalay Ludo$om. Nidaamyadani waa: **Nidaamka VIP-da (Subscription), Habka Tartamada (Tournaments), iyo Shabakadda Maaliyadeed ee Wakiilada (Agent Network).**

---

## Sida Loo Kala Hormarinayo Shaqada (Step-by-Step Plan)

- [x] **Wajiga 1-aad:** Dhisidda Aasaaska **Nidaamka Wakiilada** (Backend & Database).
- [x] **Wajiga 2-aad:** Dhisidda **Dashboard-ka Wakiilka** (Frontend).
- [ ] **Wajiga 3-aad:** Dhisidda **Nidaamka VIP-da** (Backend & Frontend). **<-- HAWSHA XIGTA (NEXT TASK)**
- [ ] **Wajiga 4-aad:** Dhisidda **Habka Tartamada** (Backend & Frontend).

---

## Faahfaahinta Hawlaha (Task Details)

### Wajiga 1-aad: Shabakadda Maaliyadeed ee Wakiilada (Agent Financial Network)

Kani waa aasaaska, waayo wuxuu fududeynayaa sida lacagtu u soo galeyso nidaamka.

*   **Hadaf:** In la abuuro shabakad wakiilo ah oo fududeeya dhigashada iyo kala bixista lacagta caddaanka ah, si loo gaaro macaamiil badan, loona abuuro il dakhli oo B2B ah.
*   **Qaabka Shaqada:** Waxaan isticmaaleynaa **Qaabka "Qiimo Dhimista Float-ka"**. Ludo$om waxay lacagta dhijitaalka ah (Float) qiimo dhimis (tusaale, 3-5%) kaga iibinaysaa wakiilada.

**Hawlaha Loo Baahan Yahay (Tasks):**

1.  **Dhinaca Backend-ka:**
    *   [x] **Database:** In la abuuro models cusub (`Agent`, `AgentTransaction`).
    *   [x] **API Endpoints (U Gaar ah Wakiilada):** `deposit`, `transactions`, `player-lookup`.
    *   [x] **API Endpoints (U Gaar ah Maamulka - Admin-ka):** `create`, `credit-float`, `get-all`.

2.  **Dhinaca Frontend-ka:**
    *   [x] **App-ka Ciyaarta:** In lagu daro bog "Raadi Wakiil" ah (marka hore wuxuu noqon karaa liis lambaro ah).
    *   [x] **Transaction History:** In lagu daro calaamad muujinaysa "Agent Deposit" taariikhda macaamilada user-ka.


### Wajiga 2-aad: Dashboard-ka Wakiilka (Agent Dashboard)

*   **Hadaf:** In la dhiso interface fudud oo web ah oo u gaar ah wakiilada.
*   **Hawlaha Loo Baahan Yahay (Tasks):**
    *   [x] Login u gaar ah wakiilada.
    *   [x] Foom ay ku raadin karaan ciyaaryahan kuna shubi karaan lacag.
    *   [x] Meel ay kala socdaan Float-kooda iyo taariikhdooda.
    *   [x] In la dhiso qaybta maamulka (Admin) ee lagu maareeyo wakiilada.
    *   [x] In la abuuro `agent.html` iyo `agent-dashboard.tsx` iyo in la habeeyo `vite.config.ts` iyo `server.ts`.


### Wajiga 3-aad: Nidaamka Heerka VIP-da (VIP Subscription System)

*   **Hadaf:** In la abuuro dakhli joogto ah oo bille ah iyadoo la siinayo ciyaartoyda adeegyo gaar ah oo ay ku bixiyaan lacag go'an.

**Hawlaha Loo Baahan Yahay (Tasks):**

1.  **Dhinaca Backend-ka:**
    *   [ ] **Database:** In la abuuro model `VipSubscription` ah (kaydinaya `userId`, `heerkaVIP`, `taariikhda bilowga`, `taariikhda dhamaadka`).
    *   [ ] **API Endpoints:**
        *   `POST /api/vip/subscribe`: Si user-ku u iibsado VIP (iyadoo lacagta laga jarayo wallet-kiisa).
        *   Middleware hubinaya heerka VIP-da ee user-ka si loo siiyo adeegyada gaarka ah.
    *   [ ] **Cusboonaysiinta Nidaamka Ciyaarta:** In la beddelo habka "Rake"-ga loo xisaabiyo si VIP-yadu u helaan qiimo dhimis (tusaale, 8% halkii 10%).

2.  **Dhinaca Frontend-ka:**
    *   [ ] In app-ka lagu daro bog "Noqo VIP" ah oo lagu sharraxayo faa'iidooyinka iyo qiimaha.
    *   [ ] In la soo bandhigo astaanta VIP-da (sida taaj ama calaamad gaar ah) oo ka muuqata magaca user-ka agtiisa.

### Wajiga 4-aad: Habka Tartamada (Tournament Mode)

*   **Hadaf:** In la kordhiyo xiisaha ciyaarta loona abuuro il dakhli oo ka timaada khidmada gelitaanka tartamada.

**Hawlaha Loo Baahan Yahay (Tasks):**

1.  **Dhinaca Backend-ka:**
    *   [ ] **Database:** In la abuuro models `Tournament` iyo `TournamentMatch`.
    *   [ ] **API Endpoints:**
        *   `GET /api/tournaments`: Si loo soo bandhigo tartamada diyaar ka ah.
        *   `POST /api/tournaments/:id/register`: Si user-ku isaga diiwaan geliyo tartanka.
    *   [ ] **Nidaam Iskiis u Shaqeeya (Logic):** Hababka bilaabaya tartanka, samaynaya isku aadka, iyo qaybinaya abaal-marinta.

2.  **Dhinaca Frontend-ka:**
    *   [ ] In app-ka lagu daro qayb cusub oo "Tartamo" ah.
    *   [ ] Interface lagu soo bandhigayo tartamada, sharciyadooda, iyo abaal-marintooda.
    *   [ ] Sawir muujinaya isku aadka tartanka (bracket view).
