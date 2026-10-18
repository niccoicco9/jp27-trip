// Contenuti delle utility: frasi, guide, checklist, contatti.

window.FRASI = [
  { cat: "Base", items: [
    ["こんにちは", "konnichiwa", "Buongiorno / Ciao"],
    ["ありがとうございます", "arigatō gozaimasu", "Grazie mille"],
    ["すみません", "sumimasen", "Mi scusi / Permesso (serve per tutto!)"],
    ["お願いします", "onegai shimasu", "Per favore"],
    ["はい／いいえ", "hai / iie", "Sì / No"],
    ["英語を話せますか？", "eigo o hanasemasu ka?", "Parla inglese?"],
    ["わかりません", "wakarimasen", "Non capisco"],
    ["大丈夫です", "daijōbu desu", "Va bene così / No grazie"],
  ]},
  { cat: "Ristorante", items: [
    ["四人です", "yonin desu", "Siamo in quattro"],
    ["英語のメニューはありますか？", "eigo no menyū wa arimasu ka?", "Avete un menu in inglese?"],
    ["これをください", "kore o kudasai", "Questo, per favore (indicando)"],
    ["おすすめは何ですか？", "osusume wa nan desu ka?", "Cosa ci consiglia?"],
    ["お水をください", "omizu o kudasai", "Dell'acqua, per favore"],
    ["お会計お願いします", "okaikei onegai shimasu", "Il conto, per favore"],
    ["いただきます", "itadakimasu", "Si dice prima di mangiare"],
    ["ごちそうさまでした", "gochisōsama deshita", "Si dice dopo il pasto, uscendo"],
    ["おいしい！", "oishii!", "Buonissimo!"],
    ["乾杯！", "kanpai!", "Cin cin!"],
  ]},
  { cat: "Allergie e diete", items: [
    ["私は…アレルギーがあります", "watashi wa … arerugī ga arimasu", "Sono allergico/a a …"],
    ["えび・かに", "ebi / kani", "Gamberi / granchio"],
    ["魚介類", "gyokairui", "Pesce e frutti di mare"],
    ["卵", "tamago", "Uova"],
    ["乳製品", "nyūseihin", "Latticini"],
    ["ナッツ・ピーナッツ", "nattsu / pīnattsu", "Frutta secca / arachidi"],
    ["小麦", "komugi", "Grano (glutine)"],
    ["肉が食べられません", "niku ga taberaremasen", "Non posso mangiare carne"],
  ]},
  { cat: "Spostarsi", items: [
    ["…はどこですか？", "… wa doko desu ka?", "Dov'è …?"],
    ["トイレはどこですか？", "toire wa doko desu ka?", "Dov'è il bagno?"],
    ["駅はどこですか？", "eki wa doko desu ka?", "Dov'è la stazione?"],
    ["この電車は…に行きますか？", "kono densha wa … ni ikimasu ka?", "Questo treno va a …?"],
    ["ここに行ってください", "koko ni itte kudasai", "(Taxi) Mi porti qui, per favore"],
    ["ここで止めてください", "koko de tomete kudasai", "(Taxi) Si fermi qui"],
    ["荷物を預けられますか？", "nimotsu o azukeraremasu ka?", "Posso lasciare i bagagli?"],
  ]},
  { cat: "Shopping", items: [
    ["いくらですか？", "ikura desu ka?", "Quanto costa?"],
    ["カードで払えますか？", "kādo de haraemasu ka?", "Posso pagare con carta?"],
    ["免税できますか？", "menzei dekimasu ka?", "Si può fare il tax free?"],
    ["袋は要りません", "fukuro wa irimasen", "Non mi serve la busta"],
    ["試着してもいいですか？", "shichaku shite mo ii desu ka?", "Posso provarlo?"],
  ]},
  { cat: "Emergenza", items: [
    ["助けて！", "tasukete!", "Aiuto!"],
    ["救急車を呼んでください", "kyūkyūsha o yonde kudasai", "Chiamate un'ambulanza"],
    ["病院はどこですか？", "byōin wa doko desu ka?", "Dov'è l'ospedale?"],
    ["気分が悪いです", "kibun ga warui desu", "Mi sento male"],
    ["財布をなくしました", "saifu o nakushimashita", "Ho perso il portafoglio"],
    ["道に迷いました", "michi ni mayoimashita", "Mi sono perso/a"],
    ["交番はどこですか？", "kōban wa doko desu ka?", "Dov'è il posto di polizia?"],
  ]},
];

window.CONTATTI = [
  { t: "Polizia", n: "110", d: "Furti, smarrimenti, incidenti" },
  { t: "Ambulanza e vigili del fuoco", n: "119", d: "Emergenze mediche e incendi" },
  { t: "Japan Visitor Hotline (JNTO)", n: "+81 50 3816 2787", d: "24/7, in inglese: assistenza ai turisti, anche in caso di terremoti" },
  { t: "Ambasciata d'Italia a Tokyo", n: "+81 3 3453 5291", d: "2-5-4 Mita, Minato-ku" },
  { t: "Unità di Crisi Farnesina", n: "+39 06 36225", d: "Emergenze per italiani all'estero, 24/7" },
];

window.GUIDE = {
  trasporti: { titolo: "Treni e trasporti", icon: "TrainFront", col: "#2b4c7e", html: `
    <h3>Carta IC (Suica / PASMO / ICOCA)</h3>
    <p>Una carta ricaricabile valida in quasi tutto il Giappone: metro, treni, bus, konbini e distributori. Su <b>iPhone</b> si aggiunge in <i>Wallet → + → Carta di trasporto → Suica</i> e si ricarica con Apple Pay. Su Android dipende dal telefono: in alternativa comprate la <b>Welcome Suica</b> all'aeroporto.</p>
    <h3>Shinkansen</h3>
    <p>Prenotate il posto (reserved) nei periodi affollati. Sulle linee Tokaido/Sanyo le valigie grandi (somma dei lati oltre 160 cm) richiedono il <b>posto con spazio bagagli</b> prenotato. Per le valigie si può usare il <b>takkyubin</b>, la spedizione bagagli in hotel (Yamato), che arriva in un giorno.</p>
    <h3>JR Pass</h3>
    <p>Dal 2023 costa molto di più. Conviene solo con molti Shinkansen lunghi in pochi giorni. Fate il conto con il calcolatore ufficiale prima di comprarlo: spesso convengono biglietti singoli o pass regionali (Kansai, Hokuriku, Fuji-Hakone).</p>
    <h3>Consigli</h3>
    <ul>
      <li><b>Google Maps</b> è ottimo per i treni: orari, binari e uscite.</li>
      <li>Gli ultimi treni partono intorno a mezzanotte. Dopo resta solo il taxi.</li>
      <li>Sulle scale mobili si sta a sinistra a Tokyo e a destra a Osaka.</li>
      <li>In treno si parla sottovoce e non si telefona.</li>
      <li>Le porte dei taxi si aprono da sole: non toccatele.</li>
    </ul>` },
  galateo: { titolo: "Galateo", icon: "HandHeart", col: "#c0577a", html: `
    <ul>
      <li><b>Niente mance</b>: possono creare imbarazzo.</li>
      <li><b>Non si mangia camminando</b>: mangiate vicino al banco o al distributore dove avete comprato.</li>
      <li><b>Cestini rari</b>: portatevi un sacchetto e buttate i rifiuti in hotel o nei konbini.</li>
      <li><b>Scarpe</b>: vanno tolte in ryokan, in molti templi e quando c'è un gradino all'ingresso. Calzini senza buchi!</li>
      <li><b>Bacchette</b>: non piantatele nel riso e non passate il cibo da bacchetta a bacchetta (sono gesti funebri).</li>
      <li><b>Soldi</b>: si appoggiano sul vassoietto alla cassa, non in mano.</li>
      <li><b>Onsen</b>: ci si lava bene prima di entrare, nudi, asciugamano fuori dall'acqua e capelli raccolti. I tatuaggi a volte non sono ammessi: chiedete o cercate un onsen <i>tattoo friendly</i>.</li>
      <li><b>Santuari</b>: inchino al torii, lavaggio delle mani al temizuya, poi: moneta, 2 inchini, 2 battiti di mani, 1 inchino.</li>
      <li><b>Code</b>: si rispettano sempre, anche sui binari, dove ci sono i segni a terra.</li>
      <li><b>Geisha a Gion</b>: niente foto da vicino. In alcune vie private sono vietate e c'è la multa.</li>
    </ul>` },
  soldi: { titolo: "Soldi e pagamenti", icon: "Banknote", col: "#4f8a3c", html: `
    <ul>
      <li>Le carte sono accettate quasi ovunque nelle città. Templi, bancarelle e locali piccoli spesso accettano <b>solo contanti</b>.</li>
      <li><b>Prelievi</b>: gli ATM dei <b>7-Eleven</b> e di <b>Japan Post</b> accettano le carte estere. Alla domanda sulla conversione scegliete sempre di pagare <b>in yen</b>.</li>
      <li>Portate un <b>portamonete</b>: girano tante monete (fino a 500 ¥).</li>
      <li><b>Tax free</b>: serve il passaporto. ⚠️ Dal 1° novembre 2026 il sistema dovrebbe diventare <b>a rimborso</b>: si paga l'IVA in negozio e la si recupera alla dogana in aeroporto. Verificate le regole prima di partire e tenete gli acquisti nel bagaglio a mano.</li>
    </ul>` },
  stagione: { titolo: "Clima e stagione", icon: "CloudSun", col: "#d9822b", html: `
    <p>Fine febbraio – inizio marzo è <b>fine inverno</b>: a Tokyo, Kyoto e Osaka si va da circa 2 °C la mattina a 12 °C di giorno. Kanazawa, Takayama, Shirakawa-gō e la zona del Fuji sono più fredde e possono avere <b>neve</b>. In compenso il Fuji si vede spesso bene, con l'aria tersa.</p>
    <h3>Da non perdere in quel periodo</h3>
    <ul>
      <li>🌸 <b>Fioritura dei susini (ume)</b>: il picco è tra febbraio e inizio marzo. A Kyoto il Kitano Tenmangū, a Tokyo lo Yushima Tenjin.</li>
      <li>🌸 <b>Kawazu-zakura</b>: ciliegi precoci rosa intenso, già a fine febbraio / inizio marzo.</li>
      <li>🎎 <b>Hinamatsuri</b> (3 marzo): la festa delle bambole.</li>
      <li>🔥 <b>Omizutori al Tōdai-ji di Nara</b> (1–14 marzo): ogni sera grandi torce infuocate sulla terrazza del Nigatsu-dō. Si abbina bene alla vostra visita notturna!</li>
      <li>🏮 <b>Kyoto Higashiyama Hanatōro</b>: le stradine di Higashiyama illuminate dalle lanterne, di solito a marzo. Controllate le date.</li>
      <li>🎌 <b>23 febbraio</b>: festa nazionale (compleanno dell'Imperatore). Aspettatevi più folla.</li>
    </ul>
    <p>Vestitevi a strati: fuori fa freddo, ma in treni, negozi e musei il riscaldamento è alto. Gli <b>heattech Uniqlo</b> e i <b>kairo</b> (scaldini usa e getta) sono ottimi.</p>` },
  pratico: { titolo: "Info pratiche", icon: "Plug", col: "#6b5a45", html: `
    <ul>
      <li><b>Prese</b>: tipo A/B a 100 V. Serve un <b>adattatore</b>: caricatori di telefoni e PC funzionano, piastre e phon italiani no.</li>
      <li><b>Internet</b>: un'<b>eSIM</b> dati (Ubigi, Airalo, Holafly…) installata prima di partire, oppure un pocket Wi-Fi da dividere in coppia.</li>
      <li><b>Visit Japan Web</b>: compilate immigrazione e dogana online prima del volo e tenete i QR code pronti.</li>
      <li><b>Farmaci</b>: alcuni farmaci da banco italiani con <b>pseudoefedrina</b> (per esempio certi antiraffreddore) sono vietati. Per i farmaci personali portate la ricetta.</li>
      <li><b>Konbini</b> (7-Eleven, Lawson, FamilyMart): colazioni, ATM, bagni, stampa, biglietti. La vostra salvezza.</li>
      <li><b>Bagni pubblici</b>: puliti e gratuiti, ma spesso senza salviette per le mani. Portate un fazzolettino di stoffa.</li>
      <li><b>Acqua</b> del rubinetto potabile ovunque.</li>
      <li><b>Terremoti</b>: se arriva un allarme sul telefono, allontanatevi dalle finestre e riparatevi sotto un tavolo. App consigliata: <i>Safety tips</i> (JNTO).</li>
    </ul>` },
  installa: { titolo: "Installa l'app", icon: "Smartphone", col: "#1f9488", html: `
    <h3>iPhone</h3>
    <ol><li>Apri questo sito con <b>Safari</b></li><li>Tocca <b>Condividi</b> (il quadrato con la freccia)</li><li><b>Aggiungi alla schermata Home</b></li></ol>
    <h3>Android</h3>
    <ol><li>Apri il sito con <b>Chrome</b></li><li>Menu ⋮ → <b>Installa app</b> (oppure <i>Aggiungi a schermata Home</i>)</li></ol>
    <p>Dopo la prima apertura online, programma, luoghi, frasi e guide funzionano anche <b>offline</b>. La mappa e il meteo richiedono internet.</p>` },
};

window.CHECKLIST = [
  ["Documenti", ["Passaporto (valido per tutto il viaggio)", "Visit Japan Web compilato", "Assicurazione sanitaria di viaggio", "Biglietti aerei / carte d'imbarco", "Prenotazioni hotel salvate offline", "Patente internazionale (se guidate)"]],
  ["Soldi", ["Carta senza commissioni estere", "Carta di riserva", "Un po' di yen in contanti", "Portamonete per le monete"]],
  ["Tecnologia", ["eSIM / pocket Wi-Fi", "Adattatore presa tipo A", "Power bank", "Suica nel Wallet", "Mappe offline / app installata", "Google Translate con il giapponese offline"]],
  ["Vestiti", ["Scarpe comode (già usate!)", "Calzini senza buchi (templi e ryokan)", "Strati caldi / heattech", "Giacca impermeabile", "Cappello e guanti (zona Fuji / Kanazawa)"]],
  ["Altro", ["Farmaci personali + ricetta", "Fazzolettino per le mani", "Sacchetto per i rifiuti", "Borsa piegabile per lo shopping", "Spazio in valigia per i souvenir 😄"]],
];
