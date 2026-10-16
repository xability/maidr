/**
 * Graphviz drawings for the adapter's tests, rendered by Graphviz 16.1.0
 * (`@hpcc-js/wasm-graphviz`, the build Quarto and d3-graphviz use) from the
 * DOT shown above each one. Regenerate rather than edit: the point of these
 * is that Graphviz, not a test author, wrote them.
 */

/*
 * graph Friends {
 *   label="Who knows whom";
 *   ada [label="Ada"];
 *   grace [label="Grace"];
 *   alan [label="Alan"];
 *   edsger [label="Edsger"];
 *   barbara [label="Barbara"];
 *   loner [label="Loner"];
 *   ada -- grace;
 *   grace -- alan;
 *   alan -- ada;
 *   edsger -- barbara;
 *   barbara -- barbara;
 * }
 */
export const friends = '<svg width="316pt" height="213pt"\n viewBox="0.00 0.00 316.00 213.00" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">\n<g id="graph0" class="graph" transform="scale(1 1) rotate(0) translate(4 208.8)">\n<title>Friends</title>\n<polygon fill="white" stroke="none" points="-4,4 -4,-208.8 312.18,-208.8 312.18,4 -4,4"/>\n<text xml:space="preserve" text-anchor="middle" x="154.09" y="-8.2" font-family="Times,serif" font-size="14.00">Who knows whom</text>\n<!-- ada -->\n<g id="node1" class="node">\n<title>ada</title>\n<ellipse fill="none" stroke="black" cx="77.08" cy="-186.8" rx="27.13" ry="18"/>\n<text xml:space="preserve" text-anchor="middle" x="77.08" y="-182.6" font-family="Times,serif" font-size="14.00">Ada</text>\n</g>\n<!-- grace -->\n<g id="node2" class="node">\n<title>grace</title>\n<ellipse fill="none" stroke="black" cx="34.08" cy="-114.8" rx="34.08" ry="18"/>\n<text xml:space="preserve" text-anchor="middle" x="34.08" y="-110.6" font-family="Times,serif" font-size="14.00">Grace</text>\n</g>\n<!-- ada&#45;&#45;grace -->\n<g id="edge1" class="edge">\n<title>ada&#45;&#45;grace</title>\n<path fill="none" stroke="black" d="M67.11,-169.56C60.26,-158.42 51.2,-143.67 44.3,-132.43"/>\n</g>\n<!-- alan -->\n<g id="node3" class="node">\n<title>alan</title>\n<ellipse fill="none" stroke="black" cx="65.08" cy="-42.8" rx="29.81" ry="18"/>\n<text xml:space="preserve" text-anchor="middle" x="65.08" y="-38.6" font-family="Times,serif" font-size="14.00">Alan</text>\n</g>\n<!-- grace&#45;&#45;alan -->\n<g id="edge2" class="edge">\n<title>grace&#45;&#45;alan</title>\n<path fill="none" stroke="black" d="M41.59,-96.85C46.46,-85.85 52.79,-71.56 57.65,-60.59"/>\n</g>\n<!-- alan&#45;&#45;ada -->\n<g id="edge3" class="edge">\n<title>alan&#45;&#45;ada</title>\n<path fill="none" stroke="black" d="M69.95,-60.82C72.65,-71.13 75.72,-84.61 77.08,-96.8 79.85,-121.52 79.14,-150.35 78.23,-168.34"/>\n</g>\n<!-- edsger -->\n<g id="node4" class="node">\n<title>edsger</title>\n<ellipse fill="none" stroke="black" cx="184.08" cy="-186.8" rx="37.85" ry="18"/>\n<text xml:space="preserve" text-anchor="middle" x="184.08" y="-182.6" font-family="Times,serif" font-size="14.00">Edsger</text>\n</g>\n<!-- barbara -->\n<g id="node5" class="node">\n<title>barbara</title>\n<ellipse fill="none" stroke="black" cx="184.08" cy="-114.8" rx="41.6" ry="18"/>\n<text xml:space="preserve" text-anchor="middle" x="184.08" y="-110.6" font-family="Times,serif" font-size="14.00">Barbara</text>\n</g>\n<!-- edsger&#45;&#45;barbara -->\n<g id="edge4" class="edge">\n<title>edsger&#45;&#45;barbara</title>\n<path fill="none" stroke="black" d="M184.08,-168.5C184.08,-157.65 184.08,-143.72 184.08,-132.9"/>\n</g>\n<!-- barbara&#45;&#45;barbara -->\n<g id="edge5" class="edge">\n<title>barbara&#45;&#45;barbara</title>\n<path fill="none" stroke="black" d="M213.83,-127.79C229.49,-129.89 243.68,-125.56 243.68,-114.8 243.68,-104.04 229.49,-99.71 213.83,-101.81"/>\n</g>\n<!-- loner -->\n<g id="node6" class="node">\n<title>loner</title>\n<ellipse fill="none" stroke="black" cx="274.08" cy="-186.8" rx="34.09" ry="18"/>\n<text xml:space="preserve" text-anchor="middle" x="274.08" y="-182.6" font-family="Times,serif" font-size="14.00">Loner</text>\n</g>\n</g>\n</svg>\n';

/*
 * graph {
 *   a [label="Server"];
 *   b [label="Server"];
 *   c [label="Switch"];
 *   a -- c;
 *   b -- c;
 * }
 */
export const twins = '<svg width="170pt" height="116pt"\n viewBox="0.00 0.00 170.00 116.00" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">\n<g id="graph0" class="graph" transform="scale(1 1) rotate(0) translate(4 112)">\n<polygon fill="white" stroke="none" points="-4,4 -4,-112 166.48,-112 166.48,4 -4,4"/>\n<!-- a -->\n<g id="node1" class="node">\n<title>a</title>\n<ellipse fill="none" stroke="black" cx="36.24" cy="-90" rx="36.24" ry="18"/>\n<text xml:space="preserve" text-anchor="middle" x="36.24" y="-85.8" font-family="Times,serif" font-size="14.00">Server</text>\n</g>\n<!-- c -->\n<g id="node3" class="node">\n<title>c</title>\n<ellipse fill="none" stroke="black" cx="81.24" cy="-18" rx="37.86" ry="18"/>\n<text xml:space="preserve" text-anchor="middle" x="81.24" y="-13.8" font-family="Times,serif" font-size="14.00">Switch</text>\n</g>\n<!-- a&#45;&#45;c -->\n<g id="edge1" class="edge">\n<title>a&#45;&#45;c</title>\n<path fill="none" stroke="black" d="M46.9,-72.41C54.08,-61.25 63.49,-46.6 70.65,-35.47"/>\n</g>\n<!-- b -->\n<g id="node2" class="node">\n<title>b</title>\n<ellipse fill="none" stroke="black" cx="126.24" cy="-90" rx="36.24" ry="18"/>\n<text xml:space="preserve" text-anchor="middle" x="126.24" y="-85.8" font-family="Times,serif" font-size="14.00">Server</text>\n</g>\n<!-- b&#45;&#45;c -->\n<g id="edge2" class="edge">\n<title>b&#45;&#45;c</title>\n<path fill="none" stroke="black" d="M115.58,-72.41C108.4,-61.25 98.98,-46.6 91.83,-35.47"/>\n</g>\n</g>\n</svg>\n';
