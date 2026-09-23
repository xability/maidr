import type { MessageKey } from '../index';

export const description = {
  'description.statOrientation': 'Ausrichtung',
  'description.statSubtitle': 'Untertitel',
  'description.statCaption': 'Bildunterschrift',
  'description.statCurrentlyOn': 'Aktuell bei',
  'description.statChartTypes': 'Diagrammtypen',
  'description.multiPanelFigure': 'Mehrteilige Abbildung',
  'description.valueInfinity': 'unendlich',
  'description.valueNegativeInfinity': 'minus unendlich',
  'description.subplotPosition': 'Teildiagramm {index} von {total}',
  'description.chartTypeCount': '{kind} ({count})',

  'description.title': 'Diagrammbeschreibung',
  'description.close': 'Schließen',
  'description.chartTypePrefix': 'Diagrammtyp: ',
  'description.titleLabel': 'Titel',
  'description.titleLabelSubplot': 'Titel des Teildiagramms',
  'description.titleLabelFigure': 'Titel der Abbildung',
  'description.axesHeading': 'Achsen',
  'description.axisEntry': '{axis}-Achse: {label}',
  'description.summaryHeading': 'Zusammenfassung',
  'description.subplotsHeading': 'Teildiagramme ({count})',
  'description.subplotUnknown': 'unbekannt',
  'description.subplotCurrent': ' (aktuell)',

  'description.layersHeading': 'Ebenen ({count})',
  'description.showingLayer': 'Ebene {index} von {total} wird angezeigt',
  'description.layerHint': 'Verwenden Sie die Pfeiltasten links und rechts, um zwischen den Ebenen zu wechseln, und die Leertaste, um eine Ebene zu öffnen.',
  'description.layerUpdated': 'Beschreibung aktualisiert für Ebene {index} von {total}',

  'description.rowOne': 'Zeile',
  'description.rowMany': 'Zeilen',
  'description.tableCaption': 'Daten: {total} {rows}',
  'description.tableCaptionTruncated': 'Daten: {shown} von {total} {rows} werden angezeigt',
  'description.tableShowMore': '{count} weitere von {total} {rows} anzeigen',
  'description.tableColumn': 'Spalte {index}',

  // Chart type guide.
  'guide.toggle': 'Über diesen Diagrammtyp ({chartType})',
  'guide.definitionHeading': 'Was es ist',
  'guide.purposeHeading': 'Wofür man es nutzt',
  'guide.appearanceHeading': 'Wie es aussieht',

  // Multi-panel figure (the lobby, before a subplot is entered).
  'guide.figure.definition': 'Eine mehrteilige Abbildung besteht aus mehreren kleinen Diagrammen. Sie stehen nebeneinander oder in einem Raster und haben einen gemeinsamen Titel.',
  'guide.figure.purpose': 'Damit vergleicht man verwandte Ansichten von Daten auf einen Blick, zum Beispiel denselben Messwert für verschiedene Gruppen oder Jahre.',
  'guide.figure.appearance': 'Stellen Sie sich eine Seite vor, die wie ein Fenster mit mehreren Scheiben in Felder geteilt ist. Jedes Feld enthält ein eigenes Diagramm mit eigenen Achsen. Sie können immer ein Teildiagramm nach dem anderen betreten.',

  'guide.area.definition': 'Ein Flächendiagramm ist ein Liniendiagramm, bei dem der Raum zwischen der Linie und der unteren Achse ausgefüllt ist.',
  'guide.area.purpose': 'Damit zeigt man, wie eine Menge im Lauf der Zeit steigt und fällt. Die Fläche macht die Größe dieser Menge gut spürbar.',
  'guide.area.appearance': 'Eine Linie verläuft von links nach rechts und geht mit den Werten auf und ab. Alles unter der Linie bis zur Grundlinie ist ausgefüllt. So sieht es aus wie eine Bergkette von der Seite.',

  'guide.alluvial.definition': 'Ein Alluvialdiagramm zeigt, wie Dinge über mehrere Schritte hinweg zwischen Gruppen wechseln.',
  'guide.alluvial.purpose': 'Damit verfolgt man Wechsel zwischen Gruppen, zum Beispiel wie Wählerinnen und Wähler von einer Wahl zur nächsten die Partei gewechselt haben.',
  'guide.alluvial.appearance': 'Mehrere Säulen aus gestapelten Blöcken stehen von links nach rechts in einer Reihe, eine Säule pro Schritt. Zwischen benachbarten Säulen fließen geschwungene Bänder. Je breiter ein Band, desto mehr Dinge haben diesen Weg genommen.',

  'guide.bar.definition': 'Ein Balkendiagramm zeigt für jede Kategorie eine Zahl als Balken.',
  'guide.bar.purpose': 'Damit vergleicht man Mengen zwischen Kategorien, zum Beispiel Umsätze pro Monat oder Stimmen pro Kandidat.',
  'guide.bar.appearance': 'Gleich breite Rechtecke stehen nebeneinander auf einer gemeinsamen Grundlinie. Je länger der Balken, desto größer der Wert. Balken können aufrecht stehen oder waagerecht liegen.',

  'guide.bump.definition': 'Ein Bump-Diagramm zeigt, wie sich die Rangfolge mehrerer Teilnehmer im Lauf der Zeit ändert.',
  'guide.bump.purpose': 'Damit verfolgt man, wer Erster, Zweiter, Dritter und so weiter ist, und erkennt, wann jemand einen anderen überholt, zum Beispiel Mannschaften in einer Tabelle.',
  'guide.bump.appearance': 'Die Zeit verläuft von links nach rechts, der Rang von oben nach unten. Platz eins ist ganz oben. Jeder Teilnehmer ist eine Linie mit einem Punkt zu jedem Zeitpunkt. Wo zwei Plätze tauschen, kreuzen sich die Linien.',

  'guide.box.definition': 'Ein Boxplot fasst eine Reihe von Zahlen mit fünf Werten zusammen: dem kleinsten Wert, dem unteren Viertel, der Mitte, dem oberen Viertel und dem größten Wert.',
  'guide.box.purpose': 'Damit vergleicht man die Streuung und die Mitte mehrerer Gruppen. Außerdem findet man ungewöhnliche Werte, die Ausreißer heißen.',
  'guide.box.appearance': 'Jede Gruppe hat einen Kasten mit einem Strich beim mittleren Wert. Dünne Linien, die Whisker heißen, reichen von beiden Enden des Kastens bis zum kleinsten und größten üblichen Wert. Ausreißer sind kleine Punkte jenseits der Whisker.',

  'guide.boxen.definition': 'Ein Letter-Value-Plot ist ein erweiterter Boxplot. Er zeigt mehr Schnittpunkte der Daten, vor allem an den Rändern.',
  'guide.boxen.purpose': 'Man nutzt ihn für große Datenmengen, bei denen ein normaler Boxplot zu viele Details über die extremen Werte verbirgt.',
  'guide.boxen.appearance': 'Jede Gruppe sieht aus wie ein Stapel von Kästen um den mittleren Wert. Der breiteste Kasten enthält die mittlere Hälfte der Daten. Jeder kleinere Kasten weiter außen enthält einen dünneren Teil der Ränder, wie bei einer Stufenpyramide.',

  'guide.candlestick.definition': 'Ein Kerzendiagramm zeigt, wie sich ein Preis in jedem Zeitraum bewegt hat, zum Beispiel an einem Tag.',
  'guide.candlestick.purpose': 'Man nutzt es an der Börse, um für jeden Zeitraum den Eröffnungs-, Höchst-, Tiefst- und Schlusskurs einer Aktie oder Währung abzulesen.',
  'guide.candlestick.appearance': 'Die Zeit verläuft von links nach rechts, mit einer Kerze pro Zeitraum. Jede Kerze hat einen dicken Körper zwischen Eröffnungs- und Schlusskurs. Dünne Linien, die Dochte heißen, reichen nach oben zum Höchstkurs und nach unten zum Tiefstkurs. Meist hat der Körper eine Farbe, wenn der Preis gestiegen ist, und eine andere, wenn er gefallen ist.',

  'guide.candlestick_delta.definition': 'Ein Kerzen-Referenzdelta vergleicht jede Kerze eines Kerzendiagramms mit einer Referenzlinie, zum Beispiel einem gleitenden Durchschnitt.',
  'guide.candlestick_delta.purpose': 'Damit erkennt man, wie weit der Preis in jedem Zeitraum über oder unter seinem üblichen Niveau lag.',
  'guide.candlestick_delta.appearance': 'Es wird nicht eigens gezeichnet. Es liest dieselben Kerzen wie das Kerzendiagramm und gibt jeden Preis als Abstand zur Referenzlinie am selben Zeitpunkt an.',

  'guide.chord.definition': 'Ein Chord-Diagramm zeigt Ströme oder Verbindungen zwischen den Mitgliedern einer Gruppe, die im Kreis angeordnet sind.',
  'guide.chord.purpose': 'Damit zeigt man, wer mit wem wie viel austauscht, zum Beispiel Handel zwischen Ländern oder Umzüge zwischen Regionen.',
  'guide.chord.appearance': 'Die Mitglieder sitzen als Bögen am Rand eines Kreises. Geschwungene Bänder verlaufen durch das Innere des Kreises und verbinden je zwei Mitglieder. Je breiter ein Band, desto größer der Strom.',

  'guide.choropleth.definition': 'Eine Choroplethenkarte ist eine Landkarte, auf der jede Region nach einem Wert eingefärbt ist.',
  'guide.choropleth.purpose': 'Damit zeigt man, wie sich ein Wert von Ort zu Ort unterscheidet, zum Beispiel die Einwohnerzahl pro Land oder das Einkommen pro Landkreis.',
  'guide.choropleth.appearance': 'Sie sieht aus wie eine normale Landkarte mit Grenzen um Regionen wie Länder oder Bundesländer. Jede Region ist mit einem Farbton gefüllt, meist dunkler oder kräftiger für höhere Werte. Eine Legende erklärt die Skala.',

  'guide.contour.definition': 'Ein Konturdiagramm zeigt eine Fläche von Werten auf flachem Papier. Linien verbinden dabei Punkte mit gleichem Wert.',
  'guide.contour.purpose': 'Man nutzt es für Daten, die sich in zwei Richtungen ändern, zum Beispiel die Höhe auf einer Wanderkarte oder die Temperatur in einer Region.',
  'guide.contour.appearance': 'Geschlossene, wellige Ringe liegen ineinander, wie die Höhenlinien um einen Hügel auf einer Wanderkarte. Jeder Ring steht für einen Wert. Wo die Ringe dicht beieinander liegen, ändert sich der Wert steil. Wo sie weit auseinander liegen, ändert er sich sanft.',

  'guide.diverging_bar.definition': 'Ein divergierendes Balkendiagramm zeigt Balken, die von einer Mittellinie aus in zwei entgegengesetzte Richtungen wachsen.',
  'guide.diverging_bar.purpose': 'Damit vergleicht man zwei gegensätzliche Seiten, zum Beispiel Zustimmung und Ablehnung in einer Umfrage oder Männer und Frauen in einer Bevölkerungspyramide.',
  'guide.diverging_bar.appearance': 'In der Mitte verläuft eine Linie. Für jede Kategorie reicht ein Balken nach links und ein anderer nach rechts. Die Länge des Balkens ist sein Wert. Die Seite zeigt, zu welcher Gruppe er gehört.',

  'guide.dodged_bar.definition': 'Ein gruppiertes Balkendiagramm stellt in jeder Kategorie mehrere Balken nebeneinander.',
  'guide.dodged_bar.purpose': 'Damit vergleicht man Untergruppen innerhalb jeder Kategorie, zum Beispiel die Umsätze mehrerer Produkte in jedem Monat.',
  'guide.dodged_bar.appearance': 'Entlang der Kategorienachse stehen kleine Gruppen von Balken. Jede Gruppe hat einen Balken pro Untergruppe. Die Balken stehen dicht nebeneinander auf derselben Grundlinie, meist in verschiedenen Farben.',

  'guide.dot.definition': 'Ein Punktdiagramm zeigt für jede Kategorie eine Zahl als einzelnen Punkt.',
  'guide.dot.purpose': 'Man nutzt es wie ein Balkendiagramm, um Werte zwischen Kategorien zu vergleichen. Es braucht aber weniger Farbe, sodass auch viele Kategorien gut lesbar bleiben.',
  'guide.dot.appearance': 'Die Kategorien stehen entlang einer Achse. Für jede Kategorie sitzt ein einzelner Punkt an der Stelle ihres Werts auf der anderen Achse.',

  'guide.dumbbell.definition': 'Ein Hanteldiagramm zeigt zwei Werte pro Kategorie, die durch eine Linie verbunden sind.',
  'guide.dumbbell.purpose': 'Damit zeigt man den Abstand oder die Veränderung zwischen zwei Werten, zum Beispiel vorher und nachher oder dieses Jahr und letztes Jahr.',
  'guide.dumbbell.appearance': 'Jede Kategorie hat zwei Punkte, die durch eine gerade Stange verbunden sind. So sieht sie aus wie eine Hantel aus dem Fitnessstudio. Die Länge der Stange ist die Größe des Abstands.',

  'guide.error_bar.definition': 'Ein Fehlerbalkendiagramm zeigt Werte zusammen damit, wie unsicher jeder Wert ist.',
  'guide.error_bar.purpose': 'Man nutzt es in Wissenschaft und Statistik, um eine Messung und ihren wahrscheinlichen Bereich zu zeigen, zum Beispiel ein Konfidenzintervall.',
  'guide.error_bar.appearance': 'Jeder Wert ist ein Punkt oder das obere Ende eines Balkens. Eine dünne Linie verläuft durch ihn hindurch, von einer unteren bis zu einer oberen Grenze. Oft hat sie an beiden Enden kurze Querstriche, wie der Buchstabe I.',

  'guide.forest.definition': 'Ein Forest-Plot zeigt die Ergebnisse mehrerer Studien zur selben Frage, eine Zeile pro Studie, dazu ein gemeinsames Gesamtergebnis.',
  'guide.forest.purpose': 'Man nutzt ihn in der medizinischen Forschung und in Metaanalysen, um zu sehen, ob Studien übereinstimmen und wie groß ihr gemeinsamer Effekt ist.',
  'guide.forest.appearance': 'Die Studien stehen untereinander. Jede hat ein kleines Quadrat bei ihrem Schätzwert und eine waagerechte Linie für ihre Unsicherheit. Eine senkrechte Linie markiert „kein Effekt“. Ganz unten zeigt eine Raute das Gesamtergebnis.',

  'guide.gantt.definition': 'Ein Gantt-Diagramm zeigt Aufgaben als Balken entlang einer Zeitachse.',
  'guide.gantt.purpose': 'Man nutzt es in der Projektplanung, um zu sehen, wann jede Aufgabe beginnt und endet, wie lange sie dauert und welche Aufgaben sich überschneiden.',
  'guide.gantt.appearance': 'Die Zeit verläuft von links nach rechts, die Aufgaben stehen untereinander. Jede Aufgabe ist ein waagerechter Balken. Er beginnt an ihrem Startdatum und endet an ihrem Enddatum.',

  'guide.funnel.definition': 'Ein Trichterdiagramm zeigt, wie viele Dinge in jeder Stufe eines Ablaufs übrig bleiben.',
  'guide.funnel.purpose': 'Damit findet man heraus, wo Dinge verloren gehen, zum Beispiel wie viele Besucher einer Website sich anmelden und dann etwas kaufen.',
  'guide.funnel.appearance': 'Die Stufen liegen von oben nach unten übereinander. Jede Stufe ist ein mittig ausgerichteter Balken. Nach unten werden die Balken schmaler, sodass die ganze Form wie ein Küchentrichter aussieht.',

  'guide.gauge.definition': 'Ein Tachodiagramm zeigt einen einzelnen Wert innerhalb seines möglichen Bereichs, wie ein Tacho im Auto.',
  'guide.gauge.purpose': 'Damit zeigt man den Fortschritt auf ein Ziel hin oder ob ein Messwert im guten, kritischen oder schlechten Bereich liegt.',
  'guide.gauge.appearance': 'Ein Halbkreis oder ein gerader Balken steht für den ganzen Bereich vom kleinsten bis zum größten Wert. Oft ist er in farbige Zonen geteilt. Eine Nadel oder ein gefüllter Teil zeigt auf den aktuellen Wert, manchmal mit einer Markierung für das Ziel.',

  'guide.heat.definition': 'Eine Heatmap ist ein Raster aus Zellen. Jede Zelle ist nach ihrem Wert eingefärbt.',
  'guide.heat.purpose': 'Damit erkennt man Muster in einer Zahlentabelle, zum Beispiel zu welchen Stunden an welchen Tagen am meisten los ist.',
  'guide.heat.appearance': 'Zeilen und Spalten bilden ein Raster wie ein Schachbrett. Jede Zelle ist mit einer Farbe gefüllt, meist dunkler oder wärmer für höhere Werte. Eine Legende erklärt die Skala.',

  'guide.hexbin.definition': 'Ein Hexbin-Diagramm teilt ein Streudiagramm in sechseckige Zellen und zählt, wie viele Punkte in jede Zelle fallen.',
  'guide.hexbin.purpose': 'Man nutzt es, wenn es so viele Punkte gibt, dass sie übereinander liegen. So sieht man, wo sie sich am dichtesten drängen.',
  'guide.hexbin.appearance': 'Die Fläche ist mit Sechsecken bedeckt, wie eine Bienenwabe. Jedes Sechseck ist danach eingefärbt, wie viele Punkte es enthält. Dunklere Zellen haben mehr Punkte.',

  'guide.hist.definition': 'Ein Histogramm zeigt, wie sich eine Reihe von Zahlen verteilt. Dazu zählt es, wie viele Zahlen in jeden Bereich fallen.',
  'guide.hist.purpose': 'Damit sieht man die Form der Daten: wo die meisten Werte liegen, wie weit sie streuen und ob die Daten zu einer Seite neigen.',
  'guide.hist.appearance': 'Aufrechte Balken stehen ohne Lücken nebeneinander. Jeder Balken deckt einen Wertebereich auf der unteren Achse ab. Seine Höhe zeigt, wie viele Werte in diesen Bereich fallen.',

  'guide.line.definition': 'Ein Liniendiagramm verbindet eine Reihe von Werten mit einer Linie, meist in zeitlicher Reihenfolge.',
  'guide.line.purpose': 'Damit zeigt man Trends, zum Beispiel wie sich die Temperatur oder ein Aktienkurs über Tage oder Jahre verändert.',
  'guide.line.appearance': 'Die Zeit oder ein anderer geordneter Wert verläuft von links nach rechts. Die Linie steigt, wenn die Werte steigen, und fällt, wenn sie fallen. Mehrere Linien können sich ein Diagramm teilen, eine pro Datenreihe.',

  'guide.lollipop.definition': 'Ein Lollipop-Diagramm zeigt für jede Kategorie eine Zahl als dünnen Stiel mit einem Punkt am Ende.',
  'guide.lollipop.purpose': 'Man nutzt es wie ein Balkendiagramm, um Werte zwischen Kategorien zu vergleichen. Es wirkt aber leichter.',
  'guide.lollipop.appearance': 'Von einer gemeinsamen Grundlinie steigt für jede Kategorie eine dünne Linie auf. Sie endet in einem runden Punkt bei ihrem Wert, wie ein Lutscher am Stiel.',

  'guide.manhattan.definition': 'Ein Manhattan-Plot zeigt die Testergebnisse für viele Stellen im Erbgut, einen Punkt pro Stelle.',
  'guide.manhattan.purpose': 'Man nutzt ihn in der Genetik, um die wenigen Stellen zu finden, die stark mit einem Merkmal oder einer Krankheit zusammenhängen.',
  'guide.manhattan.appearance': 'Die Stellen verlaufen von links nach rechts, nach Chromosomen gruppiert und in abwechselnden Farben. Die Höhe zeigt, wie stark das Signal ist. Die meisten Punkte bleiben unten, und einige Türme ragen hoch auf, wie Wolkenkratzer in der Skyline von Manhattan.',

  'guide.mosaic.definition': 'Ein Mosaikdiagramm zeigt, wie zwei Kategorien zusammenwirken. Die Fläche jeder Kachel entspricht dem Anteil ihrer Kombination.',
  'guide.mosaic.purpose': 'Damit untersucht man Zusammenhänge in einer Tabelle mit Häufigkeiten, zum Beispiel das Überleben nach Passagierklasse.',
  'guide.mosaic.appearance': 'Ein Rechteck ist in Spalten geteilt. Die Breite jeder Spalte entspricht der Größe einer Gruppe. Jede Spalte ist dann von oben nach unten in Kacheln geteilt, deren Höhe dem Anteil jeder Untergruppe entspricht.',

  'guide.network.definition': 'Ein Netzwerkdiagramm zeigt Dinge als Punkte und die Verbindungen zwischen ihnen als Linien.',
  'guide.network.purpose': 'Damit zeigt man Beziehungen, zum Beispiel Freundschaften zwischen Menschen oder Links zwischen Webseiten. Man findet damit auch die am stärksten vernetzten Dinge.',
  'guide.network.appearance': 'Kleine Kreise, die Knoten heißen, sind über die Seite verteilt. Linien, die Kanten heißen, verbinden je zwei Knoten. Dinge mit vielen Verbindungen sitzen oft in der Mitte, und von ihnen gehen viele Linien strahlenförmig aus.',

  'guide.stacked_normalized_bar.definition': 'Ein normalisiertes gestapeltes Balkendiagramm zeigt jede Kategorie als Balken mit derselben Gesamtlänge, geteilt in Prozentanteile.',
  'guide.stacked_normalized_bar.purpose': 'Damit vergleicht man Anteile zwischen Kategorien, zum Beispiel den Anteil jeder Altersgruppe in mehreren Ländern.',
  'guide.stacked_normalized_bar.appearance': 'Jeder Balken ist gleich lang und steht für 100 Prozent. Jeder Balken ist in farbige Abschnitte geteilt, die hintereinander liegen. Die Größe eines Abschnitts ist der Anteil dieses Teils.',

  'guide.stacked_normalized_area.definition': 'Ein normalisiertes gestapeltes Flächendiagramm zeigt, wie sich die Anteile mehrerer Teile eines Ganzen im Lauf der Zeit ändern.',
  'guide.stacked_normalized_area.purpose': 'Damit verfolgt man Anteile über die Zeit, zum Beispiel den Anteil verschiedener Energiequellen in jedem Jahr.',
  'guide.stacked_normalized_area.appearance': 'Das Diagramm ist ein volles Rechteck von 0 bis 100 Prozent. Farbige Bänder liegen übereinander und füllen es immer ganz aus. Ein Band wird dicker, wenn sein Anteil wächst, und dünner, wenn er schrumpft.',

  'guide.parallel_coordinates.definition': 'Ein Parallelkoordinatendiagramm zeigt Dinge mit vielen Messwerten, eine Linie pro Ding.',
  'guide.parallel_coordinates.purpose': 'Damit vergleicht man Dinge über viele Merkmale gleichzeitig und findet Gruppen ähnlicher Dinge.',
  'guide.parallel_coordinates.appearance': 'Mehrere senkrechte Achsen stehen nebeneinander, eine pro Messwert. Jedes Ding ist eine Zickzacklinie, die jede Achse bei ihrem Wert für diesen Messwert kreuzt.',

  'guide.pie.definition': 'Ein Kreisdiagramm zeigt, wie ein Ganzes in Teile geteilt ist, als Stücke eines Kreises.',
  'guide.pie.purpose': 'Damit zeigt man Anteile an einer Gesamtsumme, zum Beispiel wie ein Budget auf die Abteilungen verteilt ist.',
  'guide.pie.appearance': 'Ein Kreis ist von der Mitte aus in keilförmige Stücke geschnitten, wie eine Torte. Je größer der Anteil, desto breiter das Stück. Alle Stücke zusammen ergeben den ganzen Kreis.',

  'guide.polar_area.definition': 'Ein Polarflächendiagramm, auch Rosendiagramm genannt, zeigt Werte als Keile mit gleichem Winkel, die unterschiedlich weit nach außen reichen.',
  'guide.polar_area.purpose': 'Damit vergleicht man Werte in Kategorien, die sich wiederholen, zum Beispiel die Monate eines Jahres oder Himmelsrichtungen.',
  'guide.polar_area.appearance': 'Keile fächern sich von einer gemeinsamen Mitte aus, alle mit demselben Winkel, wie die Blütenblätter einer Blume. Je weiter ein Keil von der Mitte reicht, desto größer ist sein Wert.',

  'guide.radar.definition': 'Ein Radardiagramm, auch Netzdiagramm genannt, zeigt mehrere Messwerte eines Dings auf Achsen, die im Kreis angeordnet sind.',
  'guide.radar.purpose': 'Damit vergleicht man Stärken und Schwächen bei mehreren Eigenschaften, zum Beispiel die Fähigkeiten eines Spielers.',
  'guide.radar.appearance': 'Speichen gehen von einem Mittelpunkt aus, eine pro Messwert, wie bei einem Rad. Jeder Wert ist ein Punkt auf seiner Speiche, weiter außen für höhere Werte. Die Punkte sind zu einer geschlossenen Form verbunden, wie ein Spinnennetz.',

  'guide.ridgeline.definition': 'Ein Ridgeline-Diagramm zeigt die Verteilung mehrerer Gruppen als weiche Kurven, die übereinander gestapelt sind.',
  'guide.ridgeline.purpose': 'Damit vergleicht man die Form der Daten über viele Gruppen, zum Beispiel die Temperaturen in jedem Monat.',
  'guide.ridgeline.appearance': 'Jede Gruppe hat eine hügelförmige Kurve, die dort höher ist, wo Werte häufig sind. Die Kurven sind die Seite hinunter gestapelt und überlappen sich leicht, wie hintereinander liegende Bergkämme aus der Ferne.',

  'guide.roc.definition': 'Eine ROC-Kurve zeigt, wie gut ein Test oder ein Vorhersagemodell zwei Ergebnisse trennt, zum Beispiel krank und gesund.',
  'guide.roc.purpose': 'Damit bewertet man einen Klassifikator und wählt einen Schwellenwert. Er soll möglichst viele echte Fälle finden und dabei wenige Fehlalarme auslösen.',
  'guide.roc.appearance': 'Eine Kurve steigt in einem Quadrat von der unteren linken zur oberen rechten Ecke. Eine Diagonale steht für reines Raten. Je näher sich die Kurve zur oberen linken Ecke biegt, desto besser ist das Modell.',

  'guide.rug.definition': 'Ein Rug-Plot markiert jede Beobachtung als kurzen Strich entlang einer Achse.',
  'guide.rug.purpose': 'Damit zeigt man genau, wo einzelne Werte liegen und wo sie sich häufen. Oft steht er neben einem anderen Diagramm.',
  'guide.rug.appearance': 'An einem Rand des Diagramms steht eine Reihe kurzer Striche, wie die Fransen eines Teppichs. Jeder Strich ist ein Wert. Dichte Stellen sehen aus wie dicke Borsten.',

  'guide.sankey.definition': 'Ein Sankey-Diagramm zeigt, wie eine Menge von einer Stufe zur nächsten fließt.',
  'guide.sankey.purpose': 'Damit verfolgt man, woher etwas kommt und wohin es geht, zum Beispiel Energie von den Quellen bis zur Nutzung oder Geld durch einen Haushalt.',
  'guide.sankey.appearance': 'Blöcke, die Knoten heißen, stehen in Spalten von links nach rechts. Bänder fließen von einem Knoten zum nächsten. Die Breite eines Bandes zeigt, wie viel entlang fließt.',

  'guide.point.definition': 'Ein Streudiagramm zeigt die Beziehung zwischen zwei Zahlen, mit einem Punkt für jedes Ding.',
  'guide.point.purpose': 'Damit sieht man, ob zwei Messwerte zusammenhängen, zum Beispiel Größe und Gewicht. Man erkennt auch Häufungen und ungewöhnliche Punkte.',
  'guide.point.appearance': 'Punkte sind über eine Fläche verteilt. Die Position eines Punkts von links nach rechts ist der eine Wert, seine Position von unten nach oben der andere. Bilden die Punkte ein ansteigendes Band, dann wachsen beide Werte meist gemeinsam.',

  'guide.smooth.definition': 'Ein geglättetes Liniendiagramm zeigt eine Kurve, die durch die Datenpunkte gelegt ist und ihren allgemeinen Verlauf zeigt.',
  'guide.smooth.purpose': 'Damit sieht man die Gesamtrichtung unruhiger Daten, ohne sich von jedem Auf und Ab ablenken zu lassen.',
  'guide.smooth.appearance': 'Eine einzelne sanfte Kurve verläuft von links nach rechts durch die Mitte der Daten. Sie berührt nicht jeden Punkt. Oft liegt sie über einem Streudiagramm, manchmal mit einem schattierten Band darum.',

  'guide.sunflower.definition': 'Ein Sonnenblumendiagramm ist ein Streudiagramm, in dem mehrere Punkte an derselben Stelle als ein Zeichen mit Blütenblättern dargestellt werden.',
  'guide.sunflower.purpose': 'Man nutzt es, wenn viele Beobachtungen genau dieselben Werte haben. So bleibt die Anzahl an jeder Stelle sichtbar.',
  'guide.sunflower.appearance': 'Es sieht aus wie ein Streudiagramm, aber aus manchen Punkten ragen kurze Striche heraus, wie die Blütenblätter einer Blume. Die Zahl der Blütenblätter ist die Zahl der Beobachtungen an dieser Stelle.',

  'guide.stacked_bar.definition': 'Ein gestapeltes Balkendiagramm zeigt jede Kategorie als einen Balken aus mehreren Teilen, die übereinander gestapelt sind.',
  'guide.stacked_bar.purpose': 'Damit zeigt man die Summe jeder Kategorie und zugleich, woraus sie sich zusammensetzt, zum Beispiel den Gesamtumsatz aufgeteilt nach Produkten.',
  'guide.stacked_bar.appearance': 'Balken stehen nebeneinander. Jeder Balken ist in farbige Abschnitte geteilt, die übereinander liegen. Die volle Höhe des Balkens ist die Summe, und jeder Abschnitt ist ein Teil davon.',

  'guide.stacked_area.definition': 'Ein gestapeltes Flächendiagramm zeigt mehrere Mengen im Lauf der Zeit, übereinander geschichtet.',
  'guide.stacked_area.purpose': 'Damit zeigt man, wie sich eine Summe über die Zeit ändert und was jeder Teil dazu beiträgt.',
  'guide.stacked_area.appearance': 'Farbige Bänder sind von unten nach oben geschichtet, jedes liegt auf dem darunter. Die Oberkante des obersten Bandes ist die Summe. Die Dicke jedes Bandes ist die Menge dieses Teils.',

  'guide.step.definition': 'Ein Stufendiagramm ist ein Liniendiagramm, das sich in flachen Stufen bewegt statt in schrägen Linien.',
  'guide.step.purpose': 'Man nutzt es für Werte, die eine Weile gleich bleiben und dann springen, zum Beispiel Preise, Zinssätze oder Anzahlen.',
  'guide.step.appearance': 'Die Linie verläuft flach, geht dann senkrecht nach oben oder unten und verläuft wieder flach, wie eine Treppe von der Seite.',

  'guide.survival.definition': 'Eine Überlebenskurve zeigt, welcher Anteil einer Gruppe ein Ereignis im Lauf der Zeit noch nicht erlebt hat.',
  'guide.survival.purpose': 'Man nutzt sie in Medizin und Technik, um zu vergleichen, wie lange Menschen oder Maschinen durchhalten, zum Beispiel Patienten mit zwei verschiedenen Behandlungen.',
  'guide.survival.appearance': 'Die Linie beginnt oben links bei 100 Prozent. Jedes Mal, wenn ein Ereignis eintritt, fällt sie nach rechts eine Stufe ab. Eine Kurve, die länger oben bleibt, bedeutet ein besseres Überleben. Kleine Striche können Personen zeigen, die aus der Studie ausgeschieden sind.',

  'guide.icicle.definition': 'Ein Eiszapfendiagramm zeigt eine Hierarchie, zum Beispiel Ordner und Dateien, als Schichten von Rechtecken.',
  'guide.icicle.purpose': 'Damit sieht man, wie ein Ganzes in Teile zerfällt und diese Teile wieder in kleinere Teile.',
  'guide.icicle.appearance': 'Das Ganze ist ein langer Balken ganz oben. Darunter ist er in die Teile der nächsten Ebene geteilt, und jeder dieser Teile ist darunter wieder geteilt, wie Eiszapfen an einem Dach. Breitere Stücke sind größer.',

  'guide.sunburst.definition': 'Ein Sunburst-Diagramm zeigt eine Hierarchie als Ringe um eine Mitte.',
  'guide.sunburst.purpose': 'Damit sieht man, wie sich ein Ganzes über mehrere Ebenen in Teile gliedert, zum Beispiel das Budget einer Firma nach Abteilungen und Teams.',
  'guide.sunburst.appearance': 'Der Kreis in der Mitte ist das Ganze. Jeder Ring weiter außen ist die nächste Ebene darunter, in Bögen geschnitten. Jeder Bogen liegt direkt außerhalb seines übergeordneten Teils. Breitere Bögen sind größere Anteile.',

  'guide.tree.definition': 'Ein Baumdiagramm zeigt eine Hierarchie als Kästen, die durch Linien verbunden sind, von einer Wurzel bis zu ihren Zweigen.',
  'guide.tree.purpose': 'Damit zeigt man Strukturen, zum Beispiel ein Organigramm, einen Stammbaum oder eine Reihe von Entscheidungen.',
  'guide.tree.appearance': 'Ein Element steht oben oder links. Von ihm verzweigen sich Linien zu seinen Kindern, die sich wieder zu ihren Kindern verzweigen, wie ein Baum, der auf dem Kopf steht.',

  'guide.pack.definition': 'Eine Kreispackung zeigt eine Hierarchie als Kreise, die in anderen Kreisen liegen.',
  'guide.pack.purpose': 'Damit zeigt man Gruppen in Gruppen und ihre Größen, zum Beispiel Länder in Kontinenten.',
  'guide.pack.appearance': 'Ein großer Kreis enthält kleinere Kreise, die wieder noch kleinere Kreise enthalten können, wie Blasen in Blasen. Die Größe jedes Kreises zeigt seinen Wert.',

  'guide.treemap.definition': 'Eine Treemap zeigt eine Hierarchie als ineinander liegende Rechtecke. Die Fläche jedes Rechtecks entspricht seinem Wert.',
  'guide.treemap.purpose': 'Damit sieht man, welche Teile eines Ganzen am größten sind, zum Beispiel welche Ordner den meisten Speicherplatz belegen.',
  'guide.treemap.appearance': 'Ein großes Rechteck ist mit kleineren Rechtecken gefliest, wie eine Flickendecke. Größere Werte bekommen größere Kacheln. Kacheln derselben Gruppe liegen zusammen in einer größeren Kachel.',

  'guide.violin_box.definition': 'Ein Violin-Boxplot ist der Boxplot, der in einen Violinplot gezeichnet ist. Er fasst jede Gruppe mit fünf Werten zusammen.',
  'guide.violin_box.purpose': 'Damit liest man für jede Gruppe den kleinsten Wert, das untere Viertel, die Mitte, das obere Viertel und den größten Wert ab, zusammen mit der Form der Violine.',
  'guide.violin_box.appearance': 'In jeder Violinform sitzt ein schmaler Kasten mit einer Markierung beim mittleren Wert. Dünne Whisker reichen nach oben und unten bis zum kleinsten und größten Wert.',

  'guide.violin_kde.definition': 'Ein Violinplot zeigt die Form der Daten einer Gruppe als weichen, gespiegelten Umriss.',
  'guide.violin_kde.purpose': 'Damit vergleicht man die Verteilungen mehrerer Gruppen. Man sieht, wo Werte häufig und wo sie selten sind.',
  'guide.violin_kde.appearance': 'Jede Gruppe hat eine Form, die dort breit ist, wo viele Werte liegen, und dort schmal, wo wenige liegen. Die Form ist an einer Mittellinie gespiegelt und sieht deshalb oft wie eine Geige oder eine Vase aus.',

  'guide.volcano.definition': 'Ein Volcano-Plot zeigt für viele Dinge gleichzeitig, wie groß eine Veränderung ist und wie statistisch bedeutsam sie ist.',
  'guide.volcano.purpose': 'Man nutzt ihn in der Biologie, um Gene oder Proteine zu finden, die sich zwischen zwei Bedingungen stark und verlässlich verändern.',
  'guide.volcano.appearance': 'Die Punkte bilden eine Form wie ein ausbrechender Vulkan. Die Position von links nach rechts zeigt Größe und Richtung der Veränderung, die Höhe zeigt die Bedeutsamkeit. Die interessanten Dinge liegen in der oberen linken und oberen rechten Ecke.',

  'guide.waterfall.definition': 'Ein Wasserfalldiagramm zeigt, wie ein Startwert durch eine Reihe von Zu- und Abnahmen zu einem Endwert wird.',
  'guide.waterfall.purpose': 'Damit erklärt man eine Summe Schritt für Schritt, zum Beispiel wie sich Einnahmen und Kosten zum Gewinn zusammensetzen.',
  'guide.waterfall.appearance': 'Der erste Balken steht auf der Grundlinie. Jeder weitere Balken schwebt und beginnt dort, wo der vorige endete. Bei einer Zunahme geht er nach oben, bei einer Abnahme nach unten, wie Treppenstufen. Der letzte Balken steht wieder auf der Grundlinie und zeigt die Endsumme.',

  'guide.word_cloud.definition': 'Eine Wortwolke zeigt Wörter aus einem Text. Häufigere oder wichtigere Wörter sind größer dargestellt.',
  'guide.word_cloud.purpose': 'Damit bekommt man schnell einen Eindruck von den Hauptthemen eines Textes, von Umfrageantworten oder von Beiträgen in sozialen Medien.',
  'guide.word_cloud.appearance': 'Wörter sind dicht zu einer Wolke gepackt, in verschiedenen Größen und manchmal in verschiedenen Richtungen. Die größten Wörter sind die häufigsten.',
} satisfies Partial<Record<MessageKey, string>>;
