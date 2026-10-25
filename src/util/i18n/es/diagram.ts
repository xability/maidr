import type { MessageKey } from '../index';

/** Spanish renderings of the diagrams MAIDR names and explains. */
export const diagram = {
  'diagram.flowchart.name': 'Diagrama de flujo',
  'diagram.flowchart.definition': 'Un diagrama de flujo muestra los pasos de un proceso como formas unidas por flechas, en el orden en que ocurren.',
  'diagram.flowchart.purpose': 'Se usa para mostrar cómo avanza un proceso de principio a fin, como la gestión de un pedido, con las decisiones que lo llevan por un camino u otro y los pasos a los que vuelve.',
  'diagram.flowchart.appearance': 'Cada paso es un recuadro u otra forma, como un rombo para una decisión. Las flechas van de un paso a otro, normalmente de arriba abajo o de izquierda a derecha, y una flecha puede llevar escrita la respuesta que conduce por ella, como sí o no. Los pasos relacionados pueden dibujarse dentro de un recuadro mayor llamado subgrafo.',

  'diagram.swimlane.name': 'Diagrama de carriles',
  'diagram.swimlane.definition': 'Un diagrama de carriles es un diagrama de flujo cuyos pasos se reparten en carriles, uno por cada persona, equipo o sistema que los lleva a cabo.',
  'diagram.swimlane.purpose': 'Se usa para mostrar quién hace qué en un proceso y en qué punto el trabajo pasa de uno a otro.',
  'diagram.swimlane.appearance': 'Unas franjas largas llamadas carriles se extienden una junto a otra, a lo ancho o a lo alto de la página, cada una con el nombre de su responsable. Cada paso es un recuadro dentro de su carril, y las flechas van de un paso a otro, cruzando de un carril a otro en cada traspaso.',

  'diagram.agent_flow.name': 'Flujo de agente',
  'diagram.agent_flow.definition': 'Un flujo de agente muestra los pasos que da un agente de IA para hacer una tarea, como las entradas que lee, las tareas que realiza, las herramientas que llama y las decisiones que toma, en el orden en que los da.',
  'diagram.agent_flow.purpose': 'Se usa para diseñar o explicar cómo un agente resuelve una tarea, como revisar un cambio de código, y dónde se divide su camino ante una decisión.',
  'diagram.agent_flow.appearance': 'Cada paso se dibuja con una forma según su tipo, como un rombo para una decisión, dentro de un recuadro que representa el flujo al que pertenece. Las flechas van de un paso a otro, y una flecha que sale de una decisión lleva escrita la respuesta que conduce por ella.',

  'diagram.state.name': 'Diagrama de estados',
  'diagram.state.definition': 'Un diagrama de estados muestra los estados en que puede estar algo y los eventos que lo hacen pasar de un estado a otro.',
  'diagram.state.purpose': 'Se usa para describir cómo se comporta un sistema, como un reproductor multimedia que puede estar inactivo, reproduciendo o en pausa, y qué lo hace cambiar.',
  'diagram.state.appearance': 'Cada estado es un recuadro de esquinas redondeadas, y las flechas entre estados llevan escrito el evento que causa el cambio. Un punto relleno marca dónde empieza y un punto dentro de un anillo dónde termina, y un estado puede contener estados más pequeños dentro de su propio recuadro.',

  'diagram.class.name': 'Diagrama de clases',
  'diagram.class.definition': 'Un diagrama de clases muestra las clases de un programa, qué contiene y qué hace cada una, y cómo se relacionan entre sí.',
  'diagram.class.purpose': 'Se usa para diseñar o documentar la estructura de un software, como qué clases heredan de otras y cuáles se componen de otras.',
  'diagram.class.appearance': 'Cada clase es un recuadro dividido en tres partes: su nombre arriba, sus atributos en el centro y sus métodos abajo. Unas líneas unen las clases relacionadas, y el extremo de cada línea indica el tipo de relación, como un triángulo hueco junto a la clase de la que se hereda, o un rombo junto a la clase que contiene a la otra.',

  'diagram.entity_relationship.name': 'Diagrama entidad-relación',
  'diagram.entity_relationship.definition': 'Un diagrama entidad-relación muestra los tipos de cosas que registra una base de datos, llamados entidades, y cómo se relacionan.',
  'diagram.entity_relationship.purpose': 'Se usa para diseñar o documentar una base de datos, como cuántos pedidos puede hacer cada cliente y qué contiene cada pedido.',
  'diagram.entity_relationship.appearance': 'Cada entidad es un recuadro encabezado por su nombre, a menudo con una tabla de sus atributos debajo. Unas líneas unen las entidades relacionadas, rotuladas con un verbo como «realiza», y las marcas en cada extremo de una línea indican cuántas instancias de esa entidad participan, como exactamente una, o cero o más.',

  'diagram.requirement.name': 'Diagrama de requisitos',
  'diagram.requirement.definition': 'Un diagrama de requisitos muestra lo que un sistema debe hacer, en forma de requisitos, y las partes del sistema que los cumplen o los comprueban.',
  'diagram.requirement.purpose': 'Se usa en ingeniería de sistemas para relacionar cada requisito con los requisitos que contiene, los elementos que lo satisfacen y la forma en que se verifica.',
  'diagram.requirement.appearance': 'Cada requisito o elemento es un recuadro encabezado por su tipo y su nombre, con detalles como su id, su texto y su riesgo. Las líneas entre los recuadros llevan escrita la relación, como contains o satisfies.',

  'diagram.use_case.name': 'Diagrama de casos de uso',
  'diagram.use_case.definition': 'Un diagrama de casos de uso muestra las personas u otros sistemas que usan un sistema, llamados actores, y las acciones que pueden realizar con él, llamadas casos de uso.',
  'diagram.use_case.purpose': 'Se usa para acordar qué debe ofrecer un sistema y a quién, como lo que pueden hacer un cliente y un dependiente en una tienda.',
  'diagram.use_case.appearance': 'Los actores son figuras de palitos fuera de un gran recuadro que representa el sistema. Los casos de uso son óvalos dentro del recuadro, y unas líneas unen cada actor con los casos de uso en los que participa.',

  'diagram.c4.name': 'Diagrama C4',
  'diagram.c4_context.name': 'Diagrama de contexto C4',
  'diagram.c4_container.name': 'Diagrama de contenedores C4',
  'diagram.c4_component.name': 'Diagrama de componentes C4',
  'diagram.c4_dynamic.name': 'Diagrama dinámico C4',
  'diagram.c4_deployment.name': 'Diagrama de despliegue C4',
  'diagram.c4.definition': 'Un diagrama C4 muestra un sistema de software con un nivel de detalle concreto, como el sistema entre las personas y los sistemas que lo rodean, o los contenedores o componentes que tiene dentro, y cómo se usan sus partes entre sí.',
  'diagram.c4.purpose': 'Se usa para explicar una arquitectura de software, como con qué personas y otros sistemas trabaja un sistema bancario, con el nivel de detalle que necesitan sus lectores.',
  'diagram.c4.appearance': 'Cada persona, sistema, contenedor o componente es un recuadro con su nombre, su tipo y una breve descripción; una persona tiene una cabeza redonda sobre el recuadro, y una base de datos es un cilindro. Unos límites discontinuos agrupan las partes relacionadas, y las flechas entre ellas llevan escrito lo que una hace con la otra y la tecnología que usa.',

  'diagram.block.name': 'Diagrama de bloques',
  'diagram.block.definition': 'Un diagrama de bloques muestra las partes de un sistema como bloques dispuestos en filas y columnas, con flechas que indican cómo se conectan.',
  'diagram.block.purpose': 'Se usa para dar una visión sencilla de un sistema y de dónde pasan los datos o el control de una parte a otra, como de un cliente a un servidor y a su almacenamiento.',
  'diagram.block.appearance': 'Los bloques son recuadros colocados en una cuadrícula de columnas, y un bloque mayor puede contener otros más pequeños. Las flechas unen los bloques, y un bloque puede dibujarse él mismo como una flecha que apunta hacia donde se mueve algo.',

  'diagram.architecture.name': 'Diagrama de arquitectura',
  'diagram.architecture.definition': 'Un diagrama de arquitectura muestra los servicios que forman un sistema, como servidores, bases de datos y almacenamiento, y las conexiones entre ellos.',
  'diagram.architecture.purpose': 'Se usa para mostrar cómo está montado un sistema, a menudo en la nube, y qué servicios se comunican con cuáles.',
  'diagram.architecture.appearance': 'Cada servicio es un icono con su nombre debajo, y los servicios relacionados se agrupan dentro de un recuadro discontinuo para su grupo. Unas líneas unen los servicios conectados, con una punta de flecha donde la conexión va en un solo sentido.',

  'diagram.git_graph.name': 'Grafo de Git',
  'diagram.git_graph.definition': 'Un grafo de Git muestra la historia de un repositorio de código: sus commits en orden, la rama en la que se hizo cada uno y dónde se separan las ramas y se vuelven a fusionar.',
  'diagram.git_graph.purpose': 'Se usa para explicar un flujo de trabajo con ramas, como desarrollar una funcionalidad en su propia rama y fusionarla con la principal.',
  'diagram.git_graph.appearance': 'Cada rama es una línea que cruza la página, una encima de otra, con su nombre al principio. Los commits son puntos a lo largo de las líneas en el orden en que se hicieron; una línea se curva hacia fuera donde empieza una rama y vuelve donde se fusiona, y una etiqueta es un rótulo sobre su commit.',

  'diagram.event_model.name': 'Modelo de eventos',
  'diagram.event_model.definition': 'Un modelo de eventos muestra cómo se mueve la información por un sistema a lo largo del tiempo: lo que ve un usuario, los comandos que da, los eventos que registran esos comandos y las vistas que se leen a partir de ellos.',
  'diagram.event_model.purpose': 'Se usa para diseñar un sistema en torno a los eventos que registra, como un artículo añadido a un carrito de la compra, siguiendo cada paso de la pantalla al comando y del comando al evento.',
  'diagram.event_model.appearance': 'Los recuadros se colocan en carriles que cruzan la página: uno para pantallas y automatizaciones, uno para comandos y modelos de lectura, y uno para cada flujo de eventos. El tiempo avanza de izquierda a derecha, y las flechas van de cada recuadro al paso siguiente.',

  'diagram.mindmap.name': 'Mapa mental',
  'diagram.mindmap.definition': 'Un mapa mental muestra ideas que se ramifican a partir de un tema central, y cada rama reúne ideas relacionadas.',
  'diagram.mindmap.purpose': 'Se usa para generar ideas, tomar notas u organizar un tema, como las formas de hacer accesible un gráfico.',
  'diagram.mindmap.appearance': 'El tema central está en el medio, a menudo dentro de un círculo. De él salen ramas en todas direcciones, cada una terminada en un subtema, y de cada subtema salen ramas más pequeñas hacia las ideas que dependen de él.',

  'diagram.kanban.name': 'Tablero kanban',
  'diagram.kanban.definition': 'Un tablero kanban muestra el trabajo como tarjetas repartidas en columnas, una columna por cada etapa del trabajo.',
  'diagram.kanban.purpose': 'Se usa para seguir el avance de las tareas, como cuáles están pendientes, cuáles en curso y cuáles terminadas.',
  'diagram.kanban.appearance': 'Las columnas están una junto a otra, cada una encabezada por su etapa, con tarjetas apiladas hacia abajo. Una tarjeta muestra su tarea y puede mostrar un número de ticket, la persona a la que está asignada y una marca de prioridad.',

  'diagram.tree_view.name': 'Vista de árbol',
  'diagram.tree_view.definition': 'Una vista de árbol muestra una jerarquía como una lista con sangrías, como las carpetas y archivos de un proyecto.',
  'diagram.tree_view.purpose': 'Se usa para mostrar cómo están anidados los elementos, como qué archivos hay en qué carpetas.',
  'diagram.tree_view.appearance': 'El elemento superior está en la primera línea, y los elementos que contiene cada uno se listan debajo, cada uno con un nivel más de sangría. Unas líneas cortas unen cada elemento con aquel en el que está.',

  'diagram.ishikawa.name': 'Diagrama de Ishikawa',
  'diagram.ishikawa.definition': 'Un diagrama de Ishikawa, también llamado diagrama de espina de pescado, muestra las posibles causas de un problema agrupadas en categorías.',
  'diagram.ishikawa.purpose': 'Se usa para buscar la causa raíz de un problema, como una foto borrosa, enumerando todas las causas probables bajo encabezados como equipo o proceso.',
  'diagram.ishikawa.appearance': 'El problema está escrito en la cabeza de un esqueleto de pez, en un extremo de una larga espina. De la espina salen huesos inclinados que terminan cada uno en una categoría; de cada hueso salen causas, y de estas, causas más pequeñas.',

  'diagram.timeline.name': 'Línea de tiempo',
  'diagram.timeline.definition': 'Una línea de tiempo muestra acontecimientos a lo largo del tiempo, agrupados por el período al que pertenecen.',
  'diagram.timeline.purpose': 'Se usa para contar de un vistazo la historia de algo, como los hitos de los estándares de accesibilidad web.',
  'diagram.timeline.appearance': 'Los períodos, como los años, son recuadros en fila de izquierda a derecha sobre una línea con una flecha que representa el tiempo, y pueden agruparse bajo encabezados de sección situados encima. Los acontecimientos de cada período son recuadros apilados debajo de él.',

  'diagram.railroad.name': 'Diagrama de ferrocarril',
  'diagram.railroad.definition': 'Un diagrama de ferrocarril, también llamado diagrama sintáctico, muestra las reglas de una gramática como vías que se recorren de principio a fin.',
  'diagram.railroad.purpose': 'Se usa para documentar lo que acepta un lenguaje, como la forma de escribir un número con signo.',
  'diagram.railroad.appearance': 'Cada regla es una vía que va de un punto a la izquierda a un punto a la derecha, pasando por recuadros para las palabras, los símbolos y las otras reglas que la forman. Donde la vía se bifurca se puede tomar cualquiera de las ramas; un bucle hacia atrás significa que una parte puede repetirse, y un camino que rodea una parte significa que puede omitirse.',

  'diagram.cynefin.name': 'Marco Cynefin',
  'diagram.cynefin.definition': 'El marco Cynefin clasifica las situaciones en cinco dominios según la claridad con que se ven la causa y el efecto: claro (clear), complicado (complicated), complejo (complex) y caótico (chaotic), más la confusión (confusion) mientras aún no se sabe cuál de ellos se aplica.',
  'diagram.cynefin.purpose': 'Se usa para decidir cómo responder a una situación, como un incidente, situándola en un dominio y adoptando el enfoque que ese dominio requiere.',
  'diagram.cynefin.appearance': 'Cuatro dominios ocupan los cuartos de un cuadrado: complejo arriba a la izquierda, complicado arriba a la derecha, caótico abajo a la izquierda y claro abajo a la derecha, con la confusión en un óvalo en el centro. Cada dominio indica su enfoque bajo su título, los elementos situados en él son recuadros y las flechas entre dominios marcan transiciones.',

  'diagram.quadrant.name': 'Gráfico de cuadrantes',
  'diagram.quadrant.definition': 'Un gráfico de cuadrantes sitúa elementos sobre dos escalas y divide el área en cuatro cuartos, cada uno con su propio significado.',
  'diagram.quadrant.purpose': 'Se usa para clasificar o priorizar elementos, como campañas según su alcance y su interacción, por el cuarto en el que cae cada uno.',
  'diagram.quadrant.appearance': 'Un cuadrado se divide en cuatro cuadrantes, cada uno rotulado con su significado; una escala va de izquierda a derecha y la otra de abajo arriba. Cada elemento es un punto colocado según sus dos valores y rotulado con su nombre.',

  'diagram.user_journey.name': 'Recorrido del usuario',
  'diagram.user_journey.definition': 'Un recorrido del usuario muestra las tareas por las que pasa una persona para alcanzar un objetivo y lo satisfecha que está en cada una.',
  'diagram.user_journey.purpose': 'Se usa para encontrar los buenos y malos momentos de una experiencia, como una jornada de trabajo, para poder mejorar los malos.',
  'diagram.user_journey.appearance': 'Las tareas son recuadros en fila de izquierda a derecha, agrupados bajo encabezados de sección, con un pequeño punto en cada tarea por cada persona que participa. Debajo hay una cara por tarea, dibujada más arriba y sonriente para una buena puntuación y más abajo y con el ceño fruncido para una mala.',

  'diagram.packet.name': 'Diagrama de paquete de red',
  'diagram.packet.definition': 'Un diagrama de paquete de red muestra la estructura de un paquete de red u otro bloque de datos como campos de bits en orden.',
  'diagram.packet.purpose': 'Se usa para documentar un formato de datos o un protocolo, como qué bits de una cabecera UDP contienen los puertos, la longitud y la suma de comprobación.',
  'diagram.packet.appearance': 'Los bits se numeran de izquierda a derecha en filas de longitud fija, normalmente 32. Cada campo es un recuadro tan ancho como los bits que ocupa, rotulado con su nombre, con su primer y su último bit numerados encima.',

  'diagram.wardley_map.name': 'Mapa de Wardley',
  'diagram.wardley_map.definition': 'Un mapa de Wardley sitúa los componentes que satisfacen una necesidad del usuario sobre dos escalas: lo visibles que son para el usuario y lo evolucionados que están, de nuevos e inciertos a estándar y fiables.',
  'diagram.wardley_map.purpose': 'Se usa para planificar una estrategia, como qué construir y qué comprar, viendo cómo dependen los componentes unos de otros y cómo cambiarán.',
  'diagram.wardley_map.appearance': 'La visibilidad va de abajo arriba y la evolución de izquierda a derecha, pasando por las etapas génesis (genesis), a medida (custom built), producto (product) y mercancía (commodity). Cada componente es un punto con su nombre, unas líneas unen cada componente con aquellos de los que depende, y una flecha señala hacia dónde se dirige un componente que evoluciona.',
} satisfies Partial<Record<MessageKey, string>>;
