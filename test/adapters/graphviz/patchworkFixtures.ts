/**
 * Graphviz drawings for the adapter's tests, rendered by Graphviz 16.1.0
 * (`@hpcc-js/wasm-graphviz`, the build Quarto and d3-graphviz use) from the
 * DOT shown above each one. Regenerate rather than edit: the point of these
 * is that Graphviz, not a test author, wrote them.
 */

/*
 * graph Disk {
 *   label="Disk use";
 *   subgraph cluster_home {
 *     docs [area=4];
 *     photos [area=9];
 *   }
 *   subgraph cluster_system {
 *     lib [area=3];
 *     bin [area=1];
 *   }
 *   tmp [area=2];
 * }
 */
export const disk = '<svg width="146pt" height="171pt"\n viewBox="0.00 0.00 146.00 171.00" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">\n<g id="graph0" class="graph" transform="scale(1 1) rotate(0) translate(4 166.64)">\n<title>Disk</title>\n<polygon fill="white" stroke="none" points="-4,4 -4,-166.64 141.84,-166.64 141.84,4 -4,4"/>\n<text xml:space="preserve" text-anchor="middle" x="68.92" y="-8.2" font-family="Times,serif" font-size="14.00">Disk use</text>\n<g id="clust1" class="cluster">\n<title>cluster_home</title>\n<polygon fill="none" stroke="black" points="0,-68.33 0,-162.64 137.84,-162.64 137.84,-68.33 0,-68.33"/>\n</g>\n<g id="clust2" class="cluster">\n<title>cluster_system</title>\n<polygon fill="none" stroke="black" points="0,-24.8 0,-68.33 91.89,-68.33 91.89,-24.8 0,-24.8"/>\n</g>\n<!-- docs -->\n<g id="node1" class="node">\n<title>docs</title>\n<polygon fill="none" stroke="black" points="137.84,-162.64 95.43,-162.64 95.43,-68.33 137.84,-68.33 137.84,-162.64"/>\n<text xml:space="preserve" text-anchor="middle" x="116.63" y="-111.28" font-family="Times,serif" font-size="14.00">docs</text>\n</g>\n<!-- photos -->\n<g id="node2" class="node">\n<title>photos</title>\n<polygon fill="none" stroke="black" points="95.43,-162.64 0,-162.64 0,-68.33 95.43,-68.33 95.43,-162.64"/>\n<text xml:space="preserve" text-anchor="middle" x="47.71" y="-111.28" font-family="Times,serif" font-size="14.00">photos</text>\n</g>\n<!-- lib -->\n<g id="node3" class="node">\n<title>lib</title>\n<polygon fill="none" stroke="black" points="68.92,-68.33 0,-68.33 0,-24.8 68.92,-24.8 68.92,-68.33"/>\n<text xml:space="preserve" text-anchor="middle" x="34.46" y="-42.36" font-family="Times,serif" font-size="14.00">lib</text>\n</g>\n<!-- bin -->\n<g id="node4" class="node">\n<title>bin</title>\n<polygon fill="none" stroke="black" points="91.89,-68.33 68.92,-68.33 68.92,-24.8 91.89,-24.8 91.89,-68.33"/>\n<text xml:space="preserve" text-anchor="middle" x="80.41" y="-42.36" font-family="Times,serif" font-size="14.00">bin</text>\n</g>\n<!-- tmp -->\n<g id="node5" class="node">\n<title>tmp</title>\n<polygon fill="none" stroke="black" points="137.84,-68.33 91.89,-68.33 91.89,-24.8 137.84,-24.8 137.84,-68.33"/>\n<text xml:space="preserve" text-anchor="middle" x="114.87" y="-42.36" font-family="Times,serif" font-size="14.00">tmp</text>\n</g>\n</g>\n</svg>\n';
