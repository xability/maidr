import type { MessageKey } from '../index';

/** Italian renderings of the diagrams MAIDR names and explains. */
export const diagram = {
  'diagram.flowchart.name': 'Diagramma di flusso',
  'diagram.flowchart.definition': 'Un diagramma di flusso mostra i passi di un processo come forme collegate da frecce, nell\'ordine in cui avvengono.',
  'diagram.flowchart.purpose': 'Serve a mostrare come si svolge un processo dall\'inizio alla fine, come la gestione di un ordine, con le decisioni che lo indirizzano da una parte o dall\'altra e i passi a cui torna.',
  'diagram.flowchart.appearance': 'Ogni passo è un riquadro o un\'altra forma, come un rombo per una decisione. Le frecce vanno da un passo all\'altro, di solito dall\'alto in basso o da sinistra a destra, e una freccia può riportare la risposta che porta a seguirla, come sì o no. I passi correlati possono essere disegnati dentro un riquadro più grande chiamato sottografo.',

  'diagram.swimlane.name': 'Diagramma a corsie',
  'diagram.swimlane.definition': 'Un diagramma a corsie è un diagramma di flusso i cui passi sono divisi in corsie, una per ogni persona, gruppo o sistema che li svolge.',
  'diagram.swimlane.purpose': 'Serve a mostrare chi fa cosa in un processo e dove il lavoro passa dall\'uno all\'altro.',
  'diagram.swimlane.appearance': 'Lunghe fasce chiamate corsie stanno una accanto all\'altra, in orizzontale o in verticale sulla pagina, ciascuna con il nome di chi ne è responsabile. Ogni passo è un riquadro nella sua corsia, e le frecce vanno da un passo all\'altro, passando da una corsia a un\'altra a ogni passaggio di consegne.',

  'diagram.agent_flow.name': 'Flusso dell\'agente',
  'diagram.agent_flow.definition': 'Un flusso dell\'agente mostra i passi che un agente di IA compie per svolgere un compito, come gli input che legge, le attività che esegue, gli strumenti che chiama e le decisioni che prende, nell\'ordine in cui li compie.',
  'diagram.agent_flow.purpose': 'Serve a progettare o spiegare come un agente porta avanti un compito, come la revisione di una modifica al codice, e dove il suo percorso si divide a una decisione.',
  'diagram.agent_flow.appearance': 'Ogni passo è disegnato con una forma adatta al suo tipo, come un rombo per una decisione, dentro un riquadro che rappresenta il flusso a cui appartiene. Le frecce vanno da un passo all\'altro, e una freccia che esce da una decisione riporta la risposta che porta a seguirla.',

  'diagram.state.name': 'Diagramma degli stati',
  'diagram.state.definition': 'Un diagramma degli stati mostra gli stati in cui qualcosa può trovarsi e gli eventi che lo fanno passare da uno stato all\'altro.',
  'diagram.state.purpose': 'Serve a descrivere come si comporta un sistema, come un lettore multimediale che può essere inattivo, in riproduzione o in pausa, e cosa lo fa cambiare.',
  'diagram.state.appearance': 'Ogni stato è un riquadro con gli angoli arrotondati, e le frecce tra gli stati riportano l\'evento che causa il cambiamento. Un punto pieno indica dove inizia e un punto dentro un anello dove finisce, e uno stato può contenere stati più piccoli dentro il proprio riquadro.',

  'diagram.class.name': 'Diagramma delle classi',
  'diagram.class.definition': 'Un diagramma delle classi mostra le classi di un programma, cosa contiene e cosa fa ciascuna e come le classi sono collegate tra loro.',
  'diagram.class.purpose': 'Serve a progettare o documentare la struttura di un software, per esempio quali classi ereditano da altre e quali sono composte da altre.',
  'diagram.class.appearance': 'Ogni classe è un riquadro in tre parti: il nome in alto, gli attributi al centro e i metodi in basso. Delle linee collegano le classi correlate, e l\'estremità di una linea indica il tipo di relazione, come un triangolo vuoto dalla parte della classe da cui si eredita, o un rombo dalla parte della classe che contiene l\'altra.',

  'diagram.entity_relationship.name': 'Diagramma entità-relazione',
  'diagram.entity_relationship.definition': 'Un diagramma entità-relazione mostra i tipi di cose che un database registra, chiamati entità, e come sono collegati.',
  'diagram.entity_relationship.purpose': 'Serve a progettare o documentare un database, per esempio quanti ordini può effettuare ogni cliente e cosa contiene ogni ordine.',
  'diagram.entity_relationship.appearance': 'Ogni entità è un riquadro con il suo nome come intestazione, spesso con una tabella dei suoi attributi sotto. Delle linee collegano le entità correlate, etichettate con un verbo come «effettua», e i segni a ciascuna estremità di una linea indicano quante istanze di quell\'entità partecipano, come esattamente una, oppure zero o più.',

  'diagram.requirement.name': 'Diagramma dei requisiti',
  'diagram.requirement.definition': 'Un diagramma dei requisiti mostra ciò che un sistema deve fare, sotto forma di requisiti, e le parti del sistema che li soddisfano o li verificano.',
  'diagram.requirement.purpose': 'Serve nell\'ingegneria dei sistemi a collegare ogni requisito ai requisiti che contiene, agli elementi che lo soddisfano e al modo in cui viene verificato.',
  'diagram.requirement.appearance': 'Ogni requisito o elemento è un riquadro con il tipo e il nome come intestazione, che elenca dettagli come l\'id, il testo e il rischio. Le linee tra i riquadri riportano la relazione, come contains o satisfies.',

  'diagram.use_case.name': 'Diagramma dei casi d\'uso',
  'diagram.use_case.definition': 'Un diagramma dei casi d\'uso mostra le persone o gli altri sistemi che usano un sistema, chiamati attori, e ciò che possono farci, chiamato casi d\'uso.',
  'diagram.use_case.purpose': 'Serve a concordare che cosa un sistema deve offrire e a chi, per esempio cosa possono fare un cliente e un commesso in un negozio.',
  'diagram.use_case.appearance': 'Gli attori sono omini stilizzati fuori da un grande riquadro che rappresenta il sistema. I casi d\'uso sono ovali dentro il riquadro, e delle linee collegano ogni attore ai casi d\'uso a cui partecipa.',

  'diagram.c4.name': 'Diagramma C4',
  'diagram.c4_context.name': 'Diagramma di contesto C4',
  'diagram.c4_container.name': 'Diagramma dei container C4',
  'diagram.c4_component.name': 'Diagramma dei componenti C4',
  'diagram.c4_dynamic.name': 'Diagramma dinamico C4',
  'diagram.c4_deployment.name': 'Diagramma di deployment C4',
  'diagram.c4.definition': 'Un diagramma C4 mostra un sistema software a un certo livello di dettaglio, per esempio il sistema tra le persone e i sistemi che lo circondano, oppure i container o i componenti al suo interno, e come le sue parti si usano a vicenda.',
  'diagram.c4.purpose': 'Serve a spiegare un\'architettura software, per esempio con quali persone e altri sistemi lavora un sistema bancario, al livello di dettaglio che serve ai suoi lettori.',
  'diagram.c4.appearance': 'Ogni persona, sistema, container o componente è un riquadro con il nome, il tipo e una breve descrizione; una persona ha una testa rotonda sopra il riquadro, e un database è un cilindro. Dei confini tratteggiati raggruppano le parti correlate, e le frecce tra di esse riportano cosa fa l\'una con l\'altra e la tecnologia che usa.',

  'diagram.block.name': 'Diagramma a blocchi',
  'diagram.block.definition': 'Un diagramma a blocchi mostra le parti di un sistema come blocchi disposti in righe e colonne, con frecce che indicano come sono collegati.',
  'diagram.block.purpose': 'Serve a dare una panoramica semplice di un sistema e di dove i dati o il controllo passano da una parte all\'altra, per esempio da un client a un server e al suo archivio.',
  'diagram.block.appearance': 'I blocchi sono riquadri disposti in una griglia di colonne, e un blocco più grande può contenerne di più piccoli. Le frecce collegano i blocchi, e un blocco può essere disegnato esso stesso come una freccia che punta nella direzione in cui qualcosa si muove.',

  'diagram.architecture.name': 'Diagramma dell\'architettura',
  'diagram.architecture.definition': 'Un diagramma dell\'architettura mostra i servizi di cui è fatto un sistema, come server, database e archivi, e i collegamenti tra di essi.',
  'diagram.architecture.purpose': 'Serve a mostrare come è costruito un sistema, spesso nel cloud, e quali dei suoi servizi comunicano con quali.',
  'diagram.architecture.appearance': 'Ogni servizio è un\'icona con il nome sotto, e i servizi correlati stanno insieme dentro un riquadro tratteggiato per il loro gruppo. Delle linee collegano i servizi connessi, con una punta di freccia dove un collegamento va in un solo verso.',

  'diagram.git_graph.name': 'Grafo Git',
  'diagram.git_graph.definition': 'Un grafo Git mostra la storia di un repository di codice: i suoi commit in ordine, il branch su cui è stato fatto ciascuno e i punti in cui i branch si separano e vengono di nuovo uniti.',
  'diagram.git_graph.purpose': 'Serve a spiegare un flusso di lavoro con i branch, per esempio sviluppare una funzionalità su un branch a parte e poi unirla a quello principale.',
  'diagram.git_graph.appearance': 'Ogni branch è una linea che attraversa la pagina, uno sopra l\'altro, con il nome all\'inizio. I commit sono punti lungo le linee nell\'ordine in cui sono stati fatti; una linea si curva verso l\'esterno dove inizia un branch e rientra dove viene unito, e un tag è un\'etichetta sopra il suo commit.',

  'diagram.event_model.name': 'Modello degli eventi',
  'diagram.event_model.definition': 'Un modello degli eventi mostra come le informazioni attraversano un sistema nel tempo: ciò che vede un utente, i comandi che dà, gli eventi che quei comandi registrano e le viste che se ne rileggono.',
  'diagram.event_model.purpose': 'Serve a progettare un sistema attorno agli eventi che registra, come un articolo aggiunto a un carrello, seguendo ogni passo dalla schermata al comando e dal comando all\'evento.',
  'diagram.event_model.appearance': 'I riquadri si trovano in corsie che attraversano la pagina: una per le schermate e le automazioni, una per i comandi e i modelli di lettura e una per ogni flusso di eventi. Il tempo scorre da sinistra a destra, e le frecce vanno da ogni riquadro al passo successivo.',

  'diagram.mindmap.name': 'Mappa mentale',
  'diagram.mindmap.definition': 'Una mappa mentale mostra idee che si diramano da un unico argomento centrale, e ogni ramo raccoglie idee collegate.',
  'diagram.mindmap.purpose': 'Serve a raccogliere idee, prendere appunti o organizzare un argomento, per esempio i modi per rendere accessibile un grafico.',
  'diagram.mindmap.appearance': 'L\'argomento centrale sta nel mezzo, spesso dentro un cerchio. Da esso partono rami in tutte le direzioni, ciascuno terminante in un sottoargomento, e rami più piccoli vanno da ogni sottoargomento alle idee che ne dipendono.',

  'diagram.kanban.name': 'Bacheca kanban',
  'diagram.kanban.definition': 'Una bacheca kanban mostra il lavoro come schede suddivise in colonne, una colonna per ogni fase del lavoro.',
  'diagram.kanban.purpose': 'Serve a seguire l\'avanzamento delle attività, per esempio quali sono ancora da fare, quali in corso e quali completate.',
  'diagram.kanban.appearance': 'Le colonne stanno una accanto all\'altra, ciascuna con la sua fase come intestazione, e in ognuna le schede sono impilate verso il basso. Una scheda mostra la sua attività e può mostrare un numero di ticket, la persona a cui è assegnata e un segno della sua priorità.',

  'diagram.tree_view.name': 'Vista ad albero',
  'diagram.tree_view.definition': 'Una vista ad albero mostra una gerarchia come un elenco rientrato, per esempio le cartelle e i file di un progetto.',
  'diagram.tree_view.purpose': 'Serve a mostrare come gli elementi sono annidati, per esempio quali file si trovano in quali cartelle.',
  'diagram.tree_view.appearance': 'L\'elemento in cima è sulla prima riga, e gli elementi contenuti in ciascuno sono elencati sotto di esso, ciascuno rientrato di un livello in più. Brevi linee collegano ogni elemento a quello in cui si trova.',

  'diagram.ishikawa.name': 'Diagramma di Ishikawa',
  'diagram.ishikawa.definition': 'Un diagramma di Ishikawa, detto anche diagramma a lisca di pesce, mostra le possibili cause di un problema raggruppate in categorie.',
  'diagram.ishikawa.purpose': 'Serve a cercare la causa principale di un problema, come una foto sfocata, elencando ogni causa probabile sotto intestazioni come attrezzatura o processo.',
  'diagram.ishikawa.appearance': 'Il problema è scritto alla testa di uno scheletro di pesce, a un\'estremità di una lunga spina dorsale. Dalla spina partono lische oblique, ciascuna terminante in una categoria; da ogni lisca si diramano le cause, e da queste cause più piccole.',

  'diagram.timeline.name': 'Linea del tempo',
  'diagram.timeline.definition': 'Una linea del tempo mostra eventi lungo un asse temporale, raggruppati per il periodo a cui appartengono.',
  'diagram.timeline.purpose': 'Serve a raccontare a colpo d\'occhio la storia di qualcosa, per esempio le tappe degli standard di accessibilità del web.',
  'diagram.timeline.appearance': 'I periodi, come gli anni, sono riquadri in fila da sinistra a destra sopra una linea con una freccia che rappresenta il tempo, e possono essere raggruppati sotto intestazioni di sezione poste sopra. Gli eventi di ogni periodo sono riquadri impilati sotto di esso.',

  'diagram.railroad.name': 'Diagramma sintattico',
  'diagram.railroad.definition': 'Un diagramma sintattico, detto anche diagramma a binari, mostra le regole di una grammatica come binari da seguire dall\'inizio alla fine.',
  'diagram.railroad.purpose': 'Serve a documentare ciò che un linguaggio accetta, per esempio come si può scrivere un numero con segno.',
  'diagram.railroad.appearance': 'Ogni regola è un binario che va da un punto a sinistra a un punto a destra, passando per riquadri che rappresentano le parole, i simboli e le altre regole di cui è fatta. Dove il binario si divide si può prendere un ramo qualsiasi; un anello all\'indietro significa che una parte può ripetersi, e un percorso che aggira una parte significa che la si può omettere.',

  'diagram.cynefin.name': 'Framework Cynefin',
  'diagram.cynefin.definition': 'Il framework Cynefin divide le situazioni in cinque domini secondo quanto chiaramente si vedono causa ed effetto: chiaro (clear), complicato (complicated), complesso (complex) e caotico (chaotic), più la confusione (confusion) finché non si sa ancora quale di questi valga.',
  'diagram.cynefin.purpose': 'Serve a decidere come rispondere a una situazione, come un incidente, collocandola in un dominio e adottando l\'approccio che quel dominio richiede.',
  'diagram.cynefin.appearance': 'Quattro domini occupano i quarti di un quadrato: complesso in alto a sinistra, complicato in alto a destra, caotico in basso a sinistra e chiaro in basso a destra, con la confusione in un ovale al centro. Ogni dominio indica il suo approccio sotto il titolo, gli elementi collocati in esso sono riquadri e le frecce tra i domini segnano le transizioni.',

  'diagram.quadrant.name': 'Grafico a quadranti',
  'diagram.quadrant.definition': 'Un grafico a quadranti colloca degli elementi su due scale e divide l\'area in quattro quarti, ciascuno con un proprio significato.',
  'diagram.quadrant.purpose': 'Serve a classificare gli elementi o a dar loro una priorità, per esempio le campagne in base a copertura e coinvolgimento, secondo il quarto in cui cade ciascuno.',
  'diagram.quadrant.appearance': 'Un quadrato è diviso in quattro quadranti, ciascuno etichettato con il suo significato; una scala va da sinistra a destra e l\'altra dal basso in alto. Ogni elemento è un punto collocato secondo i suoi due valori ed etichettato con il suo nome.',

  'diagram.user_journey.name': 'Percorso dell\'utente',
  'diagram.user_journey.definition': 'Un percorso dell\'utente mostra le attività che una persona svolge per raggiungere un obiettivo e quanto è soddisfatta in ciascuna.',
  'diagram.user_journey.purpose': 'Serve a trovare i momenti buoni e cattivi di un\'esperienza, come una giornata di lavoro, per poter migliorare quelli cattivi.',
  'diagram.user_journey.appearance': 'Le attività sono riquadri in fila da sinistra a destra, raggruppati sotto intestazioni di sezione, con un piccolo punto su ogni attività per ciascuna persona che vi partecipa. Sotto c\'è un volto per ogni attività, disegnato più in alto e sorridente per un buon punteggio e più in basso e accigliato per uno cattivo.',

  'diagram.packet.name': 'Diagramma del pacchetto di rete',
  'diagram.packet.definition': 'Un diagramma del pacchetto di rete mostra la struttura di un pacchetto di rete o di un altro blocco di dati, come campi di bit in ordine.',
  'diagram.packet.purpose': 'Serve a documentare un formato di dati o un protocollo, per esempio quali bit di un\'intestazione UDP contengono le porte, la lunghezza e il checksum.',
  'diagram.packet.appearance': 'I bit sono numerati da sinistra a destra in righe di lunghezza fissa, di solito 32. Ogni campo è un riquadro largo quanto i bit che occupa, etichettato con il suo nome, con il primo e l\'ultimo bit numerati sopra.',

  'diagram.wardley_map.name': 'Mappa di Wardley',
  'diagram.wardley_map.definition': 'Una mappa di Wardley colloca i componenti che soddisfano un bisogno dell\'utente su due scale: quanto ciascuno è visibile per l\'utente e quanto è evoluto, da nuovo e incerto a standard e affidabile.',
  'diagram.wardley_map.purpose': 'Serve a pianificare una strategia, per esempio cosa costruire e cosa acquistare, vedendo come i componenti dipendono l\'uno dall\'altro e come cambieranno.',
  'diagram.wardley_map.appearance': 'La visibilità va dal basso in alto e l\'evoluzione da sinistra a destra, attraverso le fasi genesi (genesis), su misura (custom built), prodotto (product) e commodity. Ogni componente è un punto con il suo nome, delle linee collegano ogni componente a quelli da cui dipende, e una freccia indica dove si sta dirigendo un componente in evoluzione.',
} satisfies Partial<Record<MessageKey, string>>;
