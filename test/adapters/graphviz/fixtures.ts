/**
 * Graphviz drawings for the adapter's tests, rendered by Graphviz 16.1.0
 * (`@hpcc-js/wasm-graphviz`, the build Quarto and d3-graphviz use) from the
 * DOT shown above each one. Regenerate rather than edit: the point of these
 * is that Graphviz, not a test author, wrote them.
 */

/*
 * digraph Pipeline {
 *   label="Release pipeline";
 *   checkout [label="Check out"];
 *   build [label="Compile\nsources"];
 *   test [shape=diamond, label="Tests pass?"];
 *   ship; fix;
 *   done [shape=point];
 *   checkout -> build;
 *   build -> test;
 *   test -> ship [label="yes"];
 *   test -> fix [label="no"];
 *   fix -> build;
 *   ship -> done;
 * }
 */
export const pipeline = '<svg width="201pt" height="367pt"\n viewBox="0.00 0.00 201.00 367.00" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">\n<g id="graph0" class="graph" transform="scale(1 1) rotate(0) translate(4 363.03)">\n<title>Pipeline</title>\n<polygon fill="white" stroke="none" points="-4,4 -4,-363.03 197.43,-363.03 197.43,4 -4,4"/>\n<text xml:space="preserve" text-anchor="middle" x="96.72" y="-8.2" font-family="Times,serif" font-size="14.00">Release pipeline</text>\n<!-- checkout -->\n<g id="node1" class="node">\n<title>checkout</title>\n<ellipse fill="none" stroke="black" cx="129.43" cy="-341.03" rx="50.46" ry="18"/>\n<text xml:space="preserve" text-anchor="middle" x="129.43" y="-336.83" font-family="Times,serif" font-size="14.00">Check out</text>\n</g>\n<!-- build -->\n<g id="node2" class="node">\n<title>build</title>\n<ellipse fill="none" stroke="black" cx="129.43" cy="-256.62" rx="45.41" ry="29.42"/>\n<text xml:space="preserve" text-anchor="middle" x="129.43" y="-260.82" font-family="Times,serif" font-size="14.00">Compile</text>\n<text xml:space="preserve" text-anchor="middle" x="129.43" y="-244.02" font-family="Times,serif" font-size="14.00">sources</text>\n</g>\n<!-- checkout&#45;&gt;build -->\n<g id="edge1" class="edge">\n<title>checkout&#45;&gt;build</title>\n<path fill="none" stroke="black" d="M129.43,-322.55C129.43,-315.26 129.43,-306.46 129.43,-297.73"/>\n<polygon fill="black" stroke="black" points="132.93,-297.93 129.43,-287.93 125.93,-297.93 132.93,-297.93"/>\n</g>\n<!-- test -->\n<g id="node3" class="node">\n<title>test</title>\n<polygon fill="none" stroke="black" points="77.43,-190.2 0,-172.2 77.43,-154.2 154.86,-172.2 77.43,-190.2"/>\n<text xml:space="preserve" text-anchor="middle" x="77.43" y="-168" font-family="Times,serif" font-size="14.00">Tests pass?</text>\n</g>\n<!-- build&#45;&gt;test -->\n<g id="edge2" class="edge">\n<title>build&#45;&gt;test</title>\n<path fill="none" stroke="black" d="M112.69,-229.09C106.35,-219.03 99.15,-207.63 92.93,-197.76"/>\n<polygon fill="black" stroke="black" points="95.97,-196.02 87.67,-189.43 90.05,-199.75 95.97,-196.02"/>\n</g>\n<!-- ship -->\n<g id="node4" class="node">\n<title>ship</title>\n<ellipse fill="none" stroke="black" cx="77.43" cy="-83.4" rx="27.13" ry="18"/>\n<text xml:space="preserve" text-anchor="middle" x="77.43" y="-79.2" font-family="Times,serif" font-size="14.00">ship</text>\n</g>\n<!-- test&#45;&gt;ship -->\n<g id="edge3" class="edge">\n<title>test&#45;&gt;ship</title>\n<path fill="none" stroke="black" d="M77.43,-154.05C77.43,-142.36 77.43,-126.59 77.43,-113.02"/>\n<polygon fill="black" stroke="black" points="80.93,-113.32 77.43,-103.32 73.93,-113.32 80.93,-113.32"/>\n<text xml:space="preserve" text-anchor="middle" x="86.76" y="-123.6" font-family="Times,serif" font-size="14.00">yes</text>\n</g>\n<!-- fix -->\n<g id="node5" class="node">\n<title>fix</title>\n<ellipse fill="none" stroke="black" cx="166.43" cy="-83.4" rx="27" ry="18"/>\n<text xml:space="preserve" text-anchor="middle" x="166.43" y="-79.2" font-family="Times,serif" font-size="14.00">fix</text>\n</g>\n<!-- test&#45;&gt;fix -->\n<g id="edge4" class="edge">\n<title>test&#45;&gt;fix</title>\n<path fill="none" stroke="black" d="M91.73,-157.25C105.71,-143.62 127.21,-122.65 143.56,-106.71"/>\n<polygon fill="black" stroke="black" points="145.77,-109.43 150.49,-99.95 140.89,-104.42 145.77,-109.43"/>\n<text xml:space="preserve" text-anchor="middle" x="136.9" y="-123.6" font-family="Times,serif" font-size="14.00">no</text>\n</g>\n<!-- done -->\n<g id="node6" class="node">\n<title>done</title>\n<ellipse fill="black" stroke="black" cx="77.43" cy="-26.6" rx="1.8" ry="1.8"/>\n</g>\n<!-- ship&#45;&gt;done -->\n<g id="edge6" class="edge">\n<title>ship&#45;&gt;done</title>\n<path fill="none" stroke="black" d="M77.43,-65.06C77.43,-56.98 77.43,-47.54 77.43,-40.15"/>\n<polygon fill="black" stroke="black" points="80.93,-40.31 77.43,-30.31 73.93,-40.31 80.93,-40.31"/>\n</g>\n<!-- fix&#45;&gt;build -->\n<g id="edge5" class="edge">\n<title>fix&#45;&gt;build</title>\n<path fill="none" stroke="black" d="M168.27,-101.59C170.01,-122.8 171.32,-159.78 163.43,-190.2 160.89,-200.01 156.66,-210.01 152.04,-219.15"/>\n<polygon fill="black" stroke="black" points="149.09,-217.24 147.44,-227.7 155.26,-220.55 149.09,-217.24"/>\n</g>\n</g>\n</svg>\n';

/*
 * digraph {
 *   node [shape=record];
 *   "a->b" [label="<out> left|<in> right"];
 *   "c:d" [shape=box];
 *   e [URL="https://example.org", tooltip="Elsewhere"];
 *   "a->b":out -> "c:d":n;
 *   "c:d" -> e [headlabel="h", taillabel="t"];
 *   e -> e;
 * }
 */
export const tricky = '<svg width="95pt" height="190pt"\n viewBox="0.00 0.00 95.00 190.00" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">\n<g id="graph0" class="graph" transform="scale(1 1) rotate(0) translate(4 186)">\n<polygon fill="white" stroke="none" points="-4,4 -4,-186 90.55,-186 90.55,4 -4,4"/>\n<!-- a&#45;&gt;b -->\n<g id="node1" class="node">\n<title>a&#45;&gt;b</title>\n<polygon fill="none" stroke="black" points="9.45,-145.5 9.45,-181.5 86.55,-181.5 86.55,-145.5 9.45,-145.5"/>\n<text xml:space="preserve" text-anchor="middle" x="26.78" y="-159.3" font-family="Times,serif" font-size="14.00">left</text>\n<polyline fill="none" stroke="black" points="44.11,-145.5 44.11,-181.5"/>\n<text xml:space="preserve" text-anchor="middle" x="65.33" y="-159.3" font-family="Times,serif" font-size="14.00">right</text>\n</g>\n<!-- c:d -->\n<g id="node2" class="node">\n<title>c:d</title>\n<polygon fill="none" stroke="black" points="54,-109 0,-109 0,-73 54,-73 54,-109"/>\n<text xml:space="preserve" text-anchor="middle" x="27" y="-86.8" font-family="Times,serif" font-size="14.00">c:d</text>\n</g>\n<!-- a&#45;&gt;b&#45;&gt;c:d -->\n<g id="edge1" class="edge">\n<title>a&#45;&gt;b:out&#45;&gt;c:d:n</title>\n<path fill="none" stroke="black" d="M26.78,-145C26.78,-133.62 26.89,-128.32 26.96,-120.45"/>\n<polygon fill="black" stroke="black" points="30.45,-120.53 26.99,-110.51 23.46,-120.5 30.45,-120.53"/>\n</g>\n<!-- e -->\n<g id="node3" class="node">\n<title>e</title>\n<g id="a_node3"><a xlink:href="https://example.org" xlink:title="Elsewhere">\n<polygon fill="none" stroke="black" points="0,-0.5 0,-36.5 54,-36.5 54,-0.5 0,-0.5"/>\n<text xml:space="preserve" text-anchor="middle" x="26.61" y="-14.3" font-family="Times,serif" font-size="14.00">e</text>\n</a>\n</g>\n</g>\n<!-- c:d&#45;&gt;e -->\n<g id="edge2" class="edge">\n<title>c:d&#45;&gt;e</title>\n<path fill="none" stroke="black" d="M27,-72.57C27,-65.23 27,-56.49 27,-48.24"/>\n<polygon fill="black" stroke="black" points="30.5,-48.24 27,-38.24 23.5,-48.24 30.5,-48.24"/>\n<text xml:space="preserve" text-anchor="middle" x="23.5" y="-40.93" font-family="Times,serif" font-size="14.00">h</text>\n<text xml:space="preserve" text-anchor="middle" x="25.06" y="-59.97" font-family="Times,serif" font-size="14.00">t</text>\n</g>\n<!-- e&#45;&gt;e -->\n<g id="edge3" class="edge">\n<title>e&#45;&gt;e</title>\n<path fill="none" stroke="black" d="M54.24,-32.08C64.02,-32.37 72,-27.85 72,-18.5 72,-13.1 69.33,-9.3 65.19,-7.12"/>\n<polygon fill="black" stroke="black" points="66.22,-3.76 55.72,-5.22 64.84,-10.62 66.22,-3.76"/>\n</g>\n</g>\n</svg>\n';

/*
 * graph Friends {
 *   Ada -- Grace;
 *   Grace -- Alan;
 * }
 */
export const undirected = '<svg width="76pt" height="188pt"\n viewBox="0.00 0.00 76.00 188.00" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">\n<g id="graph0" class="graph" transform="scale(1 1) rotate(0) translate(4 184)">\n<title>Friends</title>\n<polygon fill="white" stroke="none" points="-4,4 -4,-184 72.17,-184 72.17,4 -4,4"/>\n<!-- Ada -->\n<g id="node1" class="node">\n<title>Ada</title>\n<ellipse fill="none" stroke="black" cx="34.08" cy="-162" rx="27.13" ry="18"/>\n<text xml:space="preserve" text-anchor="middle" x="34.08" y="-157.8" font-family="Times,serif" font-size="14.00">Ada</text>\n</g>\n<!-- Grace -->\n<g id="node2" class="node">\n<title>Grace</title>\n<ellipse fill="none" stroke="black" cx="34.08" cy="-90" rx="34.08" ry="18"/>\n<text xml:space="preserve" text-anchor="middle" x="34.08" y="-85.8" font-family="Times,serif" font-size="14.00">Grace</text>\n</g>\n<!-- Ada&#45;&#45;Grace -->\n<g id="edge1" class="edge">\n<title>Ada&#45;&#45;Grace</title>\n<path fill="none" stroke="black" d="M34.08,-143.7C34.08,-132.85 34.08,-118.92 34.08,-108.1"/>\n</g>\n<!-- Alan -->\n<g id="node3" class="node">\n<title>Alan</title>\n<ellipse fill="none" stroke="black" cx="34.08" cy="-18" rx="29.81" ry="18"/>\n<text xml:space="preserve" text-anchor="middle" x="34.08" y="-13.8" font-family="Times,serif" font-size="14.00">Alan</text>\n</g>\n<!-- Grace&#45;&#45;Alan -->\n<g id="edge2" class="edge">\n<title>Grace&#45;&#45;Alan</title>\n<path fill="none" stroke="black" d="M34.08,-71.7C34.08,-60.85 34.08,-46.92 34.08,-36.1"/>\n</g>\n</g>\n</svg>\n';

/*
 * digraph Empty {
 *   label="Nothing yet";
 * }
 */
export const empty = '<svg width="90pt" height="33pt"\n viewBox="0.00 0.00 90.00 33.00" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">\n<g id="graph0" class="graph" transform="scale(1 1) rotate(0) translate(4 28.8)">\n<title>Empty</title>\n<polygon fill="white" stroke="none" points="-4,4 -4,-28.8 86.49,-28.8 86.49,4 -4,4"/>\n<text xml:space="preserve" text-anchor="middle" x="41.25" y="-8.2" font-family="Times,serif" font-size="14.00">Nothing yet</text>\n</g>\n</svg>\n';
