/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { createContext, useContext, useState, useEffect } from 'react';

export type Language = 'en' | 'so';

export const translations = {
  en: {
    // Top Bar & Navigation
    languageName: 'English',
    welcome: 'Welcome',
    logout: 'Logout',
    wallet: 'Wallet',
    balance: 'Balance',
    onlinePlayers: 'Online Players',

    // Auth Screen
    gameTitle: 'Ludo$om',
    gameSubtitle: 'SOMALI LUDO ARENA',
    chooseAvatar: 'Choose Avatar',
    displayName: 'Display Name',
    displayNamePlaceholder: 'e.g. LudoStar_99',
    emailAddress: 'Email Address',
    phoneNumber: 'Phone Number',
    enterArena: 'Enter Game Arena',
    quickSocialLogin: 'Or Quick Social Login',
    authTerms: 'By entering, you agree to the gaming Terms & Conditions and understand that stake amounts are simulated using virtual currency balances.',
    nameRequired: 'Please choose a display name.',
    emailPasswordRequired: 'Please enter both email and password.',

    // Dashboard / Lobby
    selectStake: 'Select Bet Stake',
    chooseStakeTier: 'Choose Bet Stake Tier',
    selectMode: 'Select Game Mode',
    selectCapacity: 'Select Capacity',
    gameMode: 'Game Mode',
    soloMode: 'Solo',
    singlePlayer: 'Single Player',
    partnershipMode: 'Partnership 2v2',
    players: 'Players',
    searchLivePlayers: '⚔️ Search Live',
    playAgainstBot: '🤖 Play Bot',
    loadingBot: 'Loading Bot...',
    searchingPlayers: 'Searching Players...',
    cancelSearch: 'Cancel Search',
    matchmakingRadar: '📡 MATCHMAKING RADAR',
    refresh: 'Refresh ↻',
    loading: 'Loading...',
    radarActive: 'Your Radar is Active 📡',
    radarVisible: 'You are visible to online players!',
    radarWait: 'Please wait for a player to accept your challenge or join your match.',
    radarEmpty: 'Radar is empty (No active seekers)',
    radarStartInfo: 'Click "Search Live Players" to switch your radar on!',
    copyAppLink: '📋 Copy App Link',
    linkCopiedAlert: 'App link copied! Open in another browser tab to play locally against yourself.',
    challenge: 'Challenge ⚔️',
    you: 'You',
    cancelRadar: 'Cancel Radar',
    privateMatchTitle: 'Private Match with Friends',
    privateMatchDesc: 'Create a custom Ludo Room code to share with your friends, or type a lobby room code to enter their active lobby.',
    createPrivateRoom: '➕ Create Private Room',
    joinPrivateRoom: '🔑 Join Room',
    roomCodePlaceholder: 'Enter Room Code',
    createCustomLobby: 'Create Custom Lobby',
    lobbyCode: 'Lobby Code',
    globalLeaderboard: 'Global Earnings Board',
    practiceTitle: 'Practice Pro',
    practiceDesc: 'Pure skill development, no stakes required',
    stakeWin: 'Bet $1 • Win $2.00',
    wins: 'Wins',
    losses: 'Losses',
    totalEarned: 'Total Earned',
    profileSettings: 'Profile Settings',
    becomeVip: 'Become VIP',
    tournaments: 'Tournaments',
    tournamentsHeader: 'Ludo$om Tournaments 🏆',
    tournamentsSub: 'Compete in high-stakes Ludo knockout tournaments and win massive prizes!',
    tabAll: 'All Tournaments',
    tabOpen: 'Open Registration',
    tabLive: 'Live / In Progress',
    tabCompleted: 'Completed',
    tabMy: 'My Registered',
    entryFee: 'Entry Fee',
    prizePool: 'Prize Pool',
    registeredPlayers: 'Registered Players',
    registerNow: 'Register Now',
    registered: 'Registered ✓',
    unregister: 'Leave / Unregister',
    viewBracket: 'View Bracket & Matches ⚔️',
    noTournamentsFound: 'No tournaments available at the moment.',
    startsIn: 'Starts in',
    startsAt: 'Starts at',
    aboutUs: 'About Us',
    aboutUsContent: "Welcome to Ludo$om, the premier online Ludo destination for the Somali community and beyond. Our platform is more than just a game; it's a vibrant hub where friends, family, and Ludo enthusiasts can connect, compete, and share their passion for this timeless classic.\n\nBorn from a desire to create a dedicated space for Somali Ludo players, Ludo$om is a celebration of our culture, camaraderie, and competitive spirit. We've meticulously designed our app to offer an authentic and engaging Ludo experience, complete with all the traditional rules and a modern, user-friendly interface.\n\nWhether you're looking to challenge your friends in a private match, test your skills against players from around the world, or simply enjoy a casual game, Ludo$om has something for everyone. Our platform supports both individual and team play, allowing you to team up with a partner and take on the world together.\n\nAt Ludo$om, we're committed to fair play and a secure gaming environment. Our state-of-the-art technology ensures that every dice roll is random and every match is decided by skill and strategy. We also offer a range of features designed to enhance your gaming experience, including real-time chat, customizable profiles, and a global leaderboard where you can track your progress and see how you stack up against the competition.\n\nJoin us today and become a part of our growing community. Ludo$om is more than just a game; it's where the world comes to play Ludo, the Somali way.",
    help: 'Help',
    helpContent: "Welcome to the Ludo$om Help Center. Here you'll find answers to frequently asked questions and guides to help you get the most out of our app.\n\n**Getting Started**\n\n*   **Creating an Account:** To start playing, you'll need to create an account. You can sign up using your email address or through your social media accounts. Once you've registered, you can customize your profile with a unique username and avatar.\n*   **Joining a Game:** You can join a game in several ways. You can start matchmaking to be paired with other players, join a private room using a code from a friend, or create your own private room and invite others to join.\n*   **Playing the Game:** The rules of Ludo$om are the same as traditional Ludo. The goal is to move all four of your tokens from your starting area to the center of the board. To do this, you'll need to roll a six to get a token out of your yard and onto the starting square. You can then move your tokens around the board by rolling the dice.\n\n**Features**\n\n*   **Wallet:** Your in-game wallet allows you to manage your virtual currency. You can deposit funds to play in stake matches and withdraw your winnings.\n*   **Matchmaking:** Our matchmaking system will pair you with other players of a similar skill level for a competitive and fair game.\n*   **Private Rooms:** Create a private room to play with your friends. You can set a bet amount and share the room code with anyone you want to invite.\n*   **Leaderboard:** Track your progress and see how you rank against other players on our global leaderboard.\n\n**Contact Us**\n\nIf you can't find the answer to your question here, please don't hesitate to contact us. You can reach our support team by email at [support@ludosom.com](mailto:support@ludosom.com) or through our social media channels. We're always here to help.",

    // Game Room
    yourTurn: 'Your Turn!',
    waitingTurn: "Waiting for player's turn...",
    rollDice: 'Roll Dice',
    rolled: 'Rolled',
    moveToken: 'Click a highlighted token to move',
    liveVoice: 'Real-Time Voice Chat',
    micOn: 'Mic On',
    micMuted: 'Mic Muted',
    speakersOn: 'Speakers On',
    speakersMuted: 'Speakers Muted',
    send: 'Send',
    typeMessage: 'Type a message...',
    forfeitGame: 'Forfeit / Leave Game',
    forfeitTitle: 'Forfeit Match?',
    forfeitDesc: 'Leaving the game now will result in forfeiting your bet stake.',
    yesLeave: 'Yes, Leave Game',
    cancel: 'Cancel',
    winnerTitle: 'Game Winner!',
    wonPot: 'won the stake pot of',
    backToDashboard: 'Back to Dashboard',
    turnTimer: 'Turn Timer',
    waitingForApproval: 'Waiting for Approval',
    joinRequestSent: 'Your request to join the room has been submitted.',
    waitForHostApproval: 'Please wait for the room host to accept you to start the game!',
    betStake: 'Bet Stake',
    youWon: 'YOU WON! 🏆',
    youLost: 'YOU LOST! 😭',
    winner: 'Winner',
    winnings: 'Winnings',
    playAnotherGame: 'Play Another Game ⚔️',
    teamRedAndYellow: 'TEAM RED & YELLOW',
    allies: 'ALLIES',
    teamGreenAndBlue: 'TEAM GREEN & BLUE',
    notAvailable: 'Not Available',
    selectToken: 'Select Token',
    clickHighlightedTokenToMove: 'Click a highlighted token to move!',
    autoRoll: 'Auto Roll',
    quickReactions: 'Quick Reactions',
    newJoinRequest: 'New Join Request',
    accept: 'Accept',
    decline: 'Decline',


    // Wallet Modal
    walletTitle: 'In-Game Digital Wallet',
    availableBalance: 'Available Balance',
    deposit: 'Deposit',
    withdraw: 'Withdraw',
    history: 'History',
    selectDepositMethod: 'Select Deposit Method',
    mobileNumber: 'Mobile Money Phone Number',
    amountUSD: 'Amount (USD)',
    confirmDeposit: 'Confirm Deposit',

    confirmWithdrawal: 'Confirm Withdrawal',
    processing: 'Processing...',
    quickSelect: 'Quick Select Amount',
    depositSuccess: 'Deposit successful!',
    withdrawSuccess: 'Withdrawal successful!',
    enterValidAmount: 'Please enter a valid positive amount.',
    insufficientFunds: 'Insufficient funds for withdrawal.',
    enterPhoneNumber: 'Please enter your mobile money phone number.',
    transactionFailed: 'Transaction failed. Please try again.',
    noTransactions: 'No transactions recorded yet.',
    transactionDetails: 'Transaction Details',
    amount: 'Amount',
    description: 'Description',
    date: 'Date',
    time: 'Time',
    transactionType: 'Type',
    status: 'Status',
    transactionId: 'Transaction ID',
    close: 'Close',

    // Matchmaking Explanation
    matchmakingInfoTitle: 'Tournament Matchmaking & Pairing Rules',
    matchmakingInfoDesc: 'Learn how pairings are made, who decides matches, and player limits.',
    pairingTypeTitle: '2-Player Knockout Matches (1v1)',
    pairingTypeDesc: 'Matches consist of 2 players facing off in a knockout format. The winner advances while the loser is eliminated.',
    whoDecidesTitle: 'Automated Fair Pairings (AI Algorithm)',
    whoDecidesDesc: 'Pairings are generated 100% automatically and randomly by the system algorithm when the tournament starts. Admin does not pick opponents manually.',
    yourBalance: 'Your Balance',
    confirmRegistration: 'Confirm Tournament Registration',
    entryFeeNotice: 'The entry fee will be deducted directly from your available balance.',
    confirmYes: 'Yes, Register Now',
    cancelBtn: 'Cancel',
    dashboardNav: 'Dashboard',

    // Switcher
    switchLanguage: 'Language',
  },
  so: {
    // Top Bar & Navigation
    languageName: 'Soomaali',
    welcome: 'Ku soo dhawoow',
    logout: 'Ka bax',
    wallet: 'Boorsada',
    balance: 'Haraaga',
    onlinePlayers: 'Ciyaartoyda Online-ka ah',

    // Auth Screen
    gameTitle: 'Ludo$om',
    gameSubtitle: 'CIYAAR LUDO SOOMAALIYEED',
    chooseAvatar: 'Dooro Astaanta (Avatar)',
    displayName: 'Magacaaga Ciyaarta',
    displayNamePlaceholder: 't.s. LudoStar_99',
    emailAddress: 'Ciwaanka Email-ka',
    phoneNumber: 'Lamberka Telefoonka',
    enterArena: 'Gala Garoonka Ciyaarta',
    quickSocialLogin: 'Ama Ku Gal Baraha Bulshada',
    authTerms: 'Aad oo aad u gasho garoonka, waxaad aqbashay shuruudaha ciyaarta iyo adeegsiga lacagta sharciga ah.',
    nameRequired: 'Fadlan qor magacaaga ciyaarta.',

    // Dashboard / Lobby
    selectStake: 'Dooro Bet-ka',
    chooseStakeTier: 'Dooro Stake-ka',
    selectMode: 'Habka Ciyaarta',
    selectCapacity: 'Tirada Ciyaartoyda',
    gameMode: 'Habka Ciyaarta',
    soloMode: 'Keli',
    singlePlayer: 'Ciyaaryahan Keli ah',
    partnershipMode: 'Labadu Waa Koox (2v2)',
    players: 'Ciyaartoy',
    searchLivePlayers: '⚔️ Raadi Live',
    playAgainstBot: '🤖 La Ciyaar Bot',
    loadingBot: 'Raranaya Bot-ka...',
    searchingPlayers: 'Raadinaya Ciyaartoy...',
    cancelSearch: 'Jooji Raadinta',
    matchmakingRadar: '📡 RADERKA TARTANKA',
    refresh: 'Cusboonaysii ↻',
    loading: 'Ku Raranaya...',
    radarActive: 'Raderkaaga waa shidanyahay 📡',
    radarVisible: 'Waxaad u muuqataa ciyaartoyda kale!',
    radarWait: 'Fadlan sug inta uu ciyaaryahan kale kugu soo biirayo!',
    radarEmpty: 'Raderka waa eber (Ma jiro ciyaartoy raadinaya)',
    radarStartInfo: 'Marka aad taabato "Raadi Ciyaartoy", Raderkaaga ayaa furmaya!',
    copyAppLink: '📋 Koobiyey Link-ga App-ka',
    linkCopiedAlert: 'Link-ga app-ka waa la koobiyey! Ku fur tab ama browser kale.',
    challenge: 'Tartan ⚔️',
    you: 'Adiga',
    cancelRadar: 'Ka Bax Radiyaha',
    privateMatchTitle: 'Qol Khaas Ah Asxaabta',
    privateMatchDesc: 'Sameey qol Ludo koodh leh si aad asxaabtaada ula ciyaarto, ama geli koodhka qolka asxaabtaada.',
    createPrivateRoom: '➕ Sameey Qol Khaas Ah',
    joinPrivateRoom: '🔑 Ku Biir Qol',
    roomCodePlaceholder: 'Geli Koodhka Qolka',
    createCustomLobby: 'Sameey Qol Khaas Ah',
    lobbyCode: 'Koodhka Qolka',
    globalLeaderboard: 'Kala Horeynta Guud',
    practiceTitle: 'Tababar Pro',
    practiceDesc: 'Aan lacag ku xirnayn, waa bilaash',
    stakeWin: 'Bet $1 • Guuleyso $2.00',
    wins: 'Guulaha',
    losses: 'Qasaaraha',
    totalEarned: 'Guud Ahaan Lacagta',
    profileSettings: 'Habaynta Pro-faylka',
    becomeVip: 'Noqo VIP',
    tournaments: 'Tartamo',
    tournamentsHeader: 'Tartamada Ludo$om 🏆',
    tournamentsSub: 'Kula tartan ciyaartoyda kale Ludo-da abaalmarinada waaweyn leh ku noqo horyaalka!',
    tabAll: 'Dhammaan Tartamada',
    tabOpen: 'Diiwaangelinta Open',
    tabLive: 'Hadda Socda ⚡',
    tabCompleted: 'Dhamaaday 🏆',
    tabMy: 'Aan Ku Jiro 👤',
    entryFee: 'Qiimaha Diiwaangelinta',
    prizePool: 'Lacagta Abaalmarinta',
    registeredPlayers: 'Ciyaartoyda Is-diiwaangelisay',
    registerNow: 'Is-diiwaangeli Hadda',
    registered: 'Waad Diiwaangashantahay ✓',
    unregister: 'Ka Bax Diiwaangelinta',
    viewBracket: 'Eeg Shaxda & Kulamada ⚔️',
    noTournamentsFound: 'Ma jiraan tartamo ku habboon oo furan hadda.',
    startsIn: 'Wuxuu bilaabanayaa',
    startsAt: 'Wuxuu bilaabanayaa',
    aboutUs: 'Nagu Saabsan',
    aboutUsContent: "Ku soo dhawoow Ludo$om, meesha ugu horeysa ee Ludo online ee bulshada Soomaaliyeed iyo wixii ka baxsan. Bartayadu waa wax ka badan ciyaar kaliya; waa xarun firfircoon oo ay saaxiibada, qoyska, iyo dadka xiiseeya Ludo ku xirmi karaan, ku tartami karaan, ayna ku wadaagi karaan jacaylkooda ciyaartan qadiimiga ah.\\n\\nWaxaa ka dhashay rabitaan ah in la abuuro meel u gaar ah ciyaartoyda Ludo-da Soomaaliyeed, Ludo$om waa dabbaaldegga dhaqankeena, saaxiibtinimadeena, iyo ruuxayada tartanka. Waxaan si taxadar leh u naqshadaynay barnaamijkeena si aan u bixino waayo-aragnimo Ludo oo dhab ah oo soo jiidasho leh, oo leh dhammaan sharciyada dhaqameed iyo interface casri ah oo si sahlan loo isticmaali karo.\\n\\nMarkaad rabto inaad asxaabtaada kula tartanto ciyaar gaar ah, tijaabiso xirfadahaaga ciyaartoyda adduunka oo dhan, ama aad si fudud ugu raaxaysato ciyaar caadi ah, Ludo$om wax walba way u haysaa qof walba. Bartayadu waxay taageertaa ciyaarta keli-kelida ah iyo tan kooxeedba, taasoo kuu oggolaanaysa inaad lamaane la sameysato oo aad adduunka la tartanto.\\n\\nLudo$om, waxaan ka go'an nahay ciyaar cadaalad ah iyo jawi ciyaar oo aamin ah. Tiknoolajiyadeena casriga ah waxay hubineysaa in laadhuu walba si aan kala sooc lahayn u dhaco oo ciyaar walba lagu go'aamiyo xirfad iyo istaraatiijiyad. Waxaan sidoo kale bixinaa astaamo kala duwan oo loogu talagalay in lagu wanaajiyo waayo-aragnimadaada ciyaaraha, oo ay ku jiraan wada sheekeysi toos ah, profile-yo la beddeli karo, iyo sabuurad caalami ah oo aad kula socon karto horumarkaaga oo aad ku arki karto sidaad ula tartanto tartamayaasha.\\n\\nNagu soo biir maanta oo ka mid noqo bulshadeena sii kordheysa. Ludo$om waa wax ka badan ciyaar kaliya; waa meesha adduunku u yimaado inuu ku ciyaaro Ludo, habka Soomaalida.",
    help: 'Caawin',
    helpContent: "Ku soo dhawoow Xarunta Caawinta Ludo$om. Halkaan waxaad ka heli doontaa jawaabaha su'aalaha badanaa la isweydiiyo iyo tilmaamo kaa caawinaya inaad sida ugu fiican uga faa'iidaysato barnaamijkeena.\\n\\n**Sida Loo Bilaabo**\\n\\n*   **Samaynta Koonto:** Si aad u bilowdo ciyaarta, waxaad u baahan doontaa inaad samaysato koonto. Waxaad iska diiwaan gelin kartaa adigoo isticmaalaya ciwaanka emailkaaga ama akoonnadaada baraha bulshada. Markaad is diiwaan geliso, waxaad ku habeyn kartaa profile-kaaga magac isticmaale iyo avatar gaar ah.\\n*   **Ku Biirista Ciyaar:** Waxaad ku biiri kartaa ciyaar siyaabo dhowr ah. Waxaad bilaabi kartaa isbarbardhig si lagugu lamaaneeyo ciyaartoy kale, ku biir qol gaar ah adoo isticmaalaya koodh saaxiibkaa kaa soo siiyay, ama sameyso qol kuu gaar ah oo ku casuum dadka kale inay ku soo biiraan.\\n*   **Ciyaarta Ciyaarta:** Sharciyada Ludo$om waa isku mid sida Ludo-dhaqameedka. Hadafku waa inaad dhammaan afartaada calaamadood ka soo rarto aaggaaga bilowga una guurto bartamaha sabuuradda. Si tan loo sameeyo, waxaad u baahan doontaa inaad tuurto lix si aad calaamad uga soo saarto deyrkaaga oo aad u saarto fagaaraha bilowga ah. Kadib waxaad calaamadahaaga ku wareejin kartaa sabuuradda adoo tuuraya laadhuuga.\\n\\n**Astaamaha**\\n\\n*   **Boorsada:** Boorsadaada ciyaarta dhexdeeda waxay kuu oggolaaneysaa inaad maamusho lacagtaada casriga ah. Waad dhigan kartaa lacag si aad ugu ciyaarto kulammada saamiga leh waadna kala bixi kartaa guulahaaga.\\n*   **Isbarbardhigga:** Nidaamkeena isbarbardhigga wuxuu kugu lamaaneyn doonaa ciyaartoy kale oo leh heer xirfadeed oo la mid ah si aad u hesho ciyaar tartan ah oo cadaalad ah.\\n*   **Qolal Gaar Ah:** Abuur qol gaar ah si aad asxaabtaada ula ciyaarto. Waxaad dejin kartaa qaddarka sharadka oo aad la wadaagi kartaa koodhka qolka qof kasta oo aad rabto inaad ku casuunto.\\n*   **Sabuuradda Hogaamiyeyaasha:** La soco horumarkaaga oo arag sidaad uga soo horjeedo ciyaartoyda kale sabuuradeena hogaamiyeyaasha caalamiga ah.\\n\\n**Nala Soo Xiriir**\\n\\nHaddii aadan ka heli karin jawaabta su'aashaada halkan, fadlan ha ka waaban inaad nala soo xiriirto. Waxaad la xiriiri kartaa kooxdayada taageerada email ahaan [support@ludosom.com](mailto:support@ludosom.com) ama kanaaladayada baraha bulshada. Had iyo jeer diyaar ayaan u nahay inaan ku caawinno.",


    // Game Room
    yourTurn: 'Ciyaartaada Waa Hada!',
    waitingTurn: 'Waxaa la sugayaa ciyaaryahanka...',
    rollDice: 'Tuur Laadhuuga',
    rolled: 'Waxaa soo baxay',
    moveToken: 'Taabo shaxda ifaysa si aad u dhaqaajiso',
    liveVoice: 'Codka Live-ka Ah',
    micOn: 'Cmak-ka Shidan',
    micMuted: 'Cmak-ka Xiran',
    speakersOn: 'Codka Shidan',
    speakersMuted: 'Codka Muted',
    send: 'Dir',
    typeMessage: 'Qor maqaal ama fariin...',
    forfeitGame: 'Ka Bax Ciyaarta',
    forfeitTitle: 'Ma Hubtaa In Aad Ka Baxeysid?',
    forfeitDesc: 'Haddii aad hadda ka baxdo ciyaarta, waxaad luminaysaa lacagta bet-ka.',
    yesLeave: 'Hoo, Ka Bax',
    cancel: 'Kansal',
    winnerTitle: 'Ciyaartu Waa Dhamaatay!',
    wonPot: 'waxay ku guuleysteen lacagta',
    backToDashboard: 'Ku Bixii Garoonka',
    turnTimer: 'Waqtiga Ciyaarta',
    waitingForApproval: 'Sugida Ogolaanshaha',
    joinRequestSent: 'Codsigaaga ku biirista ee qolka waa la gudbiyey.',
    waitForHostApproval: 'Sug inta martigeliyaha qolka (Host) uu kaa aqbalayo si aad u bilowdo ciyaarta!',
    betStake: 'Lacagta ciyaarta',
    youWon: 'WAAD GUULEYSATAY! 🏆',
    youLost: 'WAA LAGU HELAY! 😭',
    winner: 'Guuleyste',
    winnings: 'Dakhliga Guusha',
    playAnotherGame: 'Ciyaar kale Bilow ⚔️',
    teamRedAndYellow: 'TEAM CAS & HURUUD',
    allies: 'XULAFA',
    teamGreenAndBlue: 'TEAM CAGAAR & BULUUG',
    notAvailable: 'Ma Jiro',
    selectToken: 'Dooro Boorinka',
    clickHighlightedTokenToMove: 'Taabo boorinka kor ku iftiimaya si aad u dhaqaajiso!',
    autoRoll: 'Duubid Toos Ah',
    quickReactions: 'Dareeno Degdeg Ah',
    newJoinRequest: 'Codsi ku soo biiritaan cusub',
    accept: 'Ogolow',
    decline: 'Diid',

    // Wallet Modal
    walletTitle: 'Boorsada & Lacag Bixinta',
    availableBalance: 'Lacagta Hadda Kuu Jirtay',
    deposit: 'Shubo',
    withdraw: 'Bixid',
    history: 'Taariikh',
    selectDepositMethod: 'Dooro Habka Shubashada',
    mobileNumber: 'Lamberka Telefoonka',
    amountUSD: 'Tirada Lacagta (USD)',
    confirmDeposit: 'Xaqiiji Shubashada',
    confirmWithdrawal: 'Xaqiiji Bixinta',
    processing: 'Waqti Yar Sug...',
    quickSelect: 'Dooro Qadarka',
    depositSuccess: 'Shubashadu waa guuleysatay!',
    withdrawSuccess: 'Kala bixidda waa ay guuleysatay!',
    enterValidAmount: 'Fadlan geli lacag sax ah oo togan.',
    insufficientFunds: 'Haraagaaga kuma filna kala bixiddaan.',
    enterPhoneNumber: 'Fadlan qor lambarkaaga talefanka.',
    transactionFailed: 'Bixintu waa fashilantay. Fadlan kor u tijaabi.',
    noTransactions: 'Ma jiro wax dhigan ah oo la diwaan geliyay.',

    // Matchmaking Explanation
    matchmakingInfoTitle: 'Faahfaahinta Isku Aadka & Kulamada Tartanka',
    matchmakingInfoDesc: 'Sida loo isku aado ciyaartoyda, cidda go’aamisa iyo sharciyada ciyaarta.',
    pairingTypeTitle: '2 Ciyaartoy Isku Aad ah (1v1 Direct Knockout)',
    pairingTypeDesc: 'Ciyaar kasta waxaa isugu soo baxaya 2 ciyaartoy (1v1). Qofkii guuleysta ayaa u gudbaya wareega xiga, kii lagana wuu ka baxayaa.',
    whoDecidesTitle: 'Isku Aad Toos ah oo Cadaalad ah (System AI)',
    whoDecidesDesc: 'Isku aadka waxaa si toos ah oo random ah u sameeya nidaamka (Algorithm) marka uu tartanku furmo. Adminku gacanta ku ma go’aamiyo.',
    yourBalance: 'Lacagta Kugu Jirta',
    confirmRegistration: 'Xaqiiji Diiwaangelinta Tartanka',
    entryFeeNotice: 'Qiimaha diiwaangelinta waxaa toos looga jarayaa haraagaaga.',
    confirmYes: 'Haa, Is-diiwaangeli Hadda',
    cancelBtn: 'Kansal',
    dashboardNav: 'Guud',

    // Switcher
    switchLanguage: 'Luqadda',
  }
};

export type TranslationKey = keyof typeof translations.en;

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  toggleLanguage: () => void;
  t: (key: TranslationKey) => string;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = useState<Language>(() => {
    const saved = localStorage.getItem('app_language');
    return (saved === 'so' || saved === 'en') ? saved : 'en';
  });

  const setLanguage = (lang: Language) => {
    setLanguageState(lang);
    localStorage.setItem('app_language', lang);
  };

  const toggleLanguage = () => {
    const nextLang = language === 'en' ? 'so' : 'en';
    setLanguage(nextLang);
  };

  const t = (key: TranslationKey): string => {
    return translations[language][key] || translations.en[key] || key;
  };

  return (
    <LanguageContext.Provider value={{ language, setLanguage, toggleLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
}
