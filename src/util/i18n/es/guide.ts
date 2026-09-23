import type { MessageKey } from '../index';

export const guide = {
  // Dialog chrome.
  'guide.toggle': 'Sobre este tipo de gráfico ({chartType})',
  'guide.definitionHeading': 'Qué es',
  'guide.purposeHeading': 'Para qué sirve',
  'guide.appearanceHeading': 'Cómo se ve',

  // Multi-panel figure (the lobby, before a subplot is entered).
  'guide.figure.definition': 'Una figura de varios paneles reúne varios gráficos pequeños, uno al lado de otro o en una cuadrícula. Todos comparten un mismo título general.',
  'guide.figure.purpose': 'Sirve para comparar de un vistazo varias vistas relacionadas de los datos. Por ejemplo, la misma medida para distintos grupos o años.',
  'guide.figure.appearance': 'Imagina una página dividida en recuadros, como una ventana con varios cristales. Cada recuadro tiene su propio gráfico con sus propios ejes, y puedes entrar en un panel cada vez.',

  'guide.area.definition': 'Un gráfico de áreas es un gráfico de líneas con el espacio relleno entre la línea y el eje de abajo.',
  'guide.area.purpose': 'Sirve para mostrar cómo sube y baja una cantidad con el tiempo. También ayuda a percibir el tamaño total de esa cantidad.',
  'guide.area.appearance': 'Una línea va de izquierda a derecha, subiendo y bajando con los valores. Todo lo que queda debajo de la línea, hasta la base, está relleno. Parece una cordillera vista de lado.',

  'guide.alluvial.definition': 'Un diagrama aluvial muestra cómo pasan los elementos de un grupo a otro a lo largo de varias etapas.',
  'guide.alluvial.purpose': 'Sirve para seguir los cambios de grupo. Por ejemplo, cómo cambiaron los votantes de partido de unas elecciones a las siguientes.',
  'guide.alluvial.appearance': 'Hay columnas de bloques apilados, en fila de izquierda a derecha, una por etapa. Entre columnas vecinas fluyen bandas curvas, como ríos. Cuanto más gruesa es la banda, más elementos siguieron ese camino.',

  'guide.bar.definition': 'Un gráfico de barras muestra un número para cada categoría en forma de barra.',
  'guide.bar.purpose': 'Sirve para comparar cantidades entre categorías. Por ejemplo, las ventas de cada mes o los votos de cada candidato.',
  'guide.bar.appearance': 'Rectángulos del mismo ancho se colocan uno al lado de otro, desde una misma base. Cuanto más larga es la barra, mayor es el valor. Las barras pueden estar de pie o tumbadas.',

  'guide.bump.definition': 'Un gráfico de posiciones muestra cómo cambia con el tiempo el puesto de varios competidores.',
  'guide.bump.purpose': 'Sirve para seguir quién va primero, segundo, tercero y así, y para ver cuándo uno adelanta a otro. Por ejemplo, los equipos en la clasificación de una liga.',
  'guide.bump.appearance': 'El tiempo avanza de izquierda a derecha y el puesto va de arriba abajo, con el primer puesto arriba. Cada competidor es una línea con un punto en cada momento. Las líneas se cruzan cuando dos competidores cambian de puesto.',

  'guide.box.definition': 'Un diagrama de caja resume un conjunto de números con cinco valores: el mínimo, el primer cuartil, la mediana, el tercer cuartil y el máximo.',
  'guide.box.purpose': 'Sirve para comparar la dispersión y el centro de varios grupos. También ayuda a detectar valores raros, llamados valores atípicos.',
  'guide.box.appearance': 'Cada grupo tiene una caja cruzada por una línea en el valor central. Desde los dos extremos de la caja salen líneas finas, llamadas bigotes, hasta los valores típicos más bajo y más alto. Los valores atípicos son puntitos más allá de los bigotes.',

  'guide.boxen.definition': 'Un gráfico de valores de letra es un diagrama de caja ampliado. Muestra más puntos de corte de los datos, sobre todo en los extremos.',
  'guide.boxen.purpose': 'Sirve para conjuntos de datos grandes, en los que un diagrama de caja normal oculta demasiados detalles de los valores extremos.',
  'guide.boxen.appearance': 'Cada grupo parece una pila de cajas centrada en el valor central. La caja más ancha contiene la mitad central de los datos. Cada caja más pequeña, hacia fuera, contiene una franja más fina de los extremos, como una pirámide escalonada.',

  'guide.candlestick.definition': 'Un gráfico de velas muestra cómo se movió un precio en cada período de tiempo, por ejemplo, en un día.',
  'guide.candlestick.purpose': 'Se usa en finanzas para leer el precio de apertura, el máximo, el mínimo y el de cierre de una acción o una divisa en cada período.',
  'guide.candlestick.appearance': 'El tiempo avanza de izquierda a derecha, con una vela por período. Cada vela tiene un cuerpo grueso entre el precio de apertura y el de cierre. Unas líneas finas, llamadas mechas, llegan arriba hasta el máximo y abajo hasta el mínimo. El cuerpo suele tener un color cuando el precio sube y otro cuando baja.',

  'guide.candlestick_delta.definition': 'La delta de referencia del gráfico de velas compara cada vela con una línea de referencia, como una media móvil.',
  'guide.candlestick_delta.purpose': 'Sirve para saber cuánto estuvo el precio por encima o por debajo de su nivel habitual en cada período.',
  'guide.candlestick_delta.appearance': 'No se dibuja aparte. Lee las mismas velas que el gráfico de velas e indica cada precio como la diferencia con la línea de referencia en ese momento.',

  'guide.chord.definition': 'Un diagrama de cuerdas muestra flujos o conexiones entre los miembros de un grupo, colocados alrededor de un círculo.',
  'guide.chord.purpose': 'Sirve para mostrar quién intercambia cuánto con quién. Por ejemplo, el comercio entre países o la migración entre regiones.',
  'guide.chord.appearance': 'Los miembros son arcos en el borde de un círculo. Unas cintas curvas cruzan el interior del círculo y unen a dos miembros. Cuanto más ancha es la cinta, mayor es el flujo.',

  'guide.choropleth.definition': 'Un mapa coroplético es un mapa en el que cada región tiene un tono según un valor.',
  'guide.choropleth.purpose': 'Sirve para mostrar cómo cambia una medida de un lugar a otro. Por ejemplo, la población por país o los ingresos por provincia.',
  'guide.choropleth.appearance': 'Parece un mapa normal, con fronteras alrededor de regiones como países o provincias. Cada región está rellena de un tono, normalmente más oscuro o más intenso para los valores altos. Una leyenda explica la escala.',

  'guide.contour.definition': 'Un gráfico de contornos muestra una superficie de valores sobre un plano. Usa líneas que unen los puntos con el mismo valor.',
  'guide.contour.purpose': 'Sirve para datos que cambian en dos dimensiones. Por ejemplo, la altura en un mapa de senderismo o la temperatura en una región.',
  'guide.contour.appearance': 'Se dibujan anillos cerrados y ondulados, uno dentro de otro, como las curvas de nivel alrededor de un monte en un mapa de senderismo. Cada anillo marca un valor. Donde los anillos están muy juntos, el valor cambia deprisa. Donde están separados, cambia poco a poco.',

  'guide.diverging_bar.definition': 'Un gráfico de barras divergentes muestra barras que crecen en dos direcciones opuestas desde una línea central.',
  'guide.diverging_bar.purpose': 'Sirve para comparar dos lados opuestos. Por ejemplo, respuestas a favor y en contra, u hombres y mujeres en una pirámide de población.',
  'guide.diverging_bar.appearance': 'Una línea recorre el centro. En cada categoría, una barra se extiende hacia la izquierda y otra hacia la derecha. La longitud de cada barra es su valor, y el lado indica a qué grupo pertenece.',

  'guide.dodged_bar.definition': 'Un gráfico de barras agrupadas coloca varias barras una al lado de otra dentro de cada categoría.',
  'guide.dodged_bar.purpose': 'Sirve para comparar subgrupos dentro de cada categoría. Por ejemplo, las ventas de varios productos en cada mes.',
  'guide.dodged_bar.appearance': 'A lo largo del eje de categorías hay pequeños grupos de barras. Cada grupo tiene una barra por subgrupo, juntas y desde la misma base, normalmente de colores distintos.',

  'guide.dot.definition': 'Un gráfico de puntos muestra un número para cada categoría con un solo punto.',
  'guide.dot.purpose': 'Se usa igual que un gráfico de barras, para comparar valores entre categorías. Como usa menos tinta, se leen bien aunque haya muchas categorías.',
  'guide.dot.appearance': 'Las categorías se colocan a lo largo de un eje. Para cada una, se pone un solo punto en la posición de su valor sobre el otro eje.',

  'guide.dumbbell.definition': 'Un gráfico de mancuernas muestra dos valores para cada categoría, unidos por una línea.',
  'guide.dumbbell.purpose': 'Sirve para mostrar la diferencia o el cambio entre dos valores. Por ejemplo, antes y después, o este año y el anterior.',
  'guide.dumbbell.appearance': 'Cada categoría tiene dos puntos unidos por una barra recta, como una mancuerna de gimnasio. La longitud de la barra es el tamaño de la diferencia.',

  'guide.error_bar.definition': 'Un gráfico de barras de error muestra valores junto con su grado de incertidumbre.',
  'guide.error_bar.purpose': 'Se usa en ciencia y estadística para mostrar una medida y su rango probable, como un intervalo de confianza.',
  'guide.error_bar.appearance': 'Cada valor es un punto o el extremo de una barra. Lo atraviesa una línea fina, desde un límite inferior hasta un límite superior. A menudo tiene una rayita en cada punta, como la letra I.',

  'guide.forest.definition': 'Un gráfico de bosque muestra los resultados de varios estudios sobre una misma pregunta. Tiene una fila por estudio y un resultado combinado.',
  'guide.forest.purpose': 'Se usa en investigación médica y en metaanálisis para ver si los estudios coinciden y cuál es su efecto combinado.',
  'guide.forest.appearance': 'Los estudios se listan de arriba abajo. Cada uno tiene un cuadradito en su estimación y una línea horizontal que muestra su incertidumbre. Una línea vertical marca «sin efecto». Abajo, un rombo muestra el resultado combinado.',

  'guide.gantt.definition': 'Un diagrama de Gantt muestra tareas como barras sobre una línea de tiempo.',
  'guide.gantt.purpose': 'Se usa para planificar proyectos. Muestra cuándo empieza y termina cada tarea, cuánto dura y qué tareas coinciden en el tiempo.',
  'guide.gantt.appearance': 'El tiempo avanza de izquierda a derecha y las tareas se listan de arriba abajo. Cada tarea es una barra horizontal que empieza en su fecha de inicio y acaba en su fecha de fin.',

  'guide.funnel.definition': 'Un gráfico de embudo muestra cuántos elementos quedan en cada etapa de un proceso.',
  'guide.funnel.purpose': 'Sirve para ver dónde se pierden elementos. Por ejemplo, cuántas visitas de una web llegan a registrarse y luego a comprar.',
  'guide.funnel.appearance': 'Las etapas se apilan de arriba abajo. Cada etapa es una barra centrada, y las barras se estrechan hacia abajo. La forma completa parece un embudo de cocina.',

  'guide.gauge.definition': 'Un medidor muestra un solo valor dentro de su rango posible, como el velocímetro de un coche.',
  'guide.gauge.purpose': 'Sirve para mostrar el avance hacia un objetivo, o si una lectura está en una zona buena, de aviso o mala.',
  'guide.gauge.appearance': 'Un semicírculo o una barra recta representa el rango completo, del mínimo al máximo, a menudo dividido en zonas de colores. Una aguja o una parte rellena señala el valor actual. A veces hay una marca para el objetivo.',

  'guide.heat.definition': 'Un mapa de calor es una cuadrícula de celdas en la que cada celda tiene un color según su valor.',
  'guide.heat.purpose': 'Sirve para encontrar patrones en una tabla de números. Por ejemplo, qué horas de qué días hay más actividad.',
  'guide.heat.appearance': 'Las filas y columnas forman una cuadrícula, como un tablero de ajedrez. Cada celda tiene un color, normalmente más oscuro o más cálido para los valores altos. Una leyenda explica la escala.',

  'guide.hexbin.definition': 'Un gráfico de celdas hexagonales divide un diagrama de dispersión en celdas de seis lados y cuenta cuántos puntos caen en cada una.',
  'guide.hexbin.purpose': 'Se usa cuando hay tantos puntos que se amontonan unos sobre otros. Muestra dónde se concentran más.',
  'guide.hexbin.appearance': 'La zona del gráfico está cubierta de hexágonos, como un panal de abejas. Cada hexágono tiene un tono según los puntos que contiene: más oscuro cuantos más puntos.',

  'guide.hist.definition': 'Un histograma muestra cómo se reparten unos números. Cuenta cuántos caen en cada intervalo.',
  'guide.hist.purpose': 'Sirve para ver la forma de los datos: dónde está la mayoría de valores, cuánto se dispersan y si se inclinan hacia un lado.',
  'guide.hist.appearance': 'Barras verticales se colocan una junto a otra, sin huecos entre ellas. Cada barra cubre un intervalo de valores en el eje de abajo. Su altura es cuántos valores caen en ese intervalo.',

  'guide.line.definition': 'Un gráfico de líneas une una serie de valores con una línea, normalmente en orden de tiempo.',
  'guide.line.purpose': 'Sirve para mostrar tendencias. Por ejemplo, cómo cambia la temperatura o el precio de una acción a lo largo de días o años.',
  'guide.line.appearance': 'El tiempo u otro valor ordenado avanza de izquierda a derecha. La línea sube cuando los valores suben y baja cuando bajan. Puede haber varias líneas en el mismo gráfico, una por serie.',

  'guide.lollipop.definition': 'Un gráfico de piruletas muestra un número para cada categoría con un palito fino y un punto en la punta.',
  'guide.lollipop.purpose': 'Se usa igual que un gráfico de barras, para comparar valores entre categorías, pero con un aspecto más ligero.',
  'guide.lollipop.appearance': 'Desde una misma base, sale una línea fina para cada categoría. Termina en un punto redondo en su valor, como una piruleta en su palo.',

  'guide.manhattan.definition': 'Un gráfico de Manhattan muestra los resultados de analizar muchas posiciones a lo largo de un genoma, con un punto por posición.',
  'guide.manhattan.purpose': 'Se usa en genética para encontrar los pocos lugares muy relacionados con un rasgo o una enfermedad.',
  'guide.manhattan.appearance': 'Las posiciones van de izquierda a derecha, agrupadas por cromosoma en colores alternos. La altura muestra la fuerza de la señal. La mayoría de puntos quedan abajo, y unas pocas torres se elevan, como los rascacielos de Manhattan.',

  'guide.mosaic.definition': 'Un gráfico de mosaico muestra cómo se combinan dos categorías. Usa piezas cuya área corresponde a la parte de cada combinación.',
  'guide.mosaic.purpose': 'Sirve para explorar relaciones en una tabla de recuentos. Por ejemplo, la supervivencia según la clase del pasajero.',
  'guide.mosaic.appearance': 'Un rectángulo se divide en columnas, y el ancho de cada una corresponde al tamaño de cada grupo. Luego cada columna se divide de arriba abajo en piezas, y la altura de cada pieza corresponde a la parte de cada subgrupo.',

  'guide.network.definition': 'Un diagrama de red muestra elementos como puntos y las conexiones entre ellos como líneas.',
  'guide.network.purpose': 'Sirve para mostrar relaciones, como amistades entre personas o enlaces entre páginas web. También ayuda a encontrar los elementos más conectados.',
  'guide.network.appearance': 'Por la página hay pequeños círculos llamados nodos. Unas líneas llamadas enlaces unen parejas de nodos. Los elementos con muchas conexiones suelen quedar en el centro, con líneas que salen de ellos en todas direcciones.',

  'guide.stacked_normalized_bar.definition': 'Un gráfico de barras apiladas normalizadas muestra cada categoría como una barra de la misma longitud total, dividida en porcentajes.',
  'guide.stacked_normalized_bar.purpose': 'Sirve para comparar proporciones entre categorías. Por ejemplo, el peso de cada grupo de edad en varios países.',
  'guide.stacked_normalized_bar.appearance': 'Todas las barras miden lo mismo, que representa el 100 por ciento. Cada barra se divide en tramos de colores, uno tras otro. El tamaño de cada tramo es la parte que le corresponde.',

  'guide.stacked_normalized_area.definition': 'Un gráfico de áreas apiladas normalizadas muestra cómo cambia con el tiempo el reparto de un total entre varias partes.',
  'guide.stacked_normalized_area.purpose': 'Sirve para seguir proporciones en el tiempo. Por ejemplo, qué parte de la energía viene de cada fuente cada año.',
  'guide.stacked_normalized_area.appearance': 'El gráfico es un rectángulo completo, del 0 al 100 por ciento. Bandas de colores se apilan unas sobre otras y siempre lo llenan entero. Una banda se ensancha cuando su parte crece y se estrecha cuando disminuye.',

  'guide.parallel_coordinates.definition': 'Un gráfico de coordenadas paralelas muestra elementos con muchas medidas, con una línea por elemento.',
  'guide.parallel_coordinates.purpose': 'Sirve para comparar elementos en muchas variables a la vez y para encontrar grupos de elementos parecidos.',
  'guide.parallel_coordinates.appearance': 'Varios ejes verticales se colocan uno junto a otro, uno por medida. Cada elemento es una línea en zigzag que cruza cada eje en su valor para esa medida.',

  'guide.pie.definition': 'Un gráfico circular muestra cómo se reparte un total en partes, como porciones de un círculo.',
  'guide.pie.purpose': 'Sirve para mostrar partes de un total. Por ejemplo, cómo se reparte un presupuesto entre departamentos.',
  'guide.pie.appearance': 'Un círculo se corta en porciones desde el centro, como una tarta o una pizza. Cuanto mayor es la parte, más ancha es la porción. Todas juntas forman el círculo completo.',

  'guide.polar_area.definition': 'Un gráfico de área polar, también llamado gráfico de rosa, muestra valores como porciones del mismo ángulo que se alargan más o menos hacia fuera.',
  'guide.polar_area.purpose': 'Sirve para comparar valores en categorías que se repiten en ciclo, como los meses del año o los puntos cardinales.',
  'guide.polar_area.appearance': 'Las porciones se abren en abanico desde un centro común, todas con el mismo ángulo, como los pétalos de una flor. Cuanto más lejos del centro llega una porción, mayor es su valor.',

  'guide.radar.definition': 'Un gráfico de radar, también llamado gráfico de araña, muestra varias medidas de un elemento sobre ejes colocados en círculo.',
  'guide.radar.purpose': 'Sirve para comparar puntos fuertes y débiles en varias cualidades. Por ejemplo, las habilidades de un jugador.',
  'guide.radar.appearance': 'Desde un punto central salen radios, uno por medida, como los radios de una rueda. Cada valor es un punto sobre su radio, más lejos del centro cuanto más alto. Los puntos se unen en una figura cerrada, como una tela de araña.',

  'guide.ridgeline.definition': 'Un gráfico de crestas muestra la distribución de varios grupos con curvas suaves apiladas una encima de otra.',
  'guide.ridgeline.purpose': 'Sirve para comparar la forma de los datos en muchos grupos. Por ejemplo, las temperaturas de cada mes.',
  'guide.ridgeline.appearance': 'Cada grupo tiene una curva en forma de colina, más alta donde los valores son frecuentes. Las curvas se apilan hacia abajo, un poco solapadas, como una fila de crestas de montaña vistas a lo lejos.',

  'guide.roc.definition': 'Una curva ROC muestra lo bien que una prueba o un modelo de predicción separa dos resultados, como enfermo y sano.',
  'guide.roc.purpose': 'Sirve para evaluar un clasificador y elegir un umbral que equilibre acertar los casos reales y evitar falsas alarmas.',
  'guide.roc.appearance': 'Una curva sube desde la esquina inferior izquierda hasta la esquina superior derecha de un cuadrado. Una línea diagonal marca el acierto al azar. Cuanto más se acerca la curva a la esquina superior izquierda, mejor es el modelo.',

  'guide.rug.definition': 'Un gráfico de alfombra marca cada observación con una rayita corta a lo largo de un eje.',
  'guide.rug.purpose': 'Sirve para mostrar exactamente dónde cae cada valor y dónde se agrupan. A menudo acompaña a otro gráfico.',
  'guide.rug.appearance': 'En un borde del gráfico hay una fila de rayitas cortas, como los flecos de una alfombra. Cada rayita es un valor, y las zonas densas parecen cerdas apretadas.',

  'guide.sankey.definition': 'Un diagrama de Sankey muestra cómo fluye una cantidad de un grupo de etapas al siguiente.',
  'guide.sankey.purpose': 'Sirve para seguir de dónde vienen las cosas y adónde van. Por ejemplo, la energía desde sus fuentes hasta sus usos, o el dinero a través de un presupuesto.',
  'guide.sankey.appearance': 'Unos bloques llamados nodos se colocan en columnas de izquierda a derecha. Unas bandas fluyen de un nodo a otro. El ancho de cada banda muestra cuánto fluye por ella.',

  'guide.point.definition': 'Un diagrama de dispersión muestra la relación entre dos números, con un punto para cada elemento.',
  'guide.point.purpose': 'Sirve para ver si dos medidas están relacionadas, como la altura y el peso. También ayuda a encontrar grupos y puntos raros.',
  'guide.point.appearance': 'Los puntos se reparten por una superficie plana. La posición de izquierda a derecha de cada punto es un valor, y la posición de arriba abajo es el otro. Si los puntos forman una franja que sube, los dos valores suelen crecer juntos.',

  'guide.smooth.definition': 'Un gráfico de línea suavizada muestra una curva ajustada a los datos que indica su tendencia general.',
  'guide.smooth.purpose': 'Sirve para ver la dirección general de datos con mucho ruido, sin distraerse con cada subida y bajada.',
  'guide.smooth.appearance': 'Una sola curva suave va de izquierda a derecha por el medio de los datos. No toca todos los puntos. A menudo se dibuja sobre un diagrama de dispersión, a veces con una franja sombreada alrededor.',

  'guide.sunflower.definition': 'Un gráfico de girasol es un diagrama de dispersión en el que los puntos repetidos en el mismo lugar se dibujan como una sola marca con pétalos.',
  'guide.sunflower.purpose': 'Se usa cuando muchas observaciones tienen exactamente los mismos valores, para que no se oculte cuántas hay en cada lugar.',
  'guide.sunflower.appearance': 'Parece un diagrama de dispersión, pero de algunos puntos salen rayitas cortas, como los pétalos de una flor. El número de pétalos es el número de observaciones en ese lugar.',

  'guide.stacked_bar.definition': 'Un gráfico de barras apiladas muestra cada categoría como una barra formada por varias partes, una encima de otra.',
  'guide.stacked_bar.purpose': 'Sirve para mostrar el total de cada categoría y de qué partes se compone. Por ejemplo, las ventas totales divididas por producto.',
  'guide.stacked_bar.appearance': 'Las barras se colocan una junto a otra. Cada barra se divide en tramos de colores, uno encima de otro. La altura completa de la barra es el total, y cada tramo es una parte.',

  'guide.stacked_area.definition': 'Un gráfico de áreas apiladas muestra varias cantidades a lo largo del tiempo, una encima de otra.',
  'guide.stacked_area.purpose': 'Sirve para mostrar cómo cambia un total con el tiempo y cuánto aporta cada parte.',
  'guide.stacked_area.appearance': 'Bandas de colores se apilan desde abajo, cada una apoyada en la anterior. El borde superior de la banda más alta es el total. El grosor de cada banda es la cantidad de esa parte.',

  'guide.step.definition': 'Un gráfico de escalones es un gráfico de líneas que avanza en tramos planos en lugar de líneas inclinadas.',
  'guide.step.purpose': 'Sirve para valores que se mantienen igual un tiempo y luego saltan, como precios, tipos de interés o recuentos.',
  'guide.step.appearance': 'La línea va plana, luego sube o baja en vertical, y luego vuelve a ir plana, como una escalera vista de lado.',

  'guide.survival.definition': 'Una curva de supervivencia muestra, a medida que pasa el tiempo, qué parte de un grupo aún no ha vivido un suceso.',
  'guide.survival.purpose': 'Se usa en medicina e ingeniería para comparar cuánto duran personas o máquinas. Por ejemplo, pacientes con dos tratamientos distintos.',
  'guide.survival.appearance': 'La línea empieza arriba a la izquierda, en el 100 por ciento, y baja un escalón hacia la derecha cada vez que ocurre un suceso. Una curva que se mantiene alta más tiempo indica mejor supervivencia. Unas pequeñas marcas pueden señalar a personas que dejaron el estudio.',

  'guide.icicle.definition': 'Un gráfico de carámbanos muestra una jerarquía, como carpetas y archivos, en capas de rectángulos.',
  'guide.icicle.purpose': 'Sirve para ver cómo un total se divide en partes, y esas partes en otras más pequeñas.',
  'guide.icicle.appearance': 'El total es una barra larga en la parte de arriba. Debajo, se divide en las partes del siguiente nivel, y cada una se divide otra vez más abajo, como carámbanos de hielo colgando de un tejado. Las piezas más anchas son más grandes.',

  'guide.sunburst.definition': 'Un gráfico de rayos de sol muestra una jerarquía como anillos alrededor de un centro.',
  'guide.sunburst.purpose': 'Sirve para ver cómo un total se divide en partes en varios niveles. Por ejemplo, el presupuesto de una empresa por departamento y equipo.',
  'guide.sunburst.appearance': 'El círculo central es el total. Cada anillo hacia fuera es el nivel siguiente, cortado en arcos. Cada arco queda justo por fuera de su nivel superior, y los arcos más anchos son partes más grandes.',

  'guide.tree.definition': 'Un diagrama de árbol muestra una jerarquía con recuadros unidos por líneas, desde una raíz hasta sus ramas.',
  'guide.tree.purpose': 'Sirve para mostrar una estructura, como un organigrama, un árbol genealógico o una serie de decisiones.',
  'guide.tree.appearance': 'Un elemento está arriba o a la izquierda. De él salen líneas hacia sus hijos, y de estos salen otras hacia los suyos, como un árbol puesto del revés.',

  'guide.pack.definition': 'Un empaquetado de círculos muestra una jerarquía como círculos dentro de otros círculos.',
  'guide.pack.purpose': 'Sirve para mostrar grupos dentro de grupos y sus tamaños. Por ejemplo, países dentro de continentes.',
  'guide.pack.appearance': 'Un círculo grande contiene círculos más pequeños, que a su vez pueden contener otros aún más pequeños, como burbujas dentro de burbujas. El tamaño de cada círculo muestra su valor.',

  'guide.treemap.definition': 'Un mapa de árbol muestra una jerarquía como rectángulos anidados. El área de cada rectángulo corresponde a su valor.',
  'guide.treemap.purpose': 'Sirve para ver qué partes de un total son las más grandes. Por ejemplo, qué carpetas ocupan más espacio en el disco.',
  'guide.treemap.appearance': 'Un rectángulo grande está cubierto de rectángulos más pequeños, como una colcha de retales. Los valores mayores tienen piezas mayores. Las piezas del mismo grupo quedan juntas dentro de una pieza más grande.',

  'guide.violin_box.definition': 'Un gráfico de violín con caja es un diagrama de caja dibujado dentro de un gráfico de violín. Resume cada grupo con cinco valores.',
  'guide.violin_box.purpose': 'Sirve para leer el mínimo, el primer cuartil, la mediana, el tercer cuartil y el máximo de cada grupo, junto con la forma del violín.',
  'guide.violin_box.appearance': 'Dentro de cada violín hay una caja estrecha con una marca en el valor central. Unos bigotes finos se extienden hacia arriba y hacia abajo hasta los valores mínimo y máximo.',

  'guide.violin_kde.definition': 'Un gráfico de violín muestra la forma de los datos de un grupo con un contorno suave y simétrico.',
  'guide.violin_kde.purpose': 'Sirve para comparar la distribución de varios grupos. Muestra dónde los valores son frecuentes y dónde son raros.',
  'guide.violin_kde.appearance': 'Cada grupo tiene una figura ancha donde hay muchos valores y estrecha donde hay pocos. La figura es igual a los dos lados de una línea central, así que suele parecer un violín o un jarrón.',

  'guide.volcano.definition': 'Un gráfico de volcán muestra, para muchos elementos a la vez, el tamaño de un cambio y su significación estadística.',
  'guide.volcano.purpose': 'Se usa en biología para destacar genes o proteínas que cambian mucho y de forma fiable entre dos condiciones.',
  'guide.volcano.appearance': 'Los puntos forman una figura como un volcán en erupción. La posición de izquierda a derecha es el tamaño y el sentido del cambio, y la altura es la significación. Los elementos interesantes están en las esquinas superiores izquierda y derecha.',

  'guide.waterfall.definition': 'Un gráfico de cascada muestra cómo un valor inicial cambia con una serie de subidas y bajadas hasta llegar a un valor final.',
  'guide.waterfall.purpose': 'Sirve para explicar un total paso a paso. Por ejemplo, cómo los ingresos y los gastos dan como resultado el beneficio.',
  'guide.waterfall.appearance': 'La primera barra se apoya en la base. Cada barra siguiente flota: empieza donde acabó la anterior y sube si hay un aumento o baja si hay una disminución, como escalones. La última barra vuelve a apoyarse en la base y muestra el total final.',

  'guide.word_cloud.definition': 'Una nube de palabras muestra las palabras de un texto. Las palabras más frecuentes o importantes aparecen más grandes.',
  'guide.word_cloud.purpose': 'Sirve para hacerse una idea rápida de los temas principales de un texto, de respuestas a una encuesta o de mensajes en redes sociales.',
  'guide.word_cloud.appearance': 'Las palabras se juntan en un grupo, con tamaños distintos y a veces en distintas direcciones. Las palabras más grandes son las más frecuentes.',
} satisfies Partial<Record<MessageKey, string>>;
