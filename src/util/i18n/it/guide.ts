import type { MessageKey } from '../index';

export const guide = {
  // Dialog chrome.
  'guide.toggle': 'Informazioni su questo tipo di grafico: {chartType}',
  'guide.definitionHeading': 'Che cos\'è',
  'guide.purposeHeading': 'A cosa serve',
  'guide.appearanceHeading': 'Com\'è fatto',

  // Multi-panel figure.
  'guide.figure.definition': 'Una figura a più pannelli riunisce diversi grafici piccoli, affiancati o disposti a griglia. Hanno tutti un unico titolo generale.',
  'guide.figure.purpose': 'Serve a confrontare con un colpo d\'occhio viste collegate degli stessi dati, per esempio la stessa misura per gruppi o anni diversi.',
  'guide.figure.appearance': 'Immagina una pagina divisa in riquadri, come una finestra con tanti vetri. Ogni riquadro contiene un grafico con i suoi assi. Puoi entrare in un pannello alla volta.',

  'guide.area.definition': 'Un grafico ad area è un grafico a linee in cui lo spazio tra la linea e l\'asse in basso è riempito.',
  'guide.area.purpose': 'Serve a mostrare come una quantità sale e scende nel tempo. Il riempimento aiuta a percepire quanto è grande quella quantità.',
  'guide.area.appearance': 'Una linea va da sinistra a destra e sale o scende insieme ai valori. Tutto lo spazio sotto la linea, fino alla base, è pieno. Sembra una catena di montagne vista di lato.',

  'guide.alluvial.definition': 'Un diagramma alluviale mostra come degli elementi passano da un gruppo all\'altro attraverso diverse fasi.',
  'guide.alluvial.purpose': 'Serve a seguire i cambi di gruppo, per esempio come gli elettori sono passati da un partito all\'altro tra due elezioni.',
  'guide.alluvial.appearance': 'Da sinistra a destra ci sono colonne di blocchi impilati, una colonna per ogni fase. Tra una colonna e la successiva scorrono delle fasce curve. Più una fascia è spessa, più elementi hanno seguito quel percorso.',

  'guide.bar.definition': 'Un grafico a barre mostra un numero per ogni categoria sotto forma di barra.',
  'guide.bar.purpose': 'Serve a confrontare quantità tra categorie, per esempio le vendite per mese o i voti per candidato.',
  'guide.bar.appearance': 'Rettangoli della stessa larghezza stanno uno accanto all\'altro e partono tutti dalla stessa base. Più la barra è lunga, più il valore è grande. Le barre possono essere in piedi o sdraiate.',

  'guide.bump.definition': 'Un grafico bump mostra come cambia nel tempo la posizione in classifica di diversi concorrenti.',
  'guide.bump.purpose': 'Serve a seguire chi è primo, secondo, terzo e così via, e a capire quando uno supera l\'altro, come le squadre in un campionato.',
  'guide.bump.appearance': 'Il tempo va da sinistra a destra e la classifica dall\'alto in basso, con il primo posto in cima. Ogni concorrente è una linea con un punto per ogni momento. Le linee si incrociano quando due concorrenti si scambiano di posto.',

  'guide.box.definition': 'Un box plot riassume un insieme di numeri con cinque valori: il minimo, il primo quarto, il valore centrale, il terzo quarto e il massimo.',
  'guide.box.purpose': 'Serve a confrontare il centro e la dispersione di più gruppi, e a trovare i valori insoliti, chiamati outlier.',
  'guide.box.appearance': 'Ogni gruppo ha una scatola attraversata da una linea nel valore centrale. Da entrambi i lati della scatola partono due linee sottili, chiamate baffi, che arrivano ai valori tipici più basso e più alto. Gli outlier sono piccoli punti oltre i baffi.',

  'guide.boxen.definition': 'Un grafico letter-value è un box plot esteso. Mostra più punti di taglio dei dati, soprattutto alle estremità.',
  'guide.boxen.purpose': 'Serve per grandi quantità di dati, quando un box plot normale nasconde troppi dettagli sui valori estremi.',
  'guide.boxen.appearance': 'Ogni gruppo sembra una pila di scatole centrate sul valore centrale. La scatola più larga contiene la metà centrale dei dati. Ogni scatola più piccola, verso l\'esterno, contiene una fetta più sottile delle estremità, come una piramide a gradoni.',

  'guide.candlestick.definition': 'Un grafico a candele mostra come si è mosso un prezzo in ogni periodo di tempo, per esempio in un giorno.',
  'guide.candlestick.purpose': 'Si usa in finanza per leggere il prezzo di apertura, il massimo, il minimo e il prezzo di chiusura di un titolo o di una valuta in ogni periodo.',
  'guide.candlestick.appearance': 'Il tempo va da sinistra a destra, con una candela per ogni periodo. Ogni candela ha un corpo spesso tra il prezzo di apertura e quello di chiusura. Da lì partono due linee sottili, chiamate stoppini, che salgono fino al massimo e scendono fino al minimo. Di solito il corpo ha un colore quando il prezzo sale e un altro quando scende.',

  'guide.candlestick_delta.definition': 'Il delta di riferimento del grafico a candele confronta ogni candela con una linea di riferimento, per esempio una media mobile.',
  'guide.candlestick_delta.purpose': 'Serve a capire di quanto il prezzo era sopra o sotto il suo livello abituale in ogni periodo.',
  'guide.candlestick_delta.appearance': 'Non ha un disegno proprio. Legge le stesse candele del grafico a candele e indica ogni prezzo come differenza rispetto alla linea di riferimento in quel momento.',

  'guide.chord.definition': 'Un diagramma a corde mostra flussi o collegamenti tra i membri di un gruppo, disposti attorno a un cerchio.',
  'guide.chord.purpose': 'Serve a mostrare chi scambia quanto con chi, per esempio il commercio tra paesi o le migrazioni tra regioni.',
  'guide.chord.appearance': 'I membri sono archi lungo il bordo di un cerchio. Nastri curvi attraversano l\'interno del cerchio e uniscono due membri. Più un nastro è largo, più il flusso è grande.',

  'guide.choropleth.definition': 'Una mappa coropletica è una carta geografica in cui ogni regione è colorata in base a un valore.',
  'guide.choropleth.purpose': 'Serve a mostrare come una misura cambia da un luogo all\'altro, per esempio la popolazione per paese o il reddito per provincia.',
  'guide.choropleth.appearance': 'Sembra una normale carta geografica, con i confini di regioni come paesi o stati. Ogni regione è riempita con una tonalità, di solito più scura o più intensa per i valori alti. Una legenda spiega la scala.',

  'guide.contour.definition': 'Un grafico a curve di livello rappresenta su un foglio piatto una superficie di valori. Usa linee che uniscono i punti con lo stesso valore.',
  'guide.contour.purpose': 'Serve per dati che cambiano in due direzioni, come l\'altitudine su una carta escursionistica o la temperatura in una regione.',
  'guide.contour.appearance': 'Anelli chiusi e ondulati sono disegnati uno dentro l\'altro, come le curve di livello attorno a una collina su una carta escursionistica. Ogni anello segna un valore. Dove gli anelli sono vicini il valore cambia in fretta, dove sono lontani cambia piano.',

  'guide.diverging_bar.definition': 'Un grafico a barre divergenti mostra barre che crescono in due direzioni opposte a partire da una linea centrale.',
  'guide.diverging_bar.purpose': 'Serve a confrontare due parti opposte, per esempio le risposte d\'accordo e in disaccordo, oppure uomini e donne in una piramide delle età.',
  'guide.diverging_bar.appearance': 'Una linea attraversa il centro. Per ogni categoria, una barra si allunga verso sinistra e un\'altra verso destra. La lunghezza della barra è il suo valore, e il lato indica a quale gruppo appartiene.',

  'guide.dodged_bar.definition': 'Un grafico a barre affiancate, detto anche a barre raggruppate, mette più barre una accanto all\'altra dentro ogni categoria.',
  'guide.dodged_bar.purpose': 'Serve a confrontare dei sottogruppi dentro ogni categoria, per esempio le vendite di diversi prodotti in ogni mese.',
  'guide.dodged_bar.appearance': 'Lungo l\'asse delle categorie ci sono piccoli gruppi di barre. Ogni gruppo ha una barra per sottogruppo, una accanto all\'altra, tutte dalla stessa base e di solito di colori diversi.',

  'guide.dot.definition': 'Un grafico a punti mostra un numero per ogni categoria con un solo punto.',
  'guide.dot.purpose': 'Si usa come un grafico a barre, per confrontare valori tra categorie. Però usa meno inchiostro, così resta facile da leggere anche con molte categorie.',
  'guide.dot.appearance': 'Le categorie sono elencate lungo un asse. Per ognuna c\'è un solo punto, messo all\'altezza del suo valore lungo l\'altro asse.',

  'guide.dumbbell.definition': 'Un grafico a manubrio mostra due valori per ogni categoria, uniti da una linea.',
  'guide.dumbbell.purpose': 'Serve a mostrare la distanza o il cambiamento tra due valori, per esempio prima e dopo, oppure quest\'anno e l\'anno scorso.',
  'guide.dumbbell.appearance': 'Ogni categoria ha due punti uniti da una barra dritta, come un manubrio da palestra. La lunghezza della barra è la distanza tra i due valori.',

  'guide.error_bar.definition': 'Un grafico con barre di errore mostra dei valori insieme a quanto ciascuno è incerto.',
  'guide.error_bar.purpose': 'Si usa nella scienza e nella statistica per mostrare una misura e il suo intervallo probabile, come un intervallo di confidenza.',
  'guide.error_bar.appearance': 'Ogni valore è un punto o la cima di una barra. Una linea sottile lo attraversa, da un limite inferiore a un limite superiore. Spesso ha due trattini alle estremità, come la lettera I.',

  'guide.forest.definition': 'Un forest plot mostra i risultati di diversi studi sulla stessa domanda, una riga per studio, più un risultato complessivo.',
  'guide.forest.purpose': 'Si usa nella ricerca medica e nelle meta-analisi per capire se gli studi concordano e qual è il loro effetto complessivo.',
  'guide.forest.appearance': 'Gli studi sono elencati dall\'alto in basso. Ognuno ha un quadratino nella sua stima e una linea orizzontale che ne mostra l\'incertezza. Una linea verticale segna "nessun effetto". In fondo, un rombo mostra il risultato combinato.',

  'guide.gantt.definition': 'Un diagramma di Gantt mostra delle attività come barre lungo una linea del tempo.',
  'guide.gantt.purpose': 'Si usa per pianificare progetti: mostra quando inizia e finisce ogni attività, quanto dura e quali attività si sovrappongono.',
  'guide.gantt.appearance': 'Il tempo va da sinistra a destra e le attività sono elencate dall\'alto in basso. Ogni attività è una barra orizzontale che inizia alla data di partenza e finisce alla data di chiusura.',

  'guide.funnel.definition': 'Un grafico a imbuto mostra quanti elementi restano in ogni fase di un processo.',
  'guide.funnel.purpose': 'Serve a capire dove si perdono gli elementi, per esempio quanti visitatori di un sito si iscrivono e poi comprano.',
  'guide.funnel.appearance': 'Le fasi sono impilate dall\'alto in basso. Ogni fase è una barra centrata, e le barre diventano più strette scendendo. La forma intera ricorda un imbuto da cucina.',

  'guide.gauge.definition': 'Un grafico a tachimetro mostra un solo valore rispetto al suo intervallo possibile, come il tachimetro di un\'auto.',
  'guide.gauge.purpose': 'Serve a mostrare i progressi verso un obiettivo, oppure se una lettura è in una zona buona, di attenzione o critica.',
  'guide.gauge.appearance': 'Un semicerchio o una barra dritta rappresenta tutto l\'intervallo, dal minimo al massimo, spesso diviso in zone colorate. Una lancetta o una parte riempita indica il valore attuale. A volte c\'è anche un segno per l\'obiettivo.',

  'guide.heat.definition': 'Una mappa di calore è una griglia di celle, in cui ogni cella è colorata in base al suo valore.',
  'guide.heat.purpose': 'Serve a trovare schemi in una tabella di numeri, per esempio quali ore di quali giorni sono le più affollate.',
  'guide.heat.appearance': 'Righe e colonne formano una griglia, come una scacchiera. Ogni cella ha un colore, di solito più scuro o più caldo per i valori alti. Una legenda spiega la scala.',

  'guide.hexbin.definition': 'Un grafico a esagoni divide un grafico a dispersione in celle a sei lati e conta quanti punti cadono in ognuna.',
  'guide.hexbin.purpose': 'Si usa quando i punti sono così tanti da finire uno sopra l\'altro. Mostra dove sono più fitti.',
  'guide.hexbin.appearance': 'L\'area del grafico è coperta di esagoni, come un favo d\'api. Ogni esagono è colorato in base a quanti punti contiene: più punti, colore più scuro.',

  'guide.hist.definition': 'Un istogramma mostra come si distribuisce un insieme di numeri, contando quanti cadono in ogni intervallo.',
  'guide.hist.purpose': 'Serve a vedere la forma dei dati: dove si trova la maggior parte dei valori, quanto sono sparsi e se pendono da un lato.',
  'guide.hist.appearance': 'Barre verticali stanno una accanto all\'altra, senza spazi in mezzo. Ogni barra copre un intervallo di valori lungo l\'asse in basso. La sua altezza dice quanti valori cadono in quell\'intervallo.',

  'guide.line.definition': 'Un grafico a linee unisce una serie di valori con una linea, di solito in ordine di tempo.',
  'guide.line.purpose': 'Serve a mostrare le tendenze, per esempio come cambiano la temperatura o il prezzo di un titolo nei giorni o negli anni.',
  'guide.line.appearance': 'Il tempo, o un altro valore ordinato, va da sinistra a destra. La linea sale quando i valori crescono e scende quando calano. Lo stesso grafico può avere più linee, una per serie.',

  'guide.lollipop.definition': 'Un grafico lollipop mostra un numero per ogni categoria con un bastoncino sottile che finisce con un pallino.',
  'guide.lollipop.purpose': 'Si usa come un grafico a barre, per confrontare valori tra categorie, ma ha un aspetto più leggero.',
  'guide.lollipop.appearance': 'Da una base comune sale una linea sottile per ogni categoria. La linea finisce con un pallino all\'altezza del suo valore, come un lecca-lecca sul suo bastoncino.',

  'guide.manhattan.definition': 'Un Manhattan plot mostra i risultati di un test ripetuto su molte posizioni lungo un genoma, un punto per posizione.',
  'guide.manhattan.purpose': 'Si usa in genetica per trovare i pochi punti del genoma fortemente legati a una caratteristica o a una malattia.',
  'guide.manhattan.appearance': 'Le posizioni vanno da sinistra a destra, raggruppate per cromosoma con colori alternati. L\'altezza indica quanto è forte il segnale. Quasi tutti i punti restano in basso, e poche torri svettano in alto, come i grattacieli nel profilo di Manhattan.',

  'guide.mosaic.definition': 'Un grafico a mosaico mostra come si combinano due categorie, con tessere la cui area corrisponde alla quota di ogni combinazione.',
  'guide.mosaic.purpose': 'Serve a esplorare le relazioni in una tabella di conteggi, per esempio la sopravvivenza per classe dei passeggeri.',
  'guide.mosaic.appearance': 'Un rettangolo è diviso in colonne, larghe quanto la dimensione di ogni gruppo. Ogni colonna è poi divisa dall\'alto in basso in tessere, alte quanto la quota di ogni sottogruppo.',

  'guide.network.definition': 'Un diagramma di rete mostra degli elementi come punti e i collegamenti tra loro come linee.',
  'guide.network.purpose': 'Serve a mostrare delle relazioni, per esempio le amicizie tra persone o i link tra pagine web, e a trovare gli elementi più collegati.',
  'guide.network.appearance': 'Piccoli cerchi, chiamati nodi, sono sparsi sulla pagina. Delle linee, chiamate collegamenti, uniscono coppie di nodi. Gli elementi con molti collegamenti tendono a stare al centro, con tante linee che partono da loro.',

  'guide.stacked_normalized_bar.definition': 'Un grafico a barre impilate al 100% mostra ogni categoria come una barra della stessa lunghezza totale, divisa in parti percentuali.',
  'guide.stacked_normalized_bar.purpose': 'Serve a confrontare proporzioni tra categorie, per esempio la quota di ogni fascia d\'età in diversi paesi.',
  'guide.stacked_normalized_bar.appearance': 'Tutte le barre hanno la stessa lunghezza, che vale il 100 per cento. Ogni barra è divisa in segmenti colorati, messi uno dopo l\'altro. La dimensione di ogni segmento è la quota di quella parte.',

  'guide.stacked_normalized_area.definition': 'Un grafico ad aree impilate al 100% mostra come cambiano nel tempo le quote delle diverse parti di un totale.',
  'guide.stacked_normalized_area.purpose': 'Serve a seguire le proporzioni nel tempo, per esempio la quota di energia prodotta da ogni fonte anno per anno.',
  'guide.stacked_normalized_area.appearance': 'Il grafico è un rettangolo pieno, da 0 a 100 per cento. Fasce colorate sono impilate una sopra l\'altra e lo riempiono sempre tutto. Una fascia si allarga quando la sua quota cresce e si stringe quando cala.',

  'guide.parallel_coordinates.definition': 'Un grafico a coordinate parallele mostra elementi con molte misure, una linea per elemento.',
  'guide.parallel_coordinates.purpose': 'Serve a confrontare gli elementi su molte variabili insieme e a trovare gruppi di elementi simili.',
  'guide.parallel_coordinates.appearance': 'Diversi assi verticali stanno uno accanto all\'altro, uno per misura. Ogni elemento è una linea a zig-zag che attraversa ogni asse all\'altezza del suo valore per quella misura.',

  'guide.pie.definition': 'Un grafico a torta mostra come un totale è diviso in parti, come fette di un cerchio.',
  'guide.pie.purpose': 'Serve a mostrare le quote di un totale, per esempio come un bilancio è diviso tra i vari reparti.',
  'guide.pie.appearance': 'Un cerchio è tagliato in fette a spicchio che partono dal centro, come una torta. Più la quota è grande, più la fetta è larga. Tutte le fette insieme formano il cerchio intero.',

  'guide.polar_area.definition': 'Un grafico ad area polare, detto anche grafico a rosa, mostra i valori come spicchi con lo stesso angolo che si allungano verso l\'esterno di quantità diverse.',
  'guide.polar_area.purpose': 'Serve a confrontare valori in categorie cicliche, come i mesi dell\'anno o i punti cardinali.',
  'guide.polar_area.appearance': 'Gli spicchi si aprono a ventaglio da un centro comune, tutti con lo stesso angolo, come i petali di un fiore. Più uno spicchio si allontana dal centro, più il suo valore è grande.',

  'guide.radar.definition': 'Un grafico radar, detto anche grafico a ragno, mostra diverse misure di un elemento su assi disposti in cerchio.',
  'guide.radar.purpose': 'Serve a confrontare punti di forza e di debolezza su diverse qualità, per esempio le abilità di un giocatore.',
  'guide.radar.appearance': 'Dei raggi partono da un punto centrale, uno per misura, come i raggi di una ruota. Ogni valore è un punto sul suo raggio, più lontano dal centro per i valori alti. I punti sono uniti in una forma chiusa, come una ragnatela.',

  'guide.ridgeline.definition': 'Un grafico ridgeline mostra la distribuzione di diversi gruppi come curve morbide impilate una sopra l\'altra.',
  'guide.ridgeline.purpose': 'Serve a confrontare la forma dei dati tra molti gruppi, per esempio le temperature di ogni mese.',
  'guide.ridgeline.appearance': 'Ogni gruppo ha una curva a forma di collina, più alta dove i valori sono frequenti. Le curve sono impilate lungo la pagina e si sovrappongono un po\', come una fila di creste montuose viste da lontano.',

  'guide.roc.definition': 'Una curva ROC mostra quanto bene un test o un modello di previsione distingue due esiti, per esempio malato e sano.',
  'guide.roc.purpose': 'Serve a valutare un classificatore e a scegliere una soglia che bilanci i casi veri individuati con i falsi allarmi.',
  'guide.roc.appearance': 'Una curva sale dall\'angolo in basso a sinistra all\'angolo in alto a destra di un quadrato. Una linea diagonale rappresenta le risposte date a caso. Più la curva si piega verso l\'angolo in alto a sinistra, migliore è il modello.',

  'guide.rug.definition': 'Un grafico a tappeto segna ogni osservazione con un trattino corto lungo un asse.',
  'guide.rug.purpose': 'Serve a mostrare esattamente dove cadono i singoli valori e dove si addensano. Spesso accompagna un altro grafico.',
  'guide.rug.appearance': 'Lungo un bordo del grafico c\'è una fila di trattini corti, come la frangia di un tappeto. Ogni trattino è un valore, e le zone fitte sembrano setole spesse.',

  'guide.sankey.definition': 'Un diagramma di Sankey mostra come una quantità scorre da un gruppo di fasi al successivo.',
  'guide.sankey.purpose': 'Serve a ricostruire da dove vengono le cose e dove vanno, per esempio l\'energia dalle fonti agli usi, o il denaro all\'interno di un bilancio.',
  'guide.sankey.appearance': 'Dei blocchi, chiamati nodi, sono disposti in colonne da sinistra a destra. Delle fasce scorrono da un nodo all\'altro. La larghezza di ogni fascia mostra quanto scorre lungo quel percorso.',

  'guide.point.definition': 'Un grafico a dispersione mostra il legame tra due numeri, con un punto per ogni elemento.',
  'guide.point.purpose': 'Serve a capire se due misure sono collegate, come altezza e peso, e a trovare gruppi di punti e punti insoliti.',
  'guide.point.appearance': 'I punti sono sparsi su un\'area piatta. La posizione di un punto da sinistra a destra è un valore, e la posizione dal basso in alto è l\'altro. Se i punti formano una fascia che sale, i due valori tendono a crescere insieme.',

  'guide.smooth.definition': 'Un grafico a linee smussate mostra una curva che passa in mezzo ai dati per indicarne l\'andamento generale.',
  'guide.smooth.purpose': 'Serve a vedere la direzione complessiva di dati molto irregolari, senza distrarsi con ogni salita e discesa.',
  'guide.smooth.appearance': 'Una sola curva morbida va da sinistra a destra in mezzo ai dati. Non tocca tutti i punti. Spesso è disegnata sopra un grafico a dispersione, a volte con una fascia ombreggiata attorno.',

  'guide.sunflower.definition': 'Un grafico a girasole è un grafico a dispersione in cui i punti ripetuti nello stesso posto sono disegnati come un solo segno con dei petali.',
  'guide.sunflower.purpose': 'Si usa quando molte osservazioni hanno esattamente gli stessi valori, per non nascondere quante sono in ogni posto.',
  'guide.sunflower.appearance': 'Sembra un grafico a dispersione, ma da alcuni punti escono dei trattini corti, come i petali di un fiore. Il numero di petali è il numero di osservazioni in quel posto.',

  'guide.stacked_bar.definition': 'Un grafico a barre impilate mostra ogni categoria come una barra fatta di più parti, messe una sopra l\'altra.',
  'guide.stacked_bar.purpose': 'Serve a mostrare sia il totale di ogni categoria sia come è composto, per esempio le vendite totali divise per prodotto.',
  'guide.stacked_bar.appearance': 'Le barre stanno una accanto all\'altra. Ogni barra è divisa in segmenti colorati, uno sopra l\'altro. L\'altezza intera della barra è il totale, e ogni segmento è una parte.',

  'guide.stacked_area.definition': 'Un grafico ad aree impilate mostra diverse quantità nel tempo, ammucchiate una sopra l\'altra.',
  'guide.stacked_area.purpose': 'Serve a mostrare come cambia un totale nel tempo e quanto ogni parte contribuisce.',
  'guide.stacked_area.appearance': 'Fasce colorate sono sovrapposte dal basso verso l\'alto, ognuna appoggiata su quella sotto. Il bordo superiore della fascia più alta è il totale, e lo spessore di ogni fascia è la quantità di quella parte.',

  'guide.step.definition': 'Un grafico a gradini è un grafico a linee che procede a scalini piatti invece che con linee inclinate.',
  'guide.step.purpose': 'Serve per valori che restano uguali per un po\' e poi saltano, come prezzi, tassi di interesse o conteggi.',
  'guide.step.appearance': 'La linea corre piatta, poi sale o scende in verticale, poi torna piatta, come una scala vista di lato.',

  'guide.survival.definition': 'Una curva di sopravvivenza mostra, con il passare del tempo, la quota di un gruppo a cui un certo evento non è ancora successo.',
  'guide.survival.purpose': 'Si usa in medicina e in ingegneria per confrontare quanto durano persone o macchine, per esempio pazienti con due cure diverse.',
  'guide.survival.appearance': 'La linea parte in alto a sinistra dal 100 per cento e scende a gradini verso destra ogni volta che succede un evento. Una curva che resta alta più a lungo indica una sopravvivenza migliore. Piccoli trattini possono segnare le persone uscite dallo studio.',

  'guide.icicle.definition': 'Un grafico icicle mostra una gerarchia, come cartelle e file, a strati di rettangoli.',
  'guide.icicle.purpose': 'Serve a vedere come un totale si divide in parti, e quelle parti in parti più piccole.',
  'guide.icicle.appearance': 'Il totale è una barra lunga in cima. Sotto, è diviso nelle parti del livello successivo, e ognuna di queste è divisa ancora più sotto, come ghiaccioli appesi a una grondaia. I pezzi più larghi sono i più grandi.',

  'guide.sunburst.definition': 'Un grafico sunburst mostra una gerarchia come anelli attorno a un centro.',
  'guide.sunburst.purpose': 'Serve a vedere come un totale si divide in parti su più livelli, per esempio il bilancio di un\'azienda per reparto e per squadra.',
  'guide.sunburst.appearance': 'Il cerchio al centro è il totale. Ogni anello verso l\'esterno è il livello successivo, diviso in archi. Ogni arco sta subito fuori dal suo genitore, e gli archi più larghi sono le quote più grandi.',

  'guide.tree.definition': 'Un diagramma ad albero mostra una gerarchia come riquadri uniti da linee, da una radice ai suoi rami.',
  'guide.tree.purpose': 'Serve a mostrare una struttura, come un organigramma, un albero genealogico o una serie di decisioni.',
  'guide.tree.appearance': 'Un elemento sta in cima o a sinistra. Da lì partono delle linee verso i suoi figli, che a loro volta si ramificano verso i propri, come un albero capovolto.',

  'guide.pack.definition': 'Un grafico a cerchi annidati mostra una gerarchia come cerchi contenuti dentro altri cerchi.',
  'guide.pack.purpose': 'Serve a mostrare gruppi dentro altri gruppi e le loro dimensioni, per esempio i paesi dentro i continenti.',
  'guide.pack.appearance': 'Un grande cerchio contiene cerchi più piccoli, che possono contenerne altri ancora più piccoli, come bolle dentro bolle. La grandezza di ogni cerchio mostra il suo valore.',

  'guide.treemap.definition': 'Una treemap mostra una gerarchia come rettangoli annidati, in cui l\'area di ogni rettangolo corrisponde al suo valore.',
  'guide.treemap.purpose': 'Serve a vedere quali parti di un totale sono le più grandi, per esempio quali cartelle occupano più spazio sul disco.',
  'guide.treemap.appearance': 'Un grande rettangolo è coperto di rettangoli più piccoli, come una coperta patchwork. I valori più grandi hanno tessere più grandi, e le tessere dello stesso gruppo stanno vicine dentro una tessera più grande.',

  'guide.violin_box.definition': 'Un grafico a violino con box plot è il box plot disegnato dentro un grafico a violino. Riassume ogni gruppo con cinque valori.',
  'guide.violin_box.purpose': 'Serve a leggere il minimo, il primo quarto, il valore centrale, il terzo quarto e il massimo di ogni gruppo, insieme alla forma del violino.',
  'guide.violin_box.appearance': 'Dentro ogni violino c\'è una scatola stretta con un segno nel valore centrale. Due baffi sottili si allungano in alto e in basso fino al valore più basso e al più alto.',

  'guide.violin_kde.definition': 'Un grafico a violino mostra la forma dei dati di un gruppo con un contorno morbido e simmetrico.',
  'guide.violin_kde.purpose': 'Serve a confrontare la distribuzione di più gruppi, mostrando dove i valori sono frequenti e dove sono rari.',
  'guide.violin_kde.appearance': 'Ogni gruppo ha una forma larga dove ci sono molti valori e stretta dove ce ne sono pochi. La forma è uguale sui due lati di una linea centrale, e spesso ricorda un violino o un vaso.',

  'guide.volcano.definition': 'Un volcano plot mostra, per molti elementi insieme, quanto è grande un cambiamento e quanto è statisticamente significativo.',
  'guide.volcano.purpose': 'Si usa in biologia per individuare geni o proteine che cambiano in modo forte e affidabile tra due condizioni.',
  'guide.volcano.appearance': 'I punti formano la sagoma di un vulcano in eruzione. La posizione da sinistra a destra indica la grandezza e la direzione del cambiamento, e l\'altezza indica la significatività. Gli elementi interessanti sono negli angoli in alto a sinistra e in alto a destra.',

  'guide.waterfall.definition': 'Un grafico a cascata mostra come un valore iniziale cambia con una serie di aumenti e diminuzioni, fino ad arrivare a un valore finale.',
  'guide.waterfall.purpose': 'Serve a spiegare un totale passo dopo passo, per esempio come ricavi e costi portano all\'utile.',
  'guide.waterfall.appearance': 'La prima barra poggia sulla base. Ogni barra successiva è sospesa e parte da dove finisce la precedente. Sale per un aumento e scende per una diminuzione, come dei gradini. L\'ultima barra poggia di nuovo sulla base e mostra il totale finale.',

  'guide.word_cloud.definition': 'Una nuvola di parole mostra le parole di un testo. Le parole più frequenti o importanti sono scritte più grandi.',
  'guide.word_cloud.purpose': 'Serve a farsi un\'idea veloce dei temi principali di un testo, delle risposte a un sondaggio o dei post sui social.',
  'guide.word_cloud.appearance': 'Le parole sono ammassate in un gruppo, di grandezze diverse e a volte in direzioni diverse. Le parole più grandi sono le più comuni.',
} satisfies Partial<Record<MessageKey, string>>;
