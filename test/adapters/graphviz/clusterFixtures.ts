/**
 * Graphviz drawings for the adapter's tests, rendered by Graphviz 16.1.0
 * (`@hpcc-js/wasm-graphviz`, the build Quarto and d3-graphviz use) from the
 * DOT shown above each one. Regenerate rather than edit: the point of these
 * is that Graphviz, not a test author, wrote them.
 */

/*
 * digraph Services {
 *   label="Checkout service";
 *   user [label="Browser"];
 *   subgraph cluster_backend {
 *     label="Backend";
 *     api [label="API"];
 *     subgraph cluster_data {
 *       label="Data";
 *       style=rounded;
 *       db [label="Orders DB"];
 *       cache [label="Cache"];
 *     }
 *   }
 *   subgraph cluster_queue {
 *     label="";
 *     worker [label="Worker"];
 *   }
 *   user -> api;
 *   api -> cache [label="read"];
 *   api -> db [label="write"];
 *   db -> worker;
 * }
 */
export const services = '<svg width="250pt" height="371pt"\n viewBox="0.00 0.00 250.00 371.00" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">\n<g id="graph0" class="graph" transform="scale(1 1) rotate(0) translate(4 367.2)">\n<title>Services</title>\n<polygon fill="white" stroke="none" points="-4,4 -4,-367.2 246,-367.2 246,4 -4,4"/>\n<text xml:space="preserve" text-anchor="middle" x="121" y="-8.2" font-family="Times,serif" font-size="14.00">Checkout service</text>\n<g id="clust1" class="cluster">\n<title>cluster_backend</title>\n<polygon fill="none" stroke="black" points="8,-103.8 8,-300.2 234,-300.2 234,-103.8 8,-103.8"/>\n<text xml:space="preserve" text-anchor="middle" x="121" y="-283.6" font-family="Times,serif" font-size="14.00">Backend</text>\n</g>\n<g id="clust2" class="cluster">\n<title>cluster_data</title>\n<path fill="none" stroke="black" d="M28,-111.8C28,-111.8 214,-111.8 214,-111.8 220,-111.8 226,-117.8 226,-123.8 226,-123.8 226,-176.6 226,-176.6 226,-182.6 220,-188.6 214,-188.6 214,-188.6 28,-188.6 28,-188.6 22,-188.6 16,-182.6 16,-176.6 16,-176.6 16,-123.8 16,-123.8 16,-117.8 22,-111.8 28,-111.8"/>\n<text xml:space="preserve" text-anchor="middle" x="121" y="-172" font-family="Times,serif" font-size="14.00">Data</text>\n</g>\n<g id="clust3" class="cluster">\n<title>cluster_queue</title>\n<polygon fill="none" stroke="black" points="28,-32.8 28,-84.8 126,-84.8 126,-32.8 28,-32.8"/>\n</g>\n<!-- user -->\n<g id="node1" class="node">\n<title>user</title>\n<ellipse fill="none" stroke="black" cx="116" cy="-345.2" rx="43.76" ry="18"/>\n<text xml:space="preserve" text-anchor="middle" x="116" y="-341" font-family="Times,serif" font-size="14.00">Browser</text>\n</g>\n<!-- api -->\n<g id="node2" class="node">\n<title>api</title>\n<ellipse fill="none" stroke="black" cx="116" cy="-249.4" rx="27" ry="18"/>\n<text xml:space="preserve" text-anchor="middle" x="116" y="-245.2" font-family="Times,serif" font-size="14.00">API</text>\n</g>\n<!-- user&#45;&gt;api -->\n<g id="edge1" class="edge">\n<title>user&#45;&gt;api</title>\n<path fill="none" stroke="black" d="M116,-327C116,-313.59 116,-294.69 116,-279.02"/>\n<polygon fill="black" stroke="black" points="119.5,-279.33 116,-269.33 112.5,-279.33 119.5,-279.33"/>\n</g>\n<!-- db -->\n<g id="node3" class="node">\n<title>db</title>\n<ellipse fill="none" stroke="black" cx="77" cy="-137.8" rx="53.14" ry="18"/>\n<text xml:space="preserve" text-anchor="middle" x="77" y="-133.6" font-family="Times,serif" font-size="14.00">Orders DB</text>\n</g>\n<!-- api&#45;&gt;db -->\n<g id="edge3" class="edge">\n<title>api&#45;&gt;db</title>\n<path fill="none" stroke="black" d="M110.08,-231.75C103.93,-214.47 94.2,-187.15 86.89,-166.58"/>\n<polygon fill="black" stroke="black" points="90.27,-165.64 83.62,-157.39 83.67,-167.99 90.27,-165.64"/>\n<text xml:space="preserve" text-anchor="middle" x="117.77" y="-200.8" font-family="Times,serif" font-size="14.00">write</text>\n</g>\n<!-- cache -->\n<g id="node4" class="node">\n<title>cache</title>\n<ellipse fill="none" stroke="black" cx="183" cy="-137.8" rx="35.16" ry="18"/>\n<text xml:space="preserve" text-anchor="middle" x="183" y="-133.6" font-family="Times,serif" font-size="14.00">Cache</text>\n</g>\n<!-- api&#45;&gt;cache -->\n<g id="edge2" class="edge">\n<title>api&#45;&gt;cache</title>\n<path fill="none" stroke="black" d="M125.89,-232.23C136.71,-214.52 154.22,-185.87 167.01,-164.96"/>\n<polygon fill="black" stroke="black" points="169.83,-167.05 172.06,-156.69 163.86,-163.4 169.83,-167.05"/>\n<text xml:space="preserve" text-anchor="middle" x="159.54" y="-200.8" font-family="Times,serif" font-size="14.00">read</text>\n</g>\n<!-- worker -->\n<g id="node5" class="node">\n<title>worker</title>\n<ellipse fill="none" stroke="black" cx="77" cy="-58.8" rx="40.53" ry="18"/>\n<text xml:space="preserve" text-anchor="middle" x="77" y="-54.6" font-family="Times,serif" font-size="14.00">Worker</text>\n</g>\n<!-- db&#45;&gt;worker -->\n<g id="edge4" class="edge">\n<title>db&#45;&gt;worker</title>\n<path fill="none" stroke="black" d="M77,-119.33C77,-110.27 77,-98.97 77,-88.66"/>\n<polygon fill="black" stroke="black" points="80.5,-88.72 77,-78.72 73.5,-88.72 80.5,-88.72"/>\n</g>\n</g>\n</svg>\n';

/*
 * digraph {
 *   subgraph cluster_left { label="Left"; a; b }
 *   subgraph cluster_right { label="Right"; c }
 *   a -> b; b -> c;
 * }
 */
export const spring = '<svg width="224pt" height="139pt"\n viewBox="0.00 0.00 224.00 139.00" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">\n<g id="graph0" class="graph" transform="scale(1 1) rotate(0) translate(4 135.29)">\n<polygon fill="white" stroke="none" points="-4,4 -4,-135.29 219.62,-135.29 219.62,4 -4,4"/>\n<g id="clust1" class="cluster">\n<title>cluster_left</title>\n<polygon fill="none" stroke="black" points="0,0 0,-131.29 135.43,-131.29 135.43,0 0,0"/>\n<text xml:space="preserve" text-anchor="middle" x="67.72" y="-114.69" font-family="Times,serif" font-size="14.00">Left</text>\n</g>\n<g id="clust2" class="cluster">\n<title>cluster_right</title>\n<polygon fill="none" stroke="black" points="145.62,-10.38 145.62,-87.18 215.62,-87.18 215.62,-10.38 145.62,-10.38"/>\n<text xml:space="preserve" text-anchor="middle" x="180.62" y="-70.58" font-family="Times,serif" font-size="14.00">Right</text>\n</g>\n<!-- a -->\n<g id="node1" class="node">\n<title>a</title>\n<ellipse fill="none" stroke="black" cx="100.43" cy="-80.49" rx="27" ry="18"/>\n<text xml:space="preserve" text-anchor="middle" x="100.43" y="-76.29" font-family="Times,serif" font-size="14.00">a</text>\n</g>\n<!-- b -->\n<g id="node2" class="node">\n<title>b</title>\n<ellipse fill="none" stroke="black" cx="35" cy="-26" rx="27" ry="18"/>\n<text xml:space="preserve" text-anchor="middle" x="35" y="-21.8" font-family="Times,serif" font-size="14.00">b</text>\n</g>\n<!-- a&#45;&gt;b -->\n<g id="edge1" class="edge">\n<title>a&#45;&gt;b</title>\n<path fill="none" stroke="black" d="M83.24,-66.17C76.28,-60.37 68.09,-53.55 60.45,-47.19"/>\n<polygon fill="black" stroke="black" points="62.94,-44.71 53.01,-41 58.46,-50.09 62.94,-44.71"/>\n</g>\n<!-- c -->\n<g id="node3" class="node">\n<title>c</title>\n<ellipse fill="none" stroke="black" cx="180.62" cy="-36.38" rx="27" ry="18"/>\n<text xml:space="preserve" text-anchor="middle" x="180.62" y="-32.18" font-family="Times,serif" font-size="14.00">c</text>\n</g>\n<!-- b&#45;&gt;c -->\n<g id="edge2" class="edge">\n<title>b&#45;&gt;c</title>\n<path fill="none" stroke="black" d="M62.05,-27.93C84.63,-29.54 117.08,-31.85 142.33,-33.65"/>\n<polygon fill="black" stroke="black" points="141.98,-37.13 152.21,-34.35 142.48,-30.15 141.98,-37.13"/>\n</g>\n</g>\n</svg>\n';
