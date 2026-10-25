import type { MessageKey } from '../index';

/** German renderings of the diagrams MAIDR names and explains. */
export const diagram = {
  'diagram.flowchart.name': 'Flussdiagramm',
  'diagram.flowchart.definition': 'Ein Flussdiagramm zeigt die Schritte eines Ablaufs als Formen, die durch Pfeile verbunden sind, in der Reihenfolge, in der sie geschehen.',
  'diagram.flowchart.purpose': 'Es zeigt, wie ein Ablauf von Anfang bis Ende verläuft, etwa die Bearbeitung einer Bestellung, mit den Entscheidungen, die ihn in die eine oder andere Richtung lenken, und den Schritten, zu denen er zurückkehrt.',
  'diagram.flowchart.appearance': 'Jeder Schritt ist ein Kasten oder eine andere Form, etwa eine Raute für eine Entscheidung. Pfeile führen von Schritt zu Schritt, meist von oben nach unten oder von links nach rechts, und ein Pfeil kann mit der Antwort beschriftet sein, die auf ihn führt, etwa ja oder nein. Zusammengehörige Schritte können in einem größeren Kasten stehen, einem Subgraphen.',

  'diagram.swimlane.name': 'Swimlane-Diagramm',
  'diagram.swimlane.definition': 'Ein Swimlane-Diagramm ist ein Flussdiagramm, dessen Schritte auf Bahnen verteilt sind, eine für jede Person, jedes Team oder jedes System, das sie ausführt.',
  'diagram.swimlane.purpose': 'Es zeigt, wer in einem Ablauf was tut und wo die Arbeit von einem an den anderen übergeben wird.',
  'diagram.swimlane.appearance': 'Lange Streifen, die Bahnen, liegen nebeneinander, quer oder längs über die Seite, jede mit dem Namen dessen beschriftet, dem sie gehört. Jeder Schritt ist ein Kasten in seiner Bahn, und Pfeile führen von Schritt zu Schritt und wechseln bei jeder Übergabe von einer Bahn in eine andere.',

  'diagram.agent_flow.name': 'Agentenablauf',
  'diagram.agent_flow.definition': 'Ein Agentenablauf zeigt die Schritte, die ein KI-Agent für eine Aufgabe geht, etwa die Eingaben, die er liest, die Aufgaben, die er erledigt, die Werkzeuge, die er aufruft, und die Entscheidungen, die er trifft, in der Reihenfolge, in der er sie geht.',
  'diagram.agent_flow.purpose': 'Damit entwirft oder erklärt man, wie ein Agent eine Aufgabe abarbeitet, etwa die Prüfung einer Codeänderung, und wo sich sein Weg an einer Entscheidung teilt.',
  'diagram.agent_flow.appearance': 'Jeder Schritt hat eine Form nach seiner Art, etwa eine Raute für eine Entscheidung, und steht in einem Kasten für den Ablauf, zu dem er gehört. Pfeile führen von Schritt zu Schritt, und ein Pfeil, der eine Entscheidung verlässt, ist mit der Antwort beschriftet, die auf ihn führt.',

  'diagram.state.name': 'Zustandsdiagramm',
  'diagram.state.definition': 'Ein Zustandsdiagramm zeigt die Zustände, in denen etwas sein kann, und die Ereignisse, die es von einem Zustand in einen anderen bringen.',
  'diagram.state.purpose': 'Es beschreibt, wie sich ein System verhält, etwa ein Mediaplayer, der im Leerlauf, in Wiedergabe oder pausiert sein kann, und was ihn wechseln lässt.',
  'diagram.state.appearance': 'Jeder Zustand ist ein Kasten mit abgerundeten Ecken, und Pfeile zwischen Zuständen sind mit dem Ereignis beschriftet, das den Wechsel auslöst. Ein gefüllter Punkt markiert den Anfang und ein Punkt in einem Ring das Ende, und ein Zustand kann kleinere Zustände in seinem eigenen Kasten enthalten.',

  'diagram.class.name': 'Klassendiagramm',
  'diagram.class.definition': 'Ein Klassendiagramm zeigt die Klassen eines Programms, was jede enthält und tut und wie die Klassen zueinander stehen.',
  'diagram.class.purpose': 'Damit entwirft oder dokumentiert man den Aufbau einer Software, etwa welche Klassen von anderen erben und welche aus anderen bestehen.',
  'diagram.class.appearance': 'Jede Klasse ist ein dreigeteilter Kasten: oben ihr Name, in der Mitte ihre Attribute, unten ihre Methoden. Linien verbinden zusammengehörige Klassen, und das Ende einer Linie zeigt die Art der Beziehung, etwa ein hohles Dreieck an der Klasse, von der geerbt wird, oder eine Raute an der Klasse, die die andere enthält.',

  'diagram.entity_relationship.name': 'Entity-Relationship-Diagramm',
  'diagram.entity_relationship.definition': 'Ein Entity-Relationship-Diagramm zeigt die Arten von Dingen, die eine Datenbank erfasst, die Entitäten, und wie sie zusammenhängen.',
  'diagram.entity_relationship.purpose': 'Damit entwirft oder dokumentiert man eine Datenbank, etwa wie viele Bestellungen ein Kunde aufgeben kann und was eine Bestellung enthält.',
  'diagram.entity_relationship.appearance': 'Jede Entität ist ein Kasten mit ihrem Namen als Überschrift, oft mit einer Tabelle ihrer Attribute darunter. Linien verbinden zusammengehörige Entitäten und sind mit einem Verb beschriftet, etwa „tätigt“, und die Zeichen an beiden Enden einer Linie zeigen, wie viele Instanzen dieser Entität beteiligt sind, etwa genau eine oder null oder mehr.',

  'diagram.requirement.name': 'Anforderungsdiagramm',
  'diagram.requirement.definition': 'Ein Anforderungsdiagramm zeigt, was ein System leisten muss, als Anforderungen, und die Teile des Systems, die sie erfüllen oder prüfen.',
  'diagram.requirement.purpose': 'Im Systems Engineering verfolgt man damit jede Anforderung zu den Anforderungen, die sie enthält, zu den Elementen, die sie erfüllen, und dazu, wie sie verifiziert wird.',
  'diagram.requirement.appearance': 'Jede Anforderung und jedes Element ist ein Kasten mit Art und Namen als Überschrift, der Angaben wie ID, Text und Risiko auflistet. Linien zwischen den Kästen sind mit der Beziehung beschriftet, etwa contains oder satisfies.',

  'diagram.use_case.name': 'Anwendungsfalldiagramm',
  'diagram.use_case.definition': 'Ein Anwendungsfalldiagramm zeigt die Personen oder anderen Systeme, die ein System nutzen, die Akteure, und was sie damit tun können, die Anwendungsfälle.',
  'diagram.use_case.purpose': 'Damit legt man gemeinsam fest, was ein System wem bieten soll, etwa was ein Kunde und ein Verkäufer in einem Laden jeweils tun können.',
  'diagram.use_case.appearance': 'Akteure sind Strichmännchen außerhalb eines großen Kastens, der für das System steht. Anwendungsfälle sind Ovale im Kasten, und Linien verbinden jeden Akteur mit den Anwendungsfällen, an denen er beteiligt ist.',

  'diagram.c4.name': 'C4-Diagramm',
  'diagram.c4_context.name': 'C4-Kontextdiagramm',
  'diagram.c4_container.name': 'C4-Containerdiagramm',
  'diagram.c4_component.name': 'C4-Komponentendiagramm',
  'diagram.c4_dynamic.name': 'Dynamisches C4-Diagramm',
  'diagram.c4_deployment.name': 'C4-Verteilungsdiagramm',
  'diagram.c4.definition': 'Ein C4-Diagramm zeigt ein Softwaresystem auf einer Detailebene, etwa das System inmitten der Menschen und Systeme um es herum oder die Container oder Komponenten in ihm, und wie seine Teile einander nutzen.',
  'diagram.c4.purpose': 'Damit erklärt man eine Softwarearchitektur, etwa mit welchen Menschen und anderen Systemen ein Bankensystem arbeitet, in der Detailtiefe, die seine Leser brauchen.',
  'diagram.c4.appearance': 'Jede Person, jedes System, jeder Container und jede Komponente ist ein Kasten mit Namen, Art und kurzer Beschreibung; eine Person hat einen runden Kopf über dem Kasten, und eine Datenbank ist ein Zylinder. Gestrichelte Grenzen fassen zusammengehörige Teile zusammen, und Pfeile zwischen ihnen sind damit beschriftet, was der eine mit dem anderen tut und welche Technik er nutzt.',

  'diagram.block.name': 'Blockdiagramm',
  'diagram.block.definition': 'Ein Blockdiagramm zeigt die Teile eines Systems als Blöcke in Zeilen und Spalten, mit Pfeilen dafür, wie sie verbunden sind.',
  'diagram.block.purpose': 'Es gibt einen einfachen Überblick über ein System und darüber, wo Daten oder Steuerung von einem Teil zum anderen gehen, etwa von einem Client zu einem Server und seinem Speicher.',
  'diagram.block.appearance': 'Blöcke sind Kästen in einem Raster aus Spalten, und ein größerer Block kann kleinere enthalten. Pfeile verbinden die Blöcke, und ein Block kann selbst als Pfeil gezeichnet sein, der in die Richtung zeigt, in die sich etwas bewegt.',

  'diagram.architecture.name': 'Architekturdiagramm',
  'diagram.architecture.definition': 'Ein Architekturdiagramm zeigt die Dienste, aus denen ein System besteht, etwa Server, Datenbanken und Speicher, und die Verbindungen zwischen ihnen.',
  'diagram.architecture.purpose': 'Es zeigt, wie ein System aufgebaut ist, oft in der Cloud, und welche seiner Dienste mit welchen kommunizieren.',
  'diagram.architecture.appearance': 'Jeder Dienst ist ein Symbol mit seinem Namen darunter, und zusammengehörige Dienste stehen gemeinsam in einem gestrichelten Kasten für ihre Gruppe. Verbundene Dienste sind durch Linien verknüpft, mit einer Pfeilspitze, wo eine Verbindung nur in eine Richtung läuft.',

  'diagram.git_graph.name': 'Git-Graph',
  'diagram.git_graph.definition': 'Ein Git-Graph zeigt die Geschichte eines Code-Repositorys: seine Commits der Reihe nach, den Branch, auf dem jeder entstand, und wo Branches abzweigen und wieder zusammengeführt werden.',
  'diagram.git_graph.purpose': 'Damit erklärt man einen Arbeitsablauf mit Branches, etwa eine Funktion auf einem eigenen Branch zu entwickeln und in den Hauptbranch zusammenzuführen.',
  'diagram.git_graph.appearance': 'Jeder Branch ist eine Linie quer über die Seite, einer über dem anderen, mit seinem Namen am Anfang. Commits sind Punkte entlang der Linien in der Reihenfolge ihrer Entstehung; eine Linie biegt dort ab, wo ein Branch beginnt, und kehrt dort zurück, wo er zusammengeführt wird, und ein Tag ist eine Beschriftung über seinem Commit.',

  'diagram.event_model.name': 'Ereignismodell',
  'diagram.event_model.definition': 'Ein Ereignismodell zeigt, wie Informationen im Lauf der Zeit durch ein System fließen: was ein Nutzer sieht, die Befehle, die er gibt, die Ereignisse, die diese Befehle festhalten, und die Ansichten, die daraus gelesen werden.',
  'diagram.event_model.purpose': 'Damit entwirft man ein System rund um die Ereignisse, die es festhält, etwa einen Artikel, der in einen Warenkorb gelegt wird, und folgt jedem Schritt vom Bildschirm zum Befehl und vom Befehl zum Ereignis.',
  'diagram.event_model.appearance': 'Kästen liegen in Bahnen quer über die Seite: eine für Bildschirme und Automatisierungen, eine für Befehle und Lesemodelle und eine für jeden Ereignisstrom. Die Zeit läuft von links nach rechts, und Pfeile führen von jedem Kasten zum nächsten Schritt.',

  'diagram.mindmap.name': 'Mindmap',
  'diagram.mindmap.definition': 'Eine Mindmap zeigt Ideen, die von einem zentralen Thema ausgehen, wobei jeder Zweig zusammengehörige Ideen trägt.',
  'diagram.mindmap.purpose': 'Damit sammelt man Ideen, macht Notizen oder ordnet ein Thema, etwa die Wege, ein Diagramm barrierefrei zu machen.',
  'diagram.mindmap.appearance': 'Das zentrale Thema steht in der Mitte, oft in einem Kreis. Zweige gehen von ihm in alle Richtungen aus, jeder endet in einem Unterthema, und kleinere Zweige führen von jedem Unterthema zu den Ideen darunter.',

  'diagram.kanban.name': 'Kanban-Board',
  'diagram.kanban.definition': 'Ein Kanban-Board zeigt Arbeit als Karten, die auf Spalten verteilt sind, eine Spalte für jede Phase der Arbeit.',
  'diagram.kanban.purpose': 'Damit verfolgt man den Fortschritt von Aufgaben, etwa welche noch offen sind, welche in Arbeit und welche erledigt.',
  'diagram.kanban.appearance': 'Spalten stehen nebeneinander, jede mit ihrer Phase als Überschrift, und in jeder sind Karten nach unten gestapelt. Eine Karte zeigt ihre Aufgabe und kann eine Ticketnummer, die zuständige Person und ein Zeichen für ihre Priorität zeigen.',

  'diagram.tree_view.name': 'Baumansicht',
  'diagram.tree_view.definition': 'Eine Baumansicht zeigt eine Hierarchie als eingerückte Liste, etwa die Ordner und Dateien eines Projekts.',
  'diagram.tree_view.purpose': 'Sie zeigt, wie Elemente ineinander verschachtelt sind, etwa welche Dateien in welchen Ordnern liegen.',
  'diagram.tree_view.appearance': 'Das oberste Element steht in der ersten Zeile, und die Elemente in jedem stehen darunter, jeweils eine Stufe weiter eingerückt. Kurze Linien verbinden jedes Element mit dem, in dem es liegt.',

  'diagram.ishikawa.name': 'Ishikawa-Diagramm',
  'diagram.ishikawa.definition': 'Ein Ishikawa-Diagramm, auch Fischgrätendiagramm genannt, zeigt die möglichen Ursachen eines Problems, nach Kategorien geordnet.',
  'diagram.ishikawa.purpose': 'Damit sucht man die eigentliche Ursache eines Problems, etwa eines unscharfen Fotos, indem man jede wahrscheinliche Ursache unter Überschriften wie Ausrüstung oder Ablauf auflistet.',
  'diagram.ishikawa.appearance': 'Das Problem steht am Kopf eines Fischskeletts, an einem Ende einer langen Hauptgräte. Gräten zweigen schräg von ihr ab und enden je in einer Kategorie; Ursachen zweigen von jeder Gräte ab, und kleinere Ursachen wiederum von diesen.',

  'diagram.timeline.name': 'Zeitleiste',
  'diagram.timeline.definition': 'Eine Zeitleiste zeigt Ereignisse entlang der Zeit, geordnet nach dem Zeitraum, zu dem sie gehören.',
  'diagram.timeline.purpose': 'Damit erzählt man die Geschichte von etwas auf einen Blick, etwa die Meilensteine der Standards für Barrierefreiheit im Web.',
  'diagram.timeline.appearance': 'Zeiträume wie Jahre sind Kästen in einer Reihe von links nach rechts über einer Linie mit einem Pfeil für die Zeit und können unter Abschnittsüberschriften darüber gruppiert sein. Die Ereignisse jedes Zeitraums sind Kästen, die unter ihm gestapelt sind.',

  'diagram.railroad.name': 'Syntaxdiagramm',
  'diagram.railroad.definition': 'Ein Syntaxdiagramm, auch Eisenbahndiagramm genannt, zeigt die Regeln einer Grammatik als Gleise, denen man vom Anfang bis zum Ende folgt.',
  'diagram.railroad.purpose': 'Damit dokumentiert man, was eine Sprache zulässt, etwa wie eine Zahl mit Vorzeichen geschrieben werden darf.',
  'diagram.railroad.appearance': 'Jede Regel ist ein Gleis von einem Punkt links zu einem Punkt rechts, das an Kästen für die Wörter, Symbole und anderen Regeln vorbeiführt, aus denen sie besteht. Wo sich das Gleis teilt, kann man einen beliebigen Zweig nehmen; eine Schleife zurück bedeutet, dass sich ein Teil wiederholen kann, und ein Weg um einen Teil herum, dass er weggelassen werden kann.',

  'diagram.cynefin.name': 'Cynefin-Framework',
  'diagram.cynefin.definition': 'Das Cynefin-Framework ordnet Situationen fünf Domänen zu, je nachdem, wie klar Ursache und Wirkung zu erkennen sind: klar (clear), kompliziert (complicated), komplex (complex) und chaotisch (chaotic) sowie Verwirrung (confusion), solange noch nicht bekannt ist, welche davon zutrifft.',
  'diagram.cynefin.purpose': 'Damit entscheidet man, wie man auf eine Situation reagiert, etwa auf einen Störfall, indem man sie einer Domäne zuordnet und das Vorgehen wählt, das diese Domäne verlangt.',
  'diagram.cynefin.appearance': 'Vier Domänen füllen die Viertel eines Quadrats: komplex oben links, kompliziert oben rechts, chaotisch unten links und klar unten rechts, mit Verwirrung in einem Oval in der Mitte. Jede Domäne nennt unter ihrem Titel ihr Vorgehen, die ihr zugeordneten Elemente sind Kästen, und Pfeile zwischen Domänen markieren Übergänge.',

  'diagram.quadrant.name': 'Quadrantendiagramm',
  'diagram.quadrant.definition': 'Ein Quadrantendiagramm ordnet Elemente auf zwei Skalen an und teilt die Fläche in vier Viertel mit je eigener Bedeutung.',
  'diagram.quadrant.purpose': 'Damit sortiert oder priorisiert man Elemente, etwa Kampagnen nach Reichweite und Interaktion, nach dem Viertel, in das jedes fällt.',
  'diagram.quadrant.appearance': 'Ein Quadrat ist in vier Quadranten geteilt, jeder mit seiner Bedeutung beschriftet; eine Skala läuft von links nach rechts, die andere von unten nach oben. Jedes Element ist ein Punkt, der nach seinen beiden Werten platziert und mit seinem Namen beschriftet ist.',

  'diagram.user_journey.name': 'User Journey',
  'diagram.user_journey.definition': 'Eine User Journey zeigt die Aufgaben, die eine Person auf dem Weg zu einem Ziel durchläuft, und wie zufrieden sie bei jeder ist.',
  'diagram.user_journey.purpose': 'Damit findet man die guten und schlechten Momente eines Erlebnisses, etwa eines Arbeitstags, um die schlechten zu verbessern.',
  'diagram.user_journey.appearance': 'Aufgaben sind Kästen in einer Reihe von links nach rechts, unter Abschnittsüberschriften gruppiert, mit einem kleinen Punkt auf jeder Aufgabe für jede beteiligte Person. Darunter ist für jede Aufgabe ein Gesicht, höher und lächelnd bei einer guten Bewertung, tiefer und mit gerunzelter Stirn bei einer schlechten.',

  'diagram.packet.name': 'Netzwerkpaketdiagramm',
  'diagram.packet.definition': 'Ein Netzwerkpaketdiagramm zeigt den Aufbau eines Netzwerkpakets oder eines anderen Datenblocks als Bitfelder der Reihe nach.',
  'diagram.packet.purpose': 'Damit dokumentiert man ein Datenformat oder Protokoll, etwa welche Bits eines UDP-Headers die Ports, die Länge und die Prüfsumme enthalten.',
  'diagram.packet.appearance': 'Bits sind von links nach rechts in Zeilen fester Länge nummeriert, meist 32. Jedes Feld ist ein Kasten, so breit wie die Bits, die es belegt, mit seinem Namen beschriftet und mit seinem ersten und letzten Bit darüber nummeriert.',

  'diagram.wardley_map.name': 'Wardley-Map',
  'diagram.wardley_map.definition': 'Eine Wardley-Map ordnet die Komponenten, die das Bedürfnis eines Nutzers erfüllen, auf zwei Skalen an: wie sichtbar jede für den Nutzer ist und wie weit sie entwickelt ist, von neu und unsicher bis standardisiert und verlässlich.',
  'diagram.wardley_map.purpose': 'Damit plant man Strategie, etwa was man selbst baut und was man kauft, indem man sieht, wie die Komponenten voneinander abhängen und wie sie sich verändern werden.',
  'diagram.wardley_map.appearance': 'Die Sichtbarkeit läuft von unten nach oben und die Entwicklung von links nach rechts, durch die Stufen Genesis (genesis), Maßanfertigung (custom built), Produkt (product) und Massenware (commodity). Jede Komponente ist ein Punkt mit ihrem Namen, Linien verbinden jede Komponente mit denen, von denen sie abhängt, und ein Pfeil zeigt, wohin sich eine Komponente entwickelt.',
} satisfies Partial<Record<MessageKey, string>>;
