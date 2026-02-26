import React from 'react';
import { createRoot } from 'react-dom/client';
import { Maidr, TraceType } from 'maidr/react';
import type { MaidrData } from 'maidr/react';

const barData: MaidrData = {
  id: 'bar',
  title: 'The Number of Tips by Day',
  subplots: [
    [
      {
        layers: [
          {
            id: '0',
            type: TraceType.BAR,
            selectors: 'path[clip-path="url(#p0f12ed050e)"]',
            axes: {
              x: 'Day',
              y: 'Count',
              format: {
                x: {
                  function:
                    "const days = {Sun: 'Sunday', Mon: 'Monday', Tue: 'Tuesday', Wed: 'Wednesday', Thur: 'Thursday', Fri: 'Friday', Sat: 'Saturday'}; return days[value] || value",
                },
                y: { type: 'fixed', decimals: 1 },
              },
            },
            data: [
              { x: 'Sat', y: 87 },
              { x: 'Sun', y: 76 },
              { x: 'Thur', y: 62 },
              { x: 'Fri', y: 19 },
            ],
          },
        ],
      },
    ],
  ],
};

const barSvgInnerHTML = `<metadata>
        <rdf:RDF
          xmlns:dc="http://purl.org/dc/elements/1.1/"
          xmlns:cc="http://creativecommons.org/ns#"
          xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"
        >
          <cc:Work>
            <dc:type rdf:resource="http://purl.org/dc/dcmitype/StillImage" />
            <dc:date>2024-01-18T11:51:31.025970</dc:date>
            <dc:format>image/svg+xml</dc:format>
            <dc:creator>
              <cc:Agent>
                <dc:title>Matplotlib v3.8.2, https://matplotlib.org/</dc:title>
              </cc:Agent>
            </dc:creator>
          </cc:Work>
        </rdf:RDF>
      </metadata>
      <defs>
        <style type="text/css">
          * {
            stroke-linejoin: round;
            stroke-linecap: butt;
          }
        </style>
      </defs>
      <g id="figure_1">
        <g id="patch_1">
          <path
            d="M 0 432
            L 720 432
            L 720 0
            L 0 0
            z
            "
            style="fill: #ffffff"
          />
        </g>
        <g id="axes_1">
          <g id="patch_2">
            <path
              d="M 90 384.48
              L 648 384.48
              L 648 51.84
              L 90 51.84
              z
              "
              style="fill: #ffffff"
            />
          </g>
          <g id="patch_3">
            <path
              d="M 115.363636 384.48
              L 222.157895 384.48
              L 222.157895 67.68
              L 115.363636 67.68
              z
              "
              clip-path="url(#p0f12ed050e)"
              style="fill: #87ceeb"
            />
          </g>
          <g id="patch_4">
            <path
              d="M 248.856459 384.48
              L 355.650718 384.48
              L 355.650718 107.735172
              L 248.856459 107.735172
              z
              "
              clip-path="url(#p0f12ed050e)"
              style="fill: #87ceeb"
            />
          </g>
          <g id="patch_5">
            <path
              d="M 382.349282 384.48
              L 489.143541 384.48
              L 489.143541 158.714483
              L 382.349282 158.714483
              z
              "
              clip-path="url(#p0f12ed050e)"
              style="fill: #87ceeb"
            />
          </g>
          <g id="patch_6">
            <path
              d="M 515.842105 384.48
              L 622.636364 384.48
              L 622.636364 315.293793
              L 515.842105 315.293793
              z
              "
              clip-path="url(#p0f12ed050e)"
              style="fill: #87ceeb"
            />
          </g>
          <g id="matplotlib.axis_1">
            <g id="xtick_1">
              <g id="line2d_1">
                <defs>
                  <path
                    id="m8431198d92"
                    d="M 0 0
                    L 0 3.5
                    "
                    style="stroke: #000000; stroke-width: 0.8"
                  />
                </defs>
                <g>
                  <use xlink:href="#m8431198d92" x="168.760766" y="384.48" style="stroke: #000000; stroke-width: 0.8" />
                </g>
              </g>
              <g id="text_1">
                <!-- Sat -->
                <g transform="translate(160.562328 399.078438) scale(0.1 -0.1)">
                  <defs>
                    <path
                      id="DejaVuSans-53"
                      d="M 3425 4513
                      L 3425 3897
                      Q 3066 4069 2747 4153
                      Q 2428 4238 2131 4238
                      Q 1616 4238 1336 4038
                      Q 1056 3838 1056 3469
                      Q 1056 3159 1242 3001
                      Q 1428 2844 1947 2747
                      L 2328 2669
                      Q 3034 2534 3370 2195
                      Q 3706 1856 3706 1288
                      Q 3706 609 3251 259
                      Q 2797 -91 1919 -91
                      Q 1588 -91 1214 -16
                      Q 841 59 441 206
                      L 441 856
                      Q 825 641 1194 531
                      Q 1563 422 1919 422
                      Q 2459 422 2753 634
                      Q 3047 847 3047 1241
                      Q 3047 1584 2836 1778
                      Q 2625 1972 2144 2069
                      L 1759 2144
                      Q 1053 2284 737 2584
                      Q 422 2884 422 3419
                      Q 422 4038 858 4394
                      Q 1294 4750 2059 4750
                      Q 2388 4750 2728 4690
                      Q 3069 4631 3425 4513
                      z
                      "
                      transform="scale(0.015625)"
                    />
                    <path
                      id="DejaVuSans-61"
                      d="M 2194 1759
                      Q 1497 1759 1228 1600
                      Q 959 1441 959 1056
                      Q 959 750 1161 570
                      Q 1363 391 1709 391
                      Q 2188 391 2477 730
                      Q 2766 1069 2766 1631
                      L 2766 1759
                      L 2194 1759
                      z
                      M 3341 1997
                      L 3341 0
                      L 2766 0
                      L 2766 531
                      Q 2569 213 2275 61
                      Q 1981 -91 1556 -91
                      Q 1019 -91 701 211
                      Q 384 513 384 1019
                      Q 384 1609 779 1909
                      Q 1175 2209 1959 2209
                      L 2766 2209
                      L 2766 2266
                      Q 2766 2663 2505 2880
                      Q 2244 3097 1772 3097
                      Q 1472 3097 1187 3025
                      Q 903 2953 641 2809
                      L 641 3341
                      Q 956 3463 1253 3523
                      Q 1550 3584 1831 3584
                      Q 2591 3584 2966 3190
                      Q 3341 2797 3341 1997
                      z
                      "
                      transform="scale(0.015625)"
                    />
                    <path
                      id="DejaVuSans-74"
                      d="M 1172 4494
                      L 1172 3500
                      L 2356 3500
                      L 2356 3053
                      L 1172 3053
                      L 1172 1153
                      Q 1172 725 1289 603
                      Q 1406 481 1766 481
                      L 2356 481
                      L 2356 0
                      L 1766 0
                      Q 1100 0 847 248
                      Q 594 497 594 1153
                      L 594 3053
                      L 172 3053
                      L 172 3500
                      L 594 3500
                      L 594 4494
                      L 1172 4494
                      z
                      "
                      transform="scale(0.015625)"
                    />
                  </defs>
                  <use xlink:href="#DejaVuSans-53" />
                  <use xlink:href="#DejaVuSans-61" x="63.476562" />
                  <use xlink:href="#DejaVuSans-74" x="124.755859" />
                </g>
              </g>
            </g>
            <g id="xtick_2">
              <g id="line2d_2">
                <g>
                  <use xlink:href="#m8431198d92" x="302.253589" y="384.48" style="stroke: #000000; stroke-width: 0.8" />
                </g>
              </g>
              <g id="text_2">
                <!-- Sun -->
                <g transform="translate(292.74187 399.078438) scale(0.1 -0.1)">
                  <defs>
                    <path
                      id="DejaVuSans-75"
                      d="M 544 1381
                      L 544 3500
                      L 1119 3500
                      L 1119 1403
                      Q 1119 906 1312 657
                      Q 1506 409 1894 409
                      Q 2359 409 2629 706
                      Q 2900 1003 2900 1516
                      L 2900 3500
                      L 3475 3500
                      L 3475 0
                      L 2900 0
                      L 2900 538
                      Q 2691 219 2414 64
                      Q 2138 -91 1772 -91
                      Q 1169 -91 856 284
                      Q 544 659 544 1381
                      z
                      M 1991 3584
                      L 1991 3584
                      z
                      "
                      transform="scale(0.015625)"
                    />
                    <path
                      id="DejaVuSans-6e"
                      d="M 3513 2113
                      L 3513 0
                      L 2938 0
                      L 2938 2094
                      Q 2938 2591 2744 2837
                      Q 2550 3084 2163 3084
                      Q 1697 3084 1428 2787
                      Q 1159 2491 1159 1978
                      L 1159 0
                      L 581 0
                      L 581 3500
                      L 1159 3500
                      L 1159 2956
                      Q 1366 3272 1645 3428
                      Q 1925 3584 2291 3584
                      Q 2894 3584 3203 3211
                      Q 3513 2838 3513 2113
                      z
                      "
                      transform="scale(0.015625)"
                    />
                  </defs>
                  <use xlink:href="#DejaVuSans-53" />
                  <use xlink:href="#DejaVuSans-75" x="63.476562" />
                  <use xlink:href="#DejaVuSans-6e" x="126.855469" />
                </g>
              </g>
            </g>
            <g id="xtick_3">
              <g id="line2d_3">
                <g>
                  <use xlink:href="#m8431198d92" x="435.746411" y="384.48" style="stroke: #000000; stroke-width: 0.8" />
                </g>
              </g>
              <g id="text_3">
                <!-- Thur -->
                <g transform="translate(424.299536 399.078438) scale(0.1 -0.1)">
                  <defs>
                    <path
                      id="DejaVuSans-54"
                      d="M -19 4666
                      L 3928 4666
                      L 3928 4134
                      L 2272 4134
                      L 2272 0
                      L 1638 0
                      L 1638 4134
                      L -19 4134
                      L -19 4666
                      z
                      "
                      transform="scale(0.015625)"
                    />
                    <path
                      id="DejaVuSans-68"
                      d="M 3513 2113
                      L 3513 0
                      L 2938 0
                      L 2938 2094
                      Q 2938 2591 2744 2837
                      Q 2550 3084 2163 3084
                      Q 1697 3084 1428 2787
                      Q 1159 2491 1159 1978
                      L 1159 0
                      L 581 0
                      L 581 4863
                      L 1159 4863
                      L 1159 2956
                      Q 1366 3272 1645 3428
                      Q 1925 3584 2291 3584
                      Q 2894 3584 3203 3211
                      Q 3513 2838 3513 2113
                      z
                      "
                      transform="scale(0.015625)"
                    />
                    <path
                      id="DejaVuSans-72"
                      d="M 2631 2963
                      Q 2534 3019 2420 3045
                      Q 2306 3072 2169 3072
                      Q 1681 3072 1420 2755
                      Q 1159 2438 1159 1844
                      L 1159 0
                      L 581 0
                      L 581 3500
                      L 1159 3500
                      L 1159 2956
                      Q 1341 3275 1631 3429
                      Q 1922 3584 2338 3584
                      Q 2397 3584 2469 3576
                      Q 2541 3569 2628 3553
                      L 2631 2963
                      z
                      "
                      transform="scale(0.015625)"
                    />
                  </defs>
                  <use xlink:href="#DejaVuSans-54" />
                  <use xlink:href="#DejaVuSans-68" x="61.083984" />
                  <use xlink:href="#DejaVuSans-75" x="124.462891" />
                  <use xlink:href="#DejaVuSans-72" x="187.841797" />
                </g>
              </g>
            </g>
            <g id="xtick_4">
              <g id="line2d_4">
                <g>
                  <use xlink:href="#m8431198d92" x="569.239234" y="384.48" style="stroke: #000000; stroke-width: 0.8" />
                </g>
              </g>
              <g id="text_4">
                <!-- Fri -->
                <g transform="translate(563.281422 399.078438) scale(0.1 -0.1)">
                  <defs>
                    <path
                      id="DejaVuSans-46"
                      d="M 628 4666
                      L 3309 4666
                      L 3309 4134
                      L 1259 4134
                      L 1259 2759
                      L 3109 2759
                      L 3109 2228
                      L 1259 2228
                      L 1259 0
                      L 628 0
                      L 628 4666
                      z
                      "
                      transform="scale(0.015625)"
                    />
                    <path
                      id="DejaVuSans-69"
                      d="M 603 3500
                      L 1178 3500
                      L 1178 0
                      L 603 0
                      L 603 3500
                      z
                      M 603 4863
                      L 1178 4863
                      L 1178 4134
                      L 603 4134
                      L 603 4863
                      z
                      "
                      transform="scale(0.015625)"
                    />
                  </defs>
                  <use xlink:href="#DejaVuSans-46" />
                  <use xlink:href="#DejaVuSans-72" x="50.269531" />
                  <use xlink:href="#DejaVuSans-69" x="91.382812" />
                </g>
              </g>
            </g>
            <g id="text_5">
              <!-- Day -->
              <g transform="translate(359.126562 412.756563) scale(0.1 -0.1)">
                <defs>
                  <path
                    id="DejaVuSans-44"
                    d="M 1259 4147
                    L 1259 519
                    L 2022 519
                    Q 2988 519 3436 956
                    Q 3884 1394 3884 2338
                    Q 3884 3275 3436 3711
                    Q 2988 4147 2022 4147
                    L 1259 4147
                    z
                    M 628 4666
                    L 1925 4666
                    Q 3281 4666 3915 4102
                    Q 4550 3538 4550 2338
                    Q 4550 1131 3912 565
                    Q 3275 0 1925 0
                    L 628 0
                    L 628 4666
                    z
                    "
                    transform="scale(0.015625)"
                  />
                  <path
                    id="DejaVuSans-79"
                    d="M 2059 -325
                    Q 1816 -950 1584 -1140
                    Q 1353 -1331 966 -1331
                    L 506 -1331
                    L 506 -850
                    L 844 -850
                    Q 1081 -850 1212 -737
                    Q 1344 -625 1503 -206
                    L 1606 56
                    L 191 3500
                    L 800 3500
                    L 1894 763
                    L 2988 3500
                    L 3597 3500
                    L 2059 -325
                    z
                    "
                    transform="scale(0.015625)"
                  />
                </defs>
                <use xlink:href="#DejaVuSans-44" />
                <use xlink:href="#DejaVuSans-61" x="77.001953" />
                <use xlink:href="#DejaVuSans-79" x="138.28125" />
              </g>
            </g>
          </g>
          <g id="matplotlib.axis_2">
            <g id="ytick_1">
              <g id="line2d_5">
                <defs>
                  <path
                    id="m77d4ff0585"
                    d="M 0 0
                    L -3.5 0
                    "
                    style="stroke: #000000; stroke-width: 0.8"
                  />
                </defs>
                <g>
                  <use xlink:href="#m77d4ff0585" x="90" y="384.48" style="stroke: #000000; stroke-width: 0.8" />
                </g>
              </g>
              <g id="text_6">
                <!-- 0 -->
                <g transform="translate(76.6375 388.279219) scale(0.1 -0.1)">
                  <defs>
                    <path
                      id="DejaVuSans-30"
                      d="M 2034 4250
                      Q 1547 4250 1301 3770
                      Q 1056 3291 1056 2328
                      Q 1056 1369 1301 889
                      Q 1547 409 2034 409
                      Q 2525 409 2770 889
                      Q 3016 1369 3016 2328
                      Q 3016 3291 2770 3770
                      Q 2525 4250 2034 4250
                      z
                      M 2034 4750
                      Q 2819 4750 3233 4129
                      Q 3647 3509 3647 2328
                      Q 3647 1150 3233 529
                      Q 2819 -91 2034 -91
                      Q 1250 -91 836 529
                      Q 422 1150 422 2328
                      Q 422 3509 836 4129
                      Q 1250 4750 2034 4750
                      z
                      "
                      transform="scale(0.015625)"
                    />
                  </defs>
                  <use xlink:href="#DejaVuSans-30" />
                </g>
              </g>
            </g>
            <g id="ytick_2">
              <g id="line2d_6">
                <g>
                  <use xlink:href="#m77d4ff0585" x="90" y="311.652414" style="stroke: #000000; stroke-width: 0.8" />
                </g>
              </g>
              <g id="text_7">
                <!-- 20 -->
                <g transform="translate(70.275 315.451633) scale(0.1 -0.1)">
                  <defs>
                    <path
                      id="DejaVuSans-32"
                      d="M 1228 531
                      L 3431 531
                      L 3431 0
                      L 469 0
                      L 469 531
                      Q 828 903 1448 1529
                      Q 2069 2156 2228 2338
                      Q 2531 2678 2651 2914
                      Q 2772 3150 2772 3378
                      Q 2772 3750 2511 3984
                      Q 2250 4219 1831 4219
                      Q 1534 4219 1204 4116
                      Q 875 4013 500 3803
                      L 500 4441
                      Q 881 4594 1212 4672
                      Q 1544 4750 1819 4750
                      Q 2544 4750 2975 4387
                      Q 3406 4025 3406 3419
                      Q 3406 3131 3298 2873
                      Q 3191 2616 2906 2266
                      Q 2828 2175 2409 1742
                      Q 1991 1309 1228 531
                      z
                      "
                      transform="scale(0.015625)"
                    />
                  </defs>
                  <use xlink:href="#DejaVuSans-32" />
                  <use xlink:href="#DejaVuSans-30" x="63.623047" />
                </g>
              </g>
            </g>
            <g id="ytick_3">
              <g id="line2d_7">
                <g>
                  <use xlink:href="#m77d4ff0585" x="90" y="238.824828" style="stroke: #000000; stroke-width: 0.8" />
                </g>
              </g>
              <g id="text_8">
                <!-- 40 -->
                <g transform="translate(70.275 242.624046) scale(0.1 -0.1)">
                  <defs>
                    <path
                      id="DejaVuSans-34"
                      d="M 2419 4116
                      L 825 1625
                      L 2419 1625
                      L 2419 4116
                      z
                      M 2253 4666
                      L 3047 4666
                      L 3047 1625
                      L 3713 1625
                      L 3713 1100
                      L 3047 1100
                      L 3047 0
                      L 2419 0
                      L 2419 1100
                      L 313 1100
                      L 313 1709
                      L 2253 4666
                      z
                      "
                      transform="scale(0.015625)"
                    />
                  </defs>
                  <use xlink:href="#DejaVuSans-34" />
                  <use xlink:href="#DejaVuSans-30" x="63.623047" />
                </g>
              </g>
            </g>
            <g id="ytick_4">
              <g id="line2d_8">
                <g>
                  <use xlink:href="#m77d4ff0585" x="90" y="165.997241" style="stroke: #000000; stroke-width: 0.8" />
                </g>
              </g>
              <g id="text_9">
                <!-- 60 -->
                <g transform="translate(70.275 169.79646) scale(0.1 -0.1)">
                  <defs>
                    <path
                      id="DejaVuSans-36"
                      d="M 2113 2584
                      Q 1688 2584 1439 2293
                      Q 1191 2003 1191 1497
                      Q 1191 994 1439 701
                      Q 1688 409 2113 409
                      Q 2538 409 2786 701
                      Q 3034 994 3034 1497
                      Q 3034 2003 2786 2293
                      Q 2538 2584 2113 2584
                      z
                      M 3366 4563
                      L 3366 3988
                      Q 3128 4100 2886 4159
                      Q 2644 4219 2406 4219
                      Q 1781 4219 1451 3797
                      Q 1122 3375 1075 2522
                      Q 1259 2794 1537 2939
                      Q 1816 3084 2150 3084
                      Q 2853 3084 3261 2657
                      Q 3669 2231 3669 1497
                      Q 3669 778 3244 343
                      Q 2819 -91 2113 -91
                      Q 1303 -91 875 529
                      Q 447 1150 447 2328
                      Q 447 3434 972 4092
                      Q 1497 4750 2381 4750
                      Q 2619 4750 2861 4703
                      Q 3103 4656 3366 4563
                      z
                      "
                      transform="scale(0.015625)"
                    />
                  </defs>
                  <use xlink:href="#DejaVuSans-36" />
                  <use xlink:href="#DejaVuSans-30" x="63.623047" />
                </g>
              </g>
            </g>
            <g id="ytick_5">
              <g id="line2d_9">
                <g>
                  <use xlink:href="#m77d4ff0585" x="90" y="93.169655" style="stroke: #000000; stroke-width: 0.8" />
                </g>
              </g>
              <g id="text_10">
                <!-- 80 -->
                <g transform="translate(70.275 96.968874) scale(0.1 -0.1)">
                  <defs>
                    <path
                      id="DejaVuSans-38"
                      d="M 2034 2216
                      Q 1584 2216 1326 1975
                      Q 1069 1734 1069 1313
                      Q 1069 891 1326 650
                      Q 1584 409 2034 409
                      Q 2484 409 2743 651
                      Q 3003 894 3003 1313
                      Q 3003 1734 2745 1975
                      Q 2488 2216 2034 2216
                      z
                      M 1403 2484
                      Q 997 2584 770 2862
                      Q 544 3141 544 3541
                      Q 544 4100 942 4425
                      Q 1341 4750 2034 4750
                      Q 2731 4750 3128 4425
                      Q 3525 4100 3525 3541
                      Q 3525 3141 3298 2862
                      Q 3072 2584 2669 2484
                      Q 3125 2378 3379 2068
                      Q 3634 1759 3634 1313
                      Q 3634 634 3220 271
                      Q 2806 -91 2034 -91
                      Q 1263 -91 848 271
                      Q 434 634 434 1313
                      Q 434 1759 690 2068
                      Q 947 2378 1403 2484
                      z
                      M 1172 3481
                      Q 1172 3119 1398 2916
                      Q 1625 2713 2034 2713
                      Q 2441 2713 2670 2916
                      Q 2900 3119 2900 3481
                      Q 2900 3844 2670 4047
                      Q 2441 4250 2034 4250
                      Q 1625 4250 1398 4047
                      Q 1172 3844 1172 3481
                      z
                      "
                      transform="scale(0.015625)"
                    />
                  </defs>
                  <use xlink:href="#DejaVuSans-38" />
                  <use xlink:href="#DejaVuSans-30" x="63.623047" />
                </g>
              </g>
            </g>
            <g id="text_11">
              <!-- Count -->
              <g transform="translate(64.195312 233.008437) rotate(-90) scale(0.1 -0.1)">
                <defs>
                  <path
                    id="DejaVuSans-43"
                    d="M 4122 4306
                    L 4122 3641
                    Q 3803 3938 3442 4084
                    Q 3081 4231 2675 4231
                    Q 1875 4231 1450 3742
                    Q 1025 3253 1025 2328
                    Q 1025 1406 1450 917
                    Q 1875 428 2675 428
                    Q 3081 428 3442 575
                    Q 3803 722 4122 1019
                    L 4122 359
                    Q 3791 134 3420 21
                    Q 3050 -91 2638 -91
                    Q 1578 -91 968 557
                    Q 359 1206 359 2328
                    Q 359 3453 968 4101
                    Q 1578 4750 2638 4750
                    Q 3056 4750 3426 4639
                    Q 3797 4528 4122 4306
                    z
                    "
                    transform="scale(0.015625)"
                  />
                  <path
                    id="DejaVuSans-6f"
                    d="M 1959 3097
                    Q 1497 3097 1228 2736
                    Q 959 2375 959 1747
                    Q 959 1119 1226 758
                    Q 1494 397 1959 397
                    Q 2419 397 2687 759
                    Q 2956 1122 2956 1747
                    Q 2956 2369 2687 2733
                    Q 2419 3097 1959 3097
                    z
                    M 1959 3584
                    Q 2709 3584 3137 3096
                    Q 3566 2609 3566 1747
                    Q 3566 888 3137 398
                    Q 2709 -91 1959 -91
                    Q 1206 -91 779 398
                    Q 353 888 353 1747
                    Q 353 2609 779 3096
                    Q 1206 3584 1959 3584
                    z
                    "
                    transform="scale(0.015625)"
                  />
                </defs>
                <use xlink:href="#DejaVuSans-43" />
                <use xlink:href="#DejaVuSans-6f" x="69.824219" />
                <use xlink:href="#DejaVuSans-75" x="131.005859" />
                <use xlink:href="#DejaVuSans-6e" x="194.384766" />
                <use xlink:href="#DejaVuSans-74" x="257.763672" />
              </g>
            </g>
          </g>
          <g id="patch_7">
            <path
              d="M 90 384.48
              L 90 51.84
              "
              style="fill: none; stroke: #000000; stroke-width: 0.8; stroke-linejoin: miter; stroke-linecap: square"
            />
          </g>
          <g id="patch_8">
            <path
              d="M 648 384.48
              L 648 51.84
              "
              style="fill: none; stroke: #000000; stroke-width: 0.8; stroke-linejoin: miter; stroke-linecap: square"
            />
          </g>
          <g id="patch_9">
            <path
              d="M 90 384.48
              L 648 384.48
              "
              style="fill: none; stroke: #000000; stroke-width: 0.8; stroke-linejoin: miter; stroke-linecap: square"
            />
          </g>
          <g id="patch_10">
            <path
              d="M 90 51.84
              L 648 51.84
              "
              style="fill: none; stroke: #000000; stroke-width: 0.8; stroke-linejoin: miter; stroke-linecap: square"
            />
          </g>
          <g id="text_12">
            <!-- The Number of Tips by Day -->
            <g transform="translate(287.132812 45.84) scale(0.12 -0.12)">
              <defs>
                <path
                  id="DejaVuSans-65"
                  d="M 3597 1894
                  L 3597 1613
                  L 953 1613
                  Q 991 1019 1311 708
                  Q 1631 397 2203 397
                  Q 2534 397 2845 478
                  Q 3156 559 3463 722
                  L 3463 178
                  Q 3153 47 2828 -22
                  Q 2503 -91 2169 -91
                  Q 1331 -91 842 396
                  Q 353 884 353 1716
                  Q 353 2575 817 3079
                  Q 1281 3584 2069 3584
                  Q 2775 3584 3186 3129
                  Q 3597 2675 3597 1894
                  z
                  M 3022 2063
                  Q 3016 2534 2758 2815
                  Q 2500 3097 2075 3097
                  Q 1594 3097 1305 2825
                  Q 1016 2553 972 2059
                  L 3022 2063
                  z
                  "
                  transform="scale(0.015625)"
                />
                <path id="DejaVuSans-20" transform="scale(0.015625)" />
                <path
                  id="DejaVuSans-4e"
                  d="M 628 4666
                  L 1478 4666
                  L 3547 763
                  L 3547 4666
                  L 4159 4666
                  L 4159 0
                  L 3309 0
                  L 1241 3903
                  L 1241 0
                  L 628 0
                  L 628 4666
                  z
                  "
                  transform="scale(0.015625)"
                />
                <path
                  id="DejaVuSans-6d"
                  d="M 3328 2828
                  Q 3544 3216 3844 3400
                  Q 4144 3584 4550 3584
                  Q 5097 3584 5394 3201
                  Q 5691 2819 5691 2113
                  L 5691 0
                  L 5113 0
                  L 5113 2094
                  Q 5113 2597 4934 2840
                  Q 4756 3084 4391 3084
                  Q 3944 3084 3684 2787
                  Q 3425 2491 3425 1978
                  L 3425 0
                  L 2847 0
                  L 2847 2094
                  Q 2847 2600 2669 2842
                  Q 2491 3084 2119 3084
                  Q 1678 3084 1418 2786
                  Q 1159 2488 1159 1978
                  L 1159 0
                  L 581 0
                  L 581 3500
                  L 1159 3500
                  L 1159 2956
                  Q 1356 3278 1631 3431
                  Q 1906 3584 2284 3584
                  Q 2666 3584 2933 3390
                  Q 3200 3197 3328 2828
                  z
                  "
                  transform="scale(0.015625)"
                />
                <path
                  id="DejaVuSans-62"
                  d="M 3116 1747
                  Q 3116 2381 2855 2742
                  Q 2594 3103 2138 3103
                  Q 1681 3103 1420 2742
                  Q 1159 2381 1159 1747
                  Q 1159 1113 1420 752
                  Q 1681 391 2138 391
                  Q 2594 391 2855 752
                  Q 3116 1113 3116 1747
                  z
                  M 1159 2969
                  Q 1341 3281 1617 3432
                  Q 1894 3584 2278 3584
                  Q 2916 3584 3314 3078
                  Q 3713 2572 3713 1747
                  Q 3713 922 3314 415
                  Q 2916 -91 2278 -91
                  Q 1894 -91 1617 61
                  Q 1341 213 1159 525
                  L 1159 0
                  L 581 0
                  L 581 4863
                  L 1159 4863
                  L 1159 2969
                  z
                  "
                  transform="scale(0.015625)"
                />
                <path
                  id="DejaVuSans-66"
                  d="M 2375 4863
                  L 2375 4384
                  L 1825 4384
                  Q 1516 4384 1395 4259
                  Q 1275 4134 1275 3809
                  L 1275 3500
                  L 2222 3500
                  L 2222 3053
                  L 1275 3053
                  L 1275 0
                  L 697 0
                  L 697 3053
                  L 147 3053
                  L 147 3500
                  L 697 3500
                  L 697 3744
                  Q 697 4328 969 4595
                  Q 1241 4863 1831 4863
                  L 2375 4863
                  z
                  "
                  transform="scale(0.015625)"
                />
                <path
                  id="DejaVuSans-70"
                  d="M 1159 525
                  L 1159 -1331
                  L 581 -1331
                  L 581 3500
                  L 1159 3500
                  L 1159 2969
                  Q 1341 3281 1617 3432
                  Q 1894 3584 2278 3584
                  Q 2916 3584 3314 3078
                  Q 3713 2572 3713 1747
                  Q 3713 922 3314 415
                  Q 2916 -91 2278 -91
                  Q 1894 -91 1617 61
                  Q 1341 213 1159 525
                  z
                  M 3116 1747
                  Q 3116 2381 2855 2742
                  Q 2594 3103 2138 3103
                  Q 1681 3103 1420 2742
                  Q 1159 2381 1159 1747
                  Q 1159 1113 1420 752
                  Q 1681 391 2138 391
                  Q 2594 391 2855 752
                  Q 3116 1113 3116 1747
                  z
                  "
                  transform="scale(0.015625)"
                />
                <path
                  id="DejaVuSans-73"
                  d="M 2834 3397
                  L 2834 2853
                  Q 2591 2978 2328 3040
                  Q 2066 3103 1784 3103
                  Q 1356 3103 1142 2972
                  Q 928 2841 928 2578
                  Q 928 2378 1081 2264
                  Q 1234 2150 1697 2047
                  L 1894 2003
                  Q 2506 1872 2764 1633
                  Q 3022 1394 3022 966
                  Q 3022 478 2636 193
                  Q 2250 -91 1575 -91
                  Q 1294 -91 989 -36
                  Q 684 19 347 128
                  L 347 722
                  Q 666 556 975 473
                  Q 1284 391 1588 391
                  Q 1994 391 2212 530
                  Q 2431 669 2431 922
                  Q 2431 1156 2273 1281
                  Q 2116 1406 1581 1522
                  L 1381 1569
                  Q 847 1681 609 1914
                  Q 372 2147 372 2553
                  Q 372 3047 722 3315
                  Q 1072 3584 1716 3584
                  Q 2034 3584 2315 3537
                  Q 2597 3491 2834 3397
                  z
                  "
                  transform="scale(0.015625)"
                />
              </defs>
              <use xlink:href="#DejaVuSans-54" />
              <use xlink:href="#DejaVuSans-68" x="61.083984" />
              <use xlink:href="#DejaVuSans-65" x="124.462891" />
              <use xlink:href="#DejaVuSans-20" x="185.986328" />
              <use xlink:href="#DejaVuSans-4e" x="217.773438" />
              <use xlink:href="#DejaVuSans-75" x="292.578125" />
              <use xlink:href="#DejaVuSans-6d" x="355.957031" />
              <use xlink:href="#DejaVuSans-62" x="453.369141" />
              <use xlink:href="#DejaVuSans-65" x="516.845703" />
              <use xlink:href="#DejaVuSans-72" x="578.369141" />
              <use xlink:href="#DejaVuSans-20" x="619.482422" />
              <use xlink:href="#DejaVuSans-6f" x="651.269531" />
              <use xlink:href="#DejaVuSans-66" x="712.451172" />
              <use xlink:href="#DejaVuSans-20" x="747.65625" />
              <use xlink:href="#DejaVuSans-54" x="779.443359" />
              <use xlink:href="#DejaVuSans-69" x="837.402344" />
              <use xlink:href="#DejaVuSans-70" x="865.185547" />
              <use xlink:href="#DejaVuSans-73" x="928.662109" />
              <use xlink:href="#DejaVuSans-20" x="980.761719" />
              <use xlink:href="#DejaVuSans-62" x="1012.548828" />
              <use xlink:href="#DejaVuSans-79" x="1076.025391" />
              <use xlink:href="#DejaVuSans-20" x="1135.205078" />
              <use xlink:href="#DejaVuSans-44" x="1166.992188" />
              <use xlink:href="#DejaVuSans-61" x="1243.994141" />
              <use xlink:href="#DejaVuSans-79" x="1305.273438" />
            </g>
          </g>
        </g>
      </g>
      <defs>
        <clipPath id="p0f12ed050e">
          <rect x="90" y="51.84" width="558" height="332.64" />
        </clipPath>
      </defs>`;

const lineData: MaidrData = {
  id: '151f3961-0445-4713-94f4-e2059c74c53a',
  subplots: [
    [
      {
        id: 'd54fac17-e805-4ade-8b78-f110c534984c',
        layers: [
          {
            id: 'c4ac3f68-6266-4f35-8125-33d8cdff1e9a',
            type: TraceType.LINE,
            title:
              'Line: Total Passengers per Year\nFrom the Flights Dataset',
            axes: {
              x: 'Year',
              y: 'Total Passengers (Thousands)',
            },
            data: [
              [
                { x: 1949.0, y: 1520.0 },
                { x: 1950.0, y: 1676.0 },
                { x: 1951.0, y: 2042.0 },
                { x: 1952.0, y: 2364.0 },
                { x: 1953.0, y: 2700.0 },
                { x: 1954.0, y: 2867.0 },
                { x: 1955.0, y: 3408.0 },
                { x: 1956.0, y: 3939.0 },
                { x: 1957.0, y: 4421.0 },
                { x: 1958.0, y: 4572.0 },
                { x: 1959.0, y: 5140.0 },
                { x: 1960.0, y: 5714.0 },
              ],
            ],
            selectors: [
              "g[id='maidr-bc200021-0bee-4a65-b89e-5bc56843df54'] path",
            ],
          },
        ],
      },
    ],
  ],
};

const lineSvgInnerHTML = `<metadata>
          <rdf:RDF xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:cc="http://creativecommons.org/ns#"
            xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
            <cc:Work>
              <dc:type rdf:resource="http://purl.org/dc/dcmitype/StillImage" />
              <dc:date>2025-09-28T20:47:59.778672</dc:date>
              <dc:format>image/svg+xml</dc:format>
              <dc:creator>
                <cc:Agent>
                  <dc:title>Matplotlib v3.9.4, https://matplotlib.org/</dc:title>
                </cc:Agent>
              </dc:creator>
            </cc:Work>
          </rdf:RDF>
        </metadata>
        <defs>
          <style type="text/css">
            * {
              stroke-linejoin: round;
              stroke-linecap: butt;
            }
          </style>
        </defs>
        <g id="figure_1">
          <g id="maidr-21328efb-ba5d-4892-ac11-69b95a6a5abf">
            <path d="M 0 504  L 1008 504  L 1008 0  L 0 0  z " style="fill: #ffffff" />
          </g>
          <g id="axes_1">
            <g id="maidr-9968d3a8-924c-4d35-a09d-ab6627b2eb6d">
              <path d="M 126 448.56  L 907.2 448.56  L 907.2 60.48  L 126 60.48  z " style="fill: #ffffff" />
            </g>
            <g id="matplotlib.axis_1">
              <g id="xtick_1">
                <g id="maidr-6c56f6fd-a7af-4296-8ae4-738459bdfffa">
                  <defs>
                    <path id="mfa907df2c8" d="M 0 0  L 0 3.5  " style="stroke: #000000; stroke-width: 0.8" />
                  </defs>
                  <g>
                    <use xlink:href="#mfa907df2c8" x="226.071074" y="448.56"
                      style="stroke: #000000; stroke-width: 0.8" />
                  </g>
                </g>
                <g id="text_1">
                  <!-- 1950 -->
                  <g transform="translate(213.346074 463.158437) scale(0.1 -0.1)">
                    <defs>
                      <path id="DejaVuSans-31"
                        d="M 794 531  L 1825 531  L 1825 4091  L 703 3866  L 703 4441  L 1819 4666  L 2450 4666  L 2450 531  L 3481 531  L 3481 0  L 794 0  L 794 531  z "
                        transform="scale(0.015625)" />
                      <path id="DejaVuSans-39"
                        d="M 703 97  L 703 672  Q 941 559 1184 500  Q 1428 441 1663 441  Q 2288 441 2617 861  Q 2947 1281 2994 2138  Q 2813 1869 2534 1725  Q 2256 1581 1919 1581  Q 1219 1581 811 2004  Q 403 2428 403 3163  Q 403 3881 828 4315  Q 1253 4750 1959 4750  Q 2769 4750 3195 4129  Q 3622 3509 3622 2328  Q 3622 1225 3098 567  Q 2575 -91 1691 -91  Q 1453 -91 1209 -44  Q 966 3 703 97  z M 1959 2075  Q 2384 2075 2632 2365  Q 2881 2656 2881 3163  Q 2881 3666 2632 3958  Q 2384 4250 1959 4250  Q 1534 4250 1286 3958  Q 1038 3666 1038 3163  Q 1038 2656 1286 2365  Q 1534 2075 1959 2075  z "
                        transform="scale(0.015625)" />
                      <path id="DejaVuSans-35"
                        d="M 691 4666  L 3169 4666  L 3169 4134  L 1269 4134  L 1269 2991  Q 1406 3038 1543 3061  Q 1681 3084 1819 3084  Q 2600 3084 3056 2656  Q 3513 2228 3513 1497  Q 3513 744 3044 326  Q 2575 -91 1722 -91  Q 1428 -91 1123 -41  Q 819 9 494 109  L 494 744  Q 775 591 1075 516  Q 1375 441 1709 441  Q 2250 441 2565 725  Q 2881 1009 2881 1497  Q 2881 1984 2565 2268  Q 2250 2553 1709 2553  Q 1456 2553 1204 2497  Q 953 2441 691 2322  L 691 4666  z "
                        transform="scale(0.015625)" />
                      <path id="DejaVuSans-30"
                        d="M 2034 4250  Q 1547 4250 1301 3770  Q 1056 3291 1056 2328  Q 1056 1369 1301 889  Q 1547 409 2034 409  Q 2525 409 2770 889  Q 3016 1369 3016 2328  Q 3016 3291 2770 3770  Q 2525 4250 2034 4250  z M 2034 4750  Q 2819 4750 3233 4129  Q 3647 3509 3647 2328  Q 3647 1150 3233 529  Q 2819 -91 2034 -91  Q 1250 -91 836 529  Q 422 1150 422 2328  Q 422 3509 836 4129  Q 1250 4750 2034 4750  z "
                        transform="scale(0.015625)" />
                    </defs>
                    <use xlink:href="#DejaVuSans-31" />
                    <use xlink:href="#DejaVuSans-39" x="63.623047" />
                    <use xlink:href="#DejaVuSans-35" x="127.246094" />
                    <use xlink:href="#DejaVuSans-30" x="190.869141" />
                  </g>
                </g>
              </g>
              <g id="xtick_2">
                <g id="maidr-aa822480-6f22-4132-8ed2-15d0c9e42272">
                  <g>
                    <use xlink:href="#mfa907df2c8" x="355.195041" y="448.56"
                      style="stroke: #000000; stroke-width: 0.8" />
                  </g>
                </g>
                <g id="text_2">
                  <!-- 1952 -->
                  <g transform="translate(342.470041 463.158437) scale(0.1 -0.1)">
                    <defs>
                      <path id="DejaVuSans-32"
                        d="M 1228 531  L 3431 531  L 3431 0  L 469 0  L 469 531  Q 828 903 1448 1529  Q 2069 2156 2228 2338  Q 2531 2678 2651 2914  Q 2772 3150 2772 3378  Q 2772 3750 2511 3984  Q 2250 4219 1831 4219  Q 1534 4219 1204 4116  Q 875 4013 500 3803  L 500 4441  Q 881 4594 1212 4672  Q 1544 4750 1819 4750  Q 2544 4750 2975 4387  Q 3406 4025 3406 3419  Q 3406 3131 3298 2873  Q 3191 2616 2906 2266  Q 2828 2175 2409 1742  Q 1991 1309 1228 531  z "
                        transform="scale(0.015625)" />
                    </defs>
                    <use xlink:href="#DejaVuSans-31" />
                    <use xlink:href="#DejaVuSans-39" x="63.623047" />
                    <use xlink:href="#DejaVuSans-35" x="127.246094" />
                    <use xlink:href="#DejaVuSans-32" x="190.869141" />
                  </g>
                </g>
              </g>
              <g id="xtick_3">
                <g id="maidr-8ffa0732-c500-4d81-b090-dc674b235fde">
                  <g>
                    <use xlink:href="#mfa907df2c8" x="484.319008" y="448.56"
                      style="stroke: #000000; stroke-width: 0.8" />
                  </g>
                </g>
                <g id="text_3">
                  <!-- 1954 -->
                  <g transform="translate(471.594008 463.158437) scale(0.1 -0.1)">
                    <defs>
                      <path id="DejaVuSans-34"
                        d="M 2419 4116  L 825 1625  L 2419 1625  L 2419 4116  z M 2253 4666  L 3047 4666  L 3047 1625  L 3713 1625  L 3713 1100  L 3047 1100  L 3047 0  L 2419 0  L 2419 1100  L 313 1100  L 313 1709  L 2253 4666  z "
                        transform="scale(0.015625)" />
                    </defs>
                    <use xlink:href="#DejaVuSans-31" />
                    <use xlink:href="#DejaVuSans-39" x="63.623047" />
                    <use xlink:href="#DejaVuSans-35" x="127.246094" />
                    <use xlink:href="#DejaVuSans-34" x="190.869141" />
                  </g>
                </g>
              </g>
              <g id="xtick_4">
                <g id="maidr-aebb6e9a-df29-4371-9c4f-db83a4154e7e">
                  <g>
                    <use xlink:href="#mfa907df2c8" x="613.442975" y="448.56"
                      style="stroke: #000000; stroke-width: 0.8" />
                  </g>
                </g>
                <g id="text_4">
                  <!-- 1956 -->
                  <g transform="translate(600.717975 463.158437) scale(0.1 -0.1)">
                    <defs>
                      <path id="DejaVuSans-36"
                        d="M 2113 2584  Q 1688 2584 1439 2293  Q 1191 2003 1191 1497  Q 1191 994 1439 701  Q 1688 409 2113 409  Q 2538 409 2786 701  Q 3034 994 3034 1497  Q 3034 2003 2786 2293  Q 2538 2584 2113 2584  z M 3366 4563  L 3366 3988  Q 3128 4100 2886 4159  Q 2644 4219 2406 4219  Q 1781 4219 1451 3797  Q 1122 3375 1075 2522  Q 1259 2794 1537 2939  Q 1816 3084 2150 3084  Q 2853 3084 3261 2657  Q 3669 2231 3669 1497  Q 3669 778 3244 343  Q 2819 -91 2113 -91  Q 1303 -91 875 529  Q 447 1150 447 2328  Q 447 3434 972 4092  Q 1497 4750 2381 4750  Q 2619 4750 2861 4703  Q 3103 4656 3366 4563  z "
                        transform="scale(0.015625)" />
                    </defs>
                    <use xlink:href="#DejaVuSans-31" />
                    <use xlink:href="#DejaVuSans-39" x="63.623047" />
                    <use xlink:href="#DejaVuSans-35" x="127.246094" />
                    <use xlink:href="#DejaVuSans-36" x="190.869141" />
                  </g>
                </g>
              </g>
              <g id="xtick_5">
                <g id="maidr-0af00a54-cc6c-4149-a2df-bc2d9d64279a">
                  <g>
                    <use xlink:href="#mfa907df2c8" x="742.566942" y="448.56"
                      style="stroke: #000000; stroke-width: 0.8" />
                  </g>
                </g>
                <g id="text_5">
                  <!-- 1958 -->
                  <g transform="translate(729.841942 463.158437) scale(0.1 -0.1)">
                    <defs>
                      <path id="DejaVuSans-38"
                        d="M 2034 2216  Q 1584 2216 1326 1975  Q 1069 1734 1069 1313  Q 1069 891 1326 650  Q 1584 409 2034 409  Q 2484 409 2743 651  Q 3003 894 3003 1313  Q 3003 1734 2745 1975  Q 2488 2216 2034 2216  z M 1403 2484  Q 997 2584 770 2862  Q 544 3141 544 3541  Q 544 4100 942 4425  Q 1341 4750 2034 4750  Q 2731 4750 3128 4425  Q 3525 4100 3525 3541  Q 3525 3141 3298 2862  Q 3072 2584 2669 2484  Q 3125 2378 3379 2068  Q 3634 1759 3634 1313  Q 3634 634 3220 271  Q 2806 -91 2034 -91  Q 1263 -91 848 271  Q 434 634 434 1313  Q 434 1759 690 2068  Q 947 2378 1403 2484  z M 1172 3481  Q 1172 3119 1398 2916  Q 1625 2713 2034 2713  Q 2441 2713 2670 2916  Q 2900 3119 2900 3481  Q 2900 3844 2670 4047  Q 2441 4250 2034 4250  Q 1625 4250 1398 4047  Q 1172 3844 1172 3481  z "
                        transform="scale(0.015625)" />
                    </defs>
                    <use xlink:href="#DejaVuSans-31" />
                    <use xlink:href="#DejaVuSans-39" x="63.623047" />
                    <use xlink:href="#DejaVuSans-35" x="127.246094" />
                    <use xlink:href="#DejaVuSans-38" x="190.869141" />
                  </g>
                </g>
              </g>
              <g id="xtick_6">
                <g id="maidr-1b4ffe7d-801c-4a52-ba9f-f95a65c6e97a">
                  <g>
                    <use xlink:href="#mfa907df2c8" x="871.690909" y="448.56"
                      style="stroke: #000000; stroke-width: 0.8" />
                  </g>
                </g>
                <g id="text_6">
                  <!-- 1960 -->
                  <g transform="translate(858.965909 463.158437) scale(0.1 -0.1)">
                    <use xlink:href="#DejaVuSans-31" />
                    <use xlink:href="#DejaVuSans-39" x="63.623047" />
                    <use xlink:href="#DejaVuSans-36" x="127.246094" />
                    <use xlink:href="#DejaVuSans-30" x="190.869141" />
                  </g>
                </g>
              </g>
              <g id="text_7">
                <!-- Year -->
                <g transform="translate(503.895 478.35625) scale(0.12 -0.12)">
                  <defs>
                    <path id="DejaVuSans-59"
                      d="M -13 4666  L 666 4666  L 1959 2747  L 3244 4666  L 3922 4666  L 2272 2222  L 2272 0  L 1638 0  L 1638 2222  L -13 4666  z "
                      transform="scale(0.015625)" />
                    <path id="DejaVuSans-65"
                      d="M 3597 1894  L 3597 1613  L 953 1613  Q 991 1019 1311 708  Q 1631 397 2203 397  Q 2534 397 2845 478  Q 3156 559 3463 722  L 3463 178  Q 3153 47 2828 -22  Q 2503 -91 2169 -91  Q 1331 -91 842 396  Q 353 884 353 1716  Q 353 2575 817 3079  Q 1281 3584 2069 3584  Q 2775 3584 3186 3129  Q 3597 2675 3597 1894  z M 3022 2063  Q 3016 2534 2758 2815  Q 2500 3097 2075 3097  Q 1594 3097 1305 2825  Q 1016 2553 972 2059  L 3022 2063  z "
                      transform="scale(0.015625)" />
                    <path id="DejaVuSans-61"
                      d="M 2194 1759  Q 1497 1759 1228 1600  Q 959 1441 959 1056  Q 959 750 1161 570  Q 1363 391 1709 391  Q 2188 391 2477 730  Q 2766 1069 2766 1631  L 2766 1759  L 2194 1759  z M 3341 1997  L 3341 0  L 2766 0  L 2766 531  Q 2569 213 2275 61  Q 1981 -91 1556 -91  Q 1019 -91 701 211  Q 384 513 384 1019  Q 384 1609 779 1909  Q 1175 2209 1959 2209  L 2766 2209  L 2766 2266  Q 2766 2663 2505 2880  Q 2244 3097 1772 3097  Q 1472 3097 1187 3025  Q 903 2953 641 2809  L 641 3341  Q 956 3463 1253 3523  Q 1550 3584 1831 3584  Q 2591 3584 2966 3190  Q 3341 2797 3341 1997  z "
                      transform="scale(0.015625)" />
                    <path id="DejaVuSans-72"
                      d="M 2631 2963  Q 2534 3019 2420 3045  Q 2306 3072 2169 3072  Q 1681 3072 1420 2755  Q 1159 2438 1159 1844  L 1159 0  L 581 0  L 581 3500  L 1159 3500  L 1159 2956  Q 1341 3275 1631 3429  Q 1922 3584 2338 3584  Q 2397 3584 2469 3576  Q 2541 3569 2628 3553  L 2631 2963  z "
                      transform="scale(0.015625)" />
                  </defs>
                  <use xlink:href="#DejaVuSans-59" />
                  <use xlink:href="#DejaVuSans-65" x="47.833984" />
                  <use xlink:href="#DejaVuSans-61" x="109.357422" />
                  <use xlink:href="#DejaVuSans-72" x="170.636719" />
                </g>
              </g>
            </g>
            <g id="matplotlib.axis_2">
              <g id="ytick_1">
                <g id="maidr-695d09a8-7dae-4964-916a-4e4828b1b7c2">
                  <defs>
                    <path id="m04836a49ed" d="M 0 0  L -3.5 0  " style="stroke: #000000; stroke-width: 0.8" />
                  </defs>
                  <g>
                    <use xlink:href="#m04836a49ed" x="126" y="390.542318" style="stroke: #000000; stroke-width: 0.8" />
                  </g>
                </g>
                <g id="text_8">
                  <!-- 2000 -->
                  <g transform="translate(93.55 394.341536) scale(0.1 -0.1)">
                    <use xlink:href="#DejaVuSans-32" />
                    <use xlink:href="#DejaVuSans-30" x="63.623047" />
                    <use xlink:href="#DejaVuSans-30" x="127.246094" />
                    <use xlink:href="#DejaVuSans-30" x="190.869141" />
                  </g>
                </g>
              </g>
              <g id="ytick_2">
                <g id="maidr-3705c696-add6-4b10-8ae4-2d7ac5c9a96e">
                  <g>
                    <use xlink:href="#m04836a49ed" x="126" y="306.422146" style="stroke: #000000; stroke-width: 0.8" />
                  </g>
                </g>
                <g id="text_9">
                  <!-- 3000 -->
                  <g transform="translate(93.55 310.221365) scale(0.1 -0.1)">
                    <defs>
                      <path id="DejaVuSans-33"
                        d="M 2597 2516  Q 3050 2419 3304 2112  Q 3559 1806 3559 1356  Q 3559 666 3084 287  Q 2609 -91 1734 -91  Q 1441 -91 1130 -33  Q 819 25 488 141  L 488 750  Q 750 597 1062 519  Q 1375 441 1716 441  Q 2309 441 2620 675  Q 2931 909 2931 1356  Q 2931 1769 2642 2001  Q 2353 2234 1838 2234  L 1294 2234  L 1294 2753  L 1863 2753  Q 2328 2753 2575 2939  Q 2822 3125 2822 3475  Q 2822 3834 2567 4026  Q 2313 4219 1838 4219  Q 1578 4219 1281 4162  Q 984 4106 628 3988  L 628 4550  Q 988 4650 1302 4700  Q 1616 4750 1894 4750  Q 2613 4750 3031 4423  Q 3450 4097 3450 3541  Q 3450 3153 3228 2886  Q 3006 2619 2597 2516  z "
                        transform="scale(0.015625)" />
                    </defs>
                    <use xlink:href="#DejaVuSans-33" />
                    <use xlink:href="#DejaVuSans-30" x="63.623047" />
                    <use xlink:href="#DejaVuSans-30" x="127.246094" />
                    <use xlink:href="#DejaVuSans-30" x="190.869141" />
                  </g>
                </g>
              </g>
              <g id="ytick_3">
                <g id="maidr-07ad9b48-3b00-41f9-bad7-78227ce13686">
                  <g>
                    <use xlink:href="#m04836a49ed" x="126" y="222.301974" style="stroke: #000000; stroke-width: 0.8" />
                  </g>
                </g>
                <g id="text_10">
                  <!-- 4000 -->
                  <g transform="translate(93.55 226.101193) scale(0.1 -0.1)">
                    <use xlink:href="#DejaVuSans-34" />
                    <use xlink:href="#DejaVuSans-30" x="63.623047" />
                    <use xlink:href="#DejaVuSans-30" x="127.246094" />
                    <use xlink:href="#DejaVuSans-30" x="190.869141" />
                  </g>
                </g>
              </g>
              <g id="ytick_4">
                <g id="maidr-2606f889-64cf-42eb-88c6-3c46e0131e25">
                  <g>
                    <use xlink:href="#m04836a49ed" x="126" y="138.181803" style="stroke: #000000; stroke-width: 0.8" />
                  </g>
                </g>
                <g id="text_11">
                  <!-- 5000 -->
                  <g transform="translate(93.55 141.981021) scale(0.1 -0.1)">
                    <use xlink:href="#DejaVuSans-35" />
                    <use xlink:href="#DejaVuSans-30" x="63.623047" />
                    <use xlink:href="#DejaVuSans-30" x="127.246094" />
                    <use xlink:href="#DejaVuSans-30" x="190.869141" />
                  </g>
                </g>
              </g>
              <g id="text_12">
                <!-- Total Passengers (Thousands) -->
                <g transform="translate(87.054375 343.371562) rotate(-90) scale(0.12 -0.12)">
                  <defs>
                    <path id="DejaVuSans-54"
                      d="M -19 4666  L 3928 4666  L 3928 4134  L 2272 4134  L 2272 0  L 1638 0  L 1638 4134  L -19 4134  L -19 4666  z "
                      transform="scale(0.015625)" />
                    <path id="DejaVuSans-6f"
                      d="M 1959 3097  Q 1497 3097 1228 2736  Q 959 2375 959 1747  Q 959 1119 1226 758  Q 1494 397 1959 397  Q 2419 397 2687 759  Q 2956 1122 2956 1747  Q 2956 2369 2687 2733  Q 2419 3097 1959 3097  z M 1959 3584  Q 2709 3584 3137 3096  Q 3566 2609 3566 1747  Q 3566 888 3137 398  Q 2709 -91 1959 -91  Q 1206 -91 779 398  Q 353 888 353 1747  Q 353 2609 779 3096  Q 1206 3584 1959 3584  z "
                      transform="scale(0.015625)" />
                    <path id="DejaVuSans-74"
                      d="M 1172 4494  L 1172 3500  L 2356 3500  L 2356 3053  L 1172 3053  L 1172 1153  Q 1172 725 1289 603  Q 1406 481 1766 481  L 2356 481  L 2356 0  L 1766 0  Q 1100 0 847 248  Q 594 497 594 1153  L 594 3053  L 172 3053  L 172 3500  L 594 3500  L 594 4494  L 1172 4494  z "
                      transform="scale(0.015625)" />
                    <path id="DejaVuSans-6c" d="M 603 4863  L 1178 4863  L 1178 0  L 603 0  L 603 4863  z "
                      transform="scale(0.015625)" />
                    <path id="DejaVuSans-20" transform="scale(0.015625)" />
                    <path id="DejaVuSans-50"
                      d="M 1259 4147  L 1259 2394  L 2053 2394  Q 2494 2394 2734 2622  Q 2975 2850 2975 3272  Q 2975 3691 2734 3919  Q 2494 4147 2053 4147  L 1259 4147  z M 628 4666  L 2053 4666  Q 2838 4666 3239 4311  Q 3641 3956 3641 3272  Q 3641 2581 3239 2228  Q 2838 1875 2053 1875  L 1259 1875  L 1259 0  L 628 0  L 628 4666  z "
                      transform="scale(0.015625)" />
                    <path id="DejaVuSans-73"
                      d="M 2834 3397  L 2834 2853  Q 2591 2978 2328 3040  Q 2066 3103 1784 3103  Q 1356 3103 1142 2972  Q 928 2841 928 2578  Q 928 2378 1081 2264  Q 1234 2150 1697 2047  L 1894 2003  Q 2506 1872 2764 1633  Q 3022 1394 3022 966  Q 3022 478 2636 193  Q 2250 -91 1575 -91  Q 1294 -91 989 -36  Q 684 19 347 128  L 347 722  Q 666 556 975 473  Q 1284 391 1588 391  Q 1994 391 2212 530  Q 2431 669 2431 922  Q 2431 1156 2273 1281  Q 2116 1406 1581 1522  L 1381 1569  Q 847 1681 609 1914  Q 372 2147 372 2553  Q 372 3047 722 3315  Q 1072 3584 1716 3584  Q 2034 3584 2315 3537  Q 2597 3491 2834 3397  z "
                      transform="scale(0.015625)" />
                    <path id="DejaVuSans-6e"
                      d="M 3513 2113  L 3513 0  L 2938 0  L 2938 2094  Q 2938 2591 2744 2837  Q 2550 3084 2163 3084  Q 1697 3084 1428 2787  Q 1159 2491 1159 1978  L 1159 0  L 581 0  L 581 3500  L 1159 3500  L 1159 2956  Q 1366 3272 1645 3428  Q 1925 3584 2291 3584  Q 2894 3584 3203 3211  Q 3513 2838 3513 2113  z "
                      transform="scale(0.015625)" />
                    <path id="DejaVuSans-67"
                      d="M 2906 1791  Q 2906 2416 2648 2759  Q 2391 3103 1925 3103  Q 1463 3103 1205 2759  Q 947 2416 947 1791  Q 947 1169 1205 825  Q 1463 481 1925 481  Q 2391 481 2648 825  Q 2906 1169 2906 1791  z M 3481 434  Q 3481 -459 3084 -895  Q 2688 -1331 1869 -1331  Q 1566 -1331 1297 -1286  Q 1028 -1241 775 -1147  L 775 -588  Q 1028 -725 1275 -790  Q 1522 -856 1778 -856  Q 2344 -856 2625 -561  Q 2906 -266 2906 331  L 2906 616  Q 2728 306 2450 153  Q 2172 0 1784 0  Q 1141 0 747 490  Q 353 981 353 1791  Q 353 2603 747 3093  Q 1141 3584 1784 3584  Q 2172 3584 2450 3431  Q 2728 3278 2906 2969  L 2906 3500  L 3481 3500  L 3481 434  z "
                      transform="scale(0.015625)" />
                    <path id="DejaVuSans-28"
                      d="M 1984 4856  Q 1566 4138 1362 3434  Q 1159 2731 1159 2009  Q 1159 1288 1364 580  Q 1569 -128 1984 -844  L 1484 -844  Q 1016 -109 783 600  Q 550 1309 550 2009  Q 550 2706 781 3412  Q 1013 4119 1484 4856  L 1984 4856  z "
                      transform="scale(0.015625)" />
                    <path id="DejaVuSans-68"
                      d="M 3513 2113  L 3513 0  L 2938 0  L 2938 2094  Q 2938 2591 2744 2837  Q 2550 3084 2163 3084  Q 1697 3084 1428 2787  Q 1159 2491 1159 1978  L 1159 0  L 581 0  L 581 4863  L 1159 4863  L 1159 2956  Q 1366 3272 1645 3428  Q 1925 3584 2291 3584  Q 2894 3584 3203 3211  Q 3513 2838 3513 2113  z "
                      transform="scale(0.015625)" />
                    <path id="DejaVuSans-75"
                      d="M 544 1381  L 544 3500  L 1119 3500  L 1119 1403  Q 1119 906 1312 657  Q 1506 409 1894 409  Q 2359 409 2629 706  Q 2900 1003 2900 1516  L 2900 3500  L 3475 3500  L 3475 0  L 2900 0  L 2900 538  Q 2691 219 2414 64  Q 2138 -91 1772 -91  Q 1169 -91 856 284  Q 544 659 544 1381  z M 1991 3584  L 1991 3584  z "
                      transform="scale(0.015625)" />
                    <path id="DejaVuSans-64"
                      d="M 2906 2969  L 2906 4863  L 3481 4863  L 3481 0  L 2906 0  L 2906 525  Q 2725 213 2448 61  Q 2172 -91 1784 -91  Q 1150 -91 751 415  Q 353 922 353 1747  Q 353 2572 751 3078  Q 1150 3584 1784 3584  Q 2172 3584 2448 3432  Q 2725 3281 2906 2969  z M 947 1747  Q 947 1113 1208 752  Q 1469 391 1925 391  Q 2381 391 2643 752  Q 2906 1113 2906 1747  Q 2906 2381 2643 2742  Q 2381 3103 1925 3103  Q 1469 3103 1208 2742  Q 947 2381 947 1747  z "
                      transform="scale(0.015625)" />
                    <path id="DejaVuSans-29"
                      d="M 513 4856  L 1013 4856  Q 1481 4119 1714 3412  Q 1947 2706 1947 2009  Q 1947 1309 1714 600  Q 1481 -109 1013 -844  L 513 -844  Q 928 -128 1133 580  Q 1338 1288 1338 2009  Q 1338 2731 1133 3434  Q 928 4138 513 4856  z "
                      transform="scale(0.015625)" />
                  </defs>
                  <use xlink:href="#DejaVuSans-54" />
                  <use xlink:href="#DejaVuSans-6f" x="44.083984" />
                  <use xlink:href="#DejaVuSans-74" x="105.265625" />
                  <use xlink:href="#DejaVuSans-61" x="144.474609" />
                  <use xlink:href="#DejaVuSans-6c" x="205.753906" />
                  <use xlink:href="#DejaVuSans-20" x="233.537109" />
                  <use xlink:href="#DejaVuSans-50" x="265.324219" />
                  <use xlink:href="#DejaVuSans-61" x="321.126953" />
                  <use xlink:href="#DejaVuSans-73" x="382.40625" />
                  <use xlink:href="#DejaVuSans-73" x="434.505859" />
                  <use xlink:href="#DejaVuSans-65" x="486.605469" />
                  <use xlink:href="#DejaVuSans-6e" x="548.128906" />
                  <use xlink:href="#DejaVuSans-67" x="611.507812" />
                  <use xlink:href="#DejaVuSans-65" x="674.984375" />
                  <use xlink:href="#DejaVuSans-72" x="736.507812" />
                  <use xlink:href="#DejaVuSans-73" x="777.621094" />
                  <use xlink:href="#DejaVuSans-20" x="829.720703" />
                  <use xlink:href="#DejaVuSans-28" x="861.507812" />
                  <use xlink:href="#DejaVuSans-54" x="900.521484" />
                  <use xlink:href="#DejaVuSans-68" x="961.605469" />
                  <use xlink:href="#DejaVuSans-6f" x="1024.984375" />
                  <use xlink:href="#DejaVuSans-75" x="1086.166016" />
                  <use xlink:href="#DejaVuSans-73" x="1149.544922" />
                  <use xlink:href="#DejaVuSans-61" x="1201.644531" />
                  <use xlink:href="#DejaVuSans-6e" x="1262.923828" />
                  <use xlink:href="#DejaVuSans-64" x="1326.302734" />
                  <use xlink:href="#DejaVuSans-73" x="1389.779297" />
                  <use xlink:href="#DejaVuSans-29" x="1441.878906" />
                </g>
              </g>
            </g>
            <g id="maidr-bc200021-0bee-4a65-b89e-5bc56843df54" maidr="c14bf14b-7462-4b12-987e-8b441412c0fd">
              <path
                d="M 161.509091 430.92  L 226.071074 417.797253  L 290.633058 387.00927  L 355.195041 359.922575  L 419.757025 331.658197  L 484.319008 317.610129  L 548.880992 272.101116  L 613.442975 227.433305  L 678.004959 186.887382  L 742.566942 174.185236  L 807.128926 126.404979  L 871.690909 78.12  "
                clip-path="url(#pa28f2191b7)"
                style="fill: none; stroke: #1f77b4; stroke-width: 1.5; stroke-linecap: square" />
              <defs>
                <path id="m1a27ee6c8f"
                  d="M 0 3  C 0.795609 3 1.55874 2.683901 2.12132 2.12132  C 2.683901 1.55874 3 0.795609 3 0  C 3 -0.795609 2.683901 -1.55874 2.12132 -2.12132  C 1.55874 -2.683901 0.795609 -3 0 -3  C -0.795609 -3 -1.55874 -2.683901 -2.12132 -2.12132  C -2.683901 -1.55874 -3 -0.795609 -3 0  C -3 0.795609 -2.683901 1.55874 -2.12132 2.12132  C -1.55874 2.683901 -0.795609 3 0 3  z "
                  style="stroke: #1f77b4" />
              </defs>
              <g clip-path="url(#pa28f2191b7)">
                <use xlink:href="#m1a27ee6c8f" x="161.509091" y="430.92" style="fill: #1f77b4; stroke: #1f77b4" />
                <use xlink:href="#m1a27ee6c8f" x="226.071074" y="417.797253" style="fill: #1f77b4; stroke: #1f77b4" />
                <use xlink:href="#m1a27ee6c8f" x="290.633058" y="387.00927" style="fill: #1f77b4; stroke: #1f77b4" />
                <use xlink:href="#m1a27ee6c8f" x="355.195041" y="359.922575" style="fill: #1f77b4; stroke: #1f77b4" />
                <use xlink:href="#m1a27ee6c8f" x="419.757025" y="331.658197" style="fill: #1f77b4; stroke: #1f77b4" />
                <use xlink:href="#m1a27ee6c8f" x="484.319008" y="317.610129" style="fill: #1f77b4; stroke: #1f77b4" />
                <use xlink:href="#m1a27ee6c8f" x="548.880992" y="272.101116" style="fill: #1f77b4; stroke: #1f77b4" />
                <use xlink:href="#m1a27ee6c8f" x="613.442975" y="227.433305" style="fill: #1f77b4; stroke: #1f77b4" />
                <use xlink:href="#m1a27ee6c8f" x="678.004959" y="186.887382" style="fill: #1f77b4; stroke: #1f77b4" />
                <use xlink:href="#m1a27ee6c8f" x="742.566942" y="174.185236" style="fill: #1f77b4; stroke: #1f77b4" />
                <use xlink:href="#m1a27ee6c8f" x="807.128926" y="126.404979" style="fill: #1f77b4; stroke: #1f77b4" />
                <use xlink:href="#m1a27ee6c8f" x="871.690909" y="78.12" style="fill: #1f77b4; stroke: #1f77b4" />
              </g>
            </g>
            <g id="maidr-278bdaa2-01f7-44f9-8151-09f3d25ef9c3">
              <path d="M 126 448.56  L 126 60.48  "
                style="fill: none; stroke: #000000; stroke-width: 0.8; stroke-linejoin: miter; stroke-linecap: square" />
            </g>
            <g id="maidr-e0033b1c-d299-4d92-b039-c53f9812b214">
              <path d="M 907.2 448.56  L 907.2 60.48  "
                style="fill: none; stroke: #000000; stroke-width: 0.8; stroke-linejoin: miter; stroke-linecap: square" />
            </g>
            <g id="maidr-6f15d344-7f00-4a3c-8dcb-92fbfcc184b5">
              <path d="M 126 448.56  L 907.2 448.56  "
                style="fill: none; stroke: #000000; stroke-width: 0.8; stroke-linejoin: miter; stroke-linecap: square" />
            </g>
            <g id="maidr-6334fa6d-c4e2-40ae-b5dc-1b146ba0ee04">
              <path d="M 126 60.48  L 907.2 60.48  "
                style="fill: none; stroke: #000000; stroke-width: 0.8; stroke-linejoin: miter; stroke-linecap: square" />
            </g>
            <g id="text_13">
              <!-- Total Passengers per Year -->
              <g transform="translate(414.90875 36.5635) scale(0.16 -0.16)">
                <defs>
                  <path id="DejaVuSans-70"
                    d="M 1159 525  L 1159 -1331  L 581 -1331  L 581 3500  L 1159 3500  L 1159 2969  Q 1341 3281 1617 3432  Q 1894 3584 2278 3584  Q 2916 3584 3314 3078  Q 3713 2572 3713 1747  Q 3713 922 3314 415  Q 2916 -91 2278 -91  Q 1894 -91 1617 61  Q 1341 213 1159 525  z M 3116 1747  Q 3116 2381 2855 2742  Q 2594 3103 2138 3103  Q 1681 3103 1420 2742  Q 1159 2381 1159 1747  Q 1159 1113 1420 752  Q 1681 391 2138 391  Q 2594 391 2855 752  Q 3116 1113 3116 1747  z "
                    transform="scale(0.015625)" />
                </defs>
                <use xlink:href="#DejaVuSans-54" />
                <use xlink:href="#DejaVuSans-6f" x="44.083984" />
                <use xlink:href="#DejaVuSans-74" x="105.265625" />
                <use xlink:href="#DejaVuSans-61" x="144.474609" />
                <use xlink:href="#DejaVuSans-6c" x="205.753906" />
                <use xlink:href="#DejaVuSans-20" x="233.537109" />
                <use xlink:href="#DejaVuSans-50" x="265.324219" />
                <use xlink:href="#DejaVuSans-61" x="321.126953" />
                <use xlink:href="#DejaVuSans-73" x="382.40625" />
                <use xlink:href="#DejaVuSans-73" x="434.505859" />
                <use xlink:href="#DejaVuSans-65" x="486.605469" />
                <use xlink:href="#DejaVuSans-6e" x="548.128906" />
                <use xlink:href="#DejaVuSans-67" x="611.507812" />
                <use xlink:href="#DejaVuSans-65" x="674.984375" />
                <use xlink:href="#DejaVuSans-72" x="736.507812" />
                <use xlink:href="#DejaVuSans-73" x="777.621094" />
                <use xlink:href="#DejaVuSans-20" x="829.720703" />
                <use xlink:href="#DejaVuSans-70" x="861.507812" />
                <use xlink:href="#DejaVuSans-65" x="924.984375" />
                <use xlink:href="#DejaVuSans-72" x="986.507812" />
                <use xlink:href="#DejaVuSans-20" x="1027.621094" />
                <use xlink:href="#DejaVuSans-59" x="1059.408203" />
                <use xlink:href="#DejaVuSans-65" x="1107.242188" />
                <use xlink:href="#DejaVuSans-61" x="1168.765625" />
                <use xlink:href="#DejaVuSans-72" x="1230.044922" />
              </g>
              <!-- From the Flights Dataset -->
              <g transform="translate(418.2 54.48) scale(0.16 -0.16)">
                <defs>
                  <path id="DejaVuSans-46"
                    d="M 628 4666  L 3309 4666  L 3309 4134  L 1259 4134  L 1259 2759  L 3109 2759  L 3109 2228  L 1259 2228  L 1259 0  L 628 0  L 628 4666  z "
                    transform="scale(0.015625)" />
                  <path id="DejaVuSans-6d"
                    d="M 3328 2828  Q 3544 3216 3844 3400  Q 4144 3584 4550 3584  Q 5097 3584 5394 3201  Q 5691 2819 5691 2113  L 5691 0  L 5113 0  L 5113 2094  Q 5113 2597 4934 2840  Q 4756 3084 4391 3084  Q 3944 3084 3684 2787  Q 3425 2491 3425 1978  L 3425 0  L 2847 0  L 2847 2094  Q 2847 2600 2669 2842  Q 2491 3084 2119 3084  Q 1678 3084 1418 2786  Q 1159 2488 1159 1978  L 1159 0  L 581 0  L 581 3500  L 1159 3500  L 1159 2956  Q 1356 3278 1631 3431  Q 1906 3584 2284 3584  Q 2666 3584 2933 3390  Q 3200 3197 3328 2828  z "
                    transform="scale(0.015625)" />
                  <path id="DejaVuSans-69"
                    d="M 603 3500  L 1178 3500  L 1178 0  L 603 0  L 603 3500  z M 603 4863  L 1178 4863  L 1178 4134  L 603 4134  L 603 4863  z "
                    transform="scale(0.015625)" />
                  <path id="DejaVuSans-44"
                    d="M 1259 4147  L 1259 519  L 2022 519  Q 2988 519 3436 956  Q 3884 1394 3884 2338  Q 3884 3275 3436 3711  Q 2988 4147 2022 4147  L 1259 4147  z M 628 4666  L 1925 4666  Q 3281 4666 3915 4102  Q 4550 3538 4550 2338  Q 4550 1131 3912 565  Q 3275 0 1925 0  L 628 0  L 628 4666  z "
                    transform="scale(0.015625)" />
                </defs>
                <use xlink:href="#DejaVuSans-46" />
                <use xlink:href="#DejaVuSans-72" x="50.269531" />
                <use xlink:href="#DejaVuSans-6f" x="89.132812" />
                <use xlink:href="#DejaVuSans-6d" x="150.314453" />
                <use xlink:href="#DejaVuSans-20" x="247.726562" />
                <use xlink:href="#DejaVuSans-74" x="279.513672" />
                <use xlink:href="#DejaVuSans-68" x="318.722656" />
                <use xlink:href="#DejaVuSans-65" x="382.101562" />
                <use xlink:href="#DejaVuSans-20" x="443.625" />
                <use xlink:href="#DejaVuSans-46" x="475.412109" />
                <use xlink:href="#DejaVuSans-6c" x="532.931641" />
                <use xlink:href="#DejaVuSans-69" x="560.714844" />
                <use xlink:href="#DejaVuSans-67" x="588.498047" />
                <use xlink:href="#DejaVuSans-68" x="651.974609" />
                <use xlink:href="#DejaVuSans-74" x="715.353516" />
                <use xlink:href="#DejaVuSans-73" x="754.5625" />
                <use xlink:href="#DejaVuSans-20" x="806.662109" />
                <use xlink:href="#DejaVuSans-44" x="838.449219" />
                <use xlink:href="#DejaVuSans-61" x="915.451172" />
                <use xlink:href="#DejaVuSans-74" x="976.730469" />
                <use xlink:href="#DejaVuSans-61" x="1015.939453" />
                <use xlink:href="#DejaVuSans-73" x="1077.21875" />
                <use xlink:href="#DejaVuSans-65" x="1129.318359" />
                <use xlink:href="#DejaVuSans-74" x="1190.841797" />
              </g>
            </g>
          </g>
        </g>
        <defs>
          <clipPath id="pa28f2191b7">
            <rect x="126" y="60.48" width="781.2" height="388.08" />
          </clipPath>
        </defs>`;

const smoothData: MaidrData = {
  "id": "a6b8ffb5-9a9d-44be-9151-439a5373e405",
  "subplots": [
    [
      {
        "id": "599348d6-602e-4fde-a4ca-504d759db44a",
        "layers": [
          {
            "id": "c8cdf051-8c1b-4427-9589-39677dd422e3",
            "type": TraceType.SMOOTH,
            "title": "KDE: Plot of Random Data",
            "axes": {
              "x": "Value",
              "y": "Density"
            },
            "data": [
              [
                {
                  "x": -4.090659720653128,
                  "y": 0.00003130990414432069,
                  "svg_x": 70.71000000000001,
                  "svg_y": 390.01265590666407
                },
                {
                  "x": -4.046474878482817,
                  "y": 0.00004940157954895194,
                  "svg_x": 72.38738693467339,
                  "svg_y": 389.9968557796951
                },
                {
                  "x": -4.002290036312505,
                  "y": 0.00007607327310168,
                  "svg_x": 74.06477386934678,
                  "svg_y": 389.9735624066279
                },
                {
                  "x": -3.9581051941421945,
                  "y": 0.00011432974593037363,
                  "svg_x": 75.74216080402013,
                  "svg_y": 389.94015161881754
                },
                {
                  "x": -3.9139203519718837,
                  "y": 0.00016769783590326188,
                  "svg_x": 77.41954773869348,
                  "svg_y": 389.89354329875846
                },
                {
                  "x": -3.8697355098015724,
                  "y": 0.00024007344105625092,
                  "svg_x": 79.09693467336685,
                  "svg_y": 389.8303350150977
                },
                {
                  "x": -3.825550667631261,
                  "y": 0.0003354436629372707,
                  "svg_x": 80.77432160804022,
                  "svg_y": 389.74704468509356
                },
                {
                  "x": -3.7813658254609503,
                  "y": 0.0004574762153518218,
                  "svg_x": 82.45170854271358,
                  "svg_y": 389.64046915909194
                },
                {
                  "x": -3.737180983290639,
                  "y": 0.0006089919549181578,
                  "svg_x": 84.12909547738695,
                  "svg_y": 389.5081448790347
                },
                {
                  "x": -3.6929961411203283,
                  "y": 0.0007913668341964648,
                  "svg_x": 85.80648241206032,
                  "svg_y": 389.34887017483504
                },
                {
                  "x": -3.648811298950017,
                  "y": 0.001003941753084901,
                  "svg_x": 87.4838693467337,
                  "svg_y": 389.1632206629054
                },
                {
                  "x": -3.604626456779706,
                  "y": 0.0012435452535690175,
                  "svg_x": 89.16125628140705,
                  "svg_y": 388.95396609442633
                },
                {
                  "x": -3.560441614609395,
                  "y": 0.0015042461494080136,
                  "svg_x": 90.83864321608043,
                  "svg_y": 388.7262863929583
                },
                {
                  "x": -3.5162567724390836,
                  "y": 0.0017774433516954526,
                  "svg_x": 92.5160301507538,
                  "svg_y": 388.4876932064695
                },
                {
                  "x": -3.472071930268773,
                  "y": 0.002052364207035492,
                  "svg_x": 94.19341708542716,
                  "svg_y": 388.2475946902381
                },
                {
                  "x": -3.4278870880984615,
                  "y": 0.002316982220368148,
                  "svg_x": 95.87080402010052,
                  "svg_y": 388.0164940256824
                },
                {
                  "x": -3.3837022459281507,
                  "y": 0.002559288528300005,
                  "svg_x": 97.5481909547739,
                  "svg_y": 387.8048789958368
                },
                {
                  "x": -3.3395174037578395,
                  "y": 0.002768773463206442,
                  "svg_x": 99.22557788944727,
                  "svg_y": 387.6219280808119
                },
                {
                  "x": -3.2953325615875286,
                  "y": 0.002937912950730226,
                  "svg_x": 100.90296482412062,
                  "svg_y": 387.4742123320726
                },
                {
                  "x": -3.2511477194172174,
                  "y": 0.0030634264478196717,
                  "svg_x": 102.580351758794,
                  "svg_y": 387.36459676878286
                },
                {
                  "x": -3.206962877246906,
                  "y": 0.003147090269864315,
                  "svg_x": 104.25773869346736,
                  "svg_y": 387.2915300692401
                },
                {
                  "x": -3.1627780350765953,
                  "y": 0.003195954713735132,
                  "svg_x": 105.93512562814071,
                  "svg_y": 387.2488549493211
                },
                {
                  "x": -3.118593192906284,
                  "y": 0.003221916448122887,
                  "svg_x": 107.61251256281409,
                  "svg_y": 387.226181609761
                },
                {
                  "x": -3.0744083507359727,
                  "y": 0.0032407201625036775,
                  "svg_x": 109.28989949748747,
                  "svg_y": 387.2097596329092
                },
                {
                  "x": -3.030223508565662,
                  "y": 0.0032705799740616803,
                  "svg_x": 110.96728643216083,
                  "svg_y": 387.1836819588776
                },
                {
                  "x": -2.986038666395351,
                  "y": 0.003330695294811018,
                  "svg_x": 112.6446733668342,
                  "svg_y": 387.1311810334864
                },
                {
                  "x": -2.94185382422504,
                  "y": 0.003439966724407699,
                  "svg_x": 114.32206030150756,
                  "svg_y": 387.03575026640186
                },
                {
                  "x": -2.8976689820547286,
                  "y": 0.003616184369685506,
                  "svg_x": 115.99944723618094,
                  "svg_y": 386.8818529016033
                },
                {
                  "x": -2.8534841398844177,
                  "y": 0.0038758663520965255,
                  "svg_x": 117.67683417085428,
                  "svg_y": 386.6550630547879
                },
                {
                  "x": -2.8092992977141065,
                  "y": 0.004234785019886466,
                  "svg_x": 119.35422110552767,
                  "svg_y": 386.3416061528822
                },
                {
                  "x": -2.765114455543795,
                  "y": 0.004709059027274733,
                  "svg_x": 121.03160804020102,
                  "svg_y": 385.92740518104165
                },
                {
                  "x": -2.7209296133734844,
                  "y": 0.005316543236077628,
                  "svg_x": 122.70899497487441,
                  "svg_y": 385.39686683033267
                },
                {
                  "x": -2.6767447712031736,
                  "y": 0.006078147298138619,
                  "svg_x": 124.38638190954775,
                  "svg_y": 384.7317299310948
                },
                {
                  "x": -2.6325599290328623,
                  "y": 0.007018683279955856,
                  "svg_x": 126.06376884422113,
                  "svg_y": 383.9103251911113
                },
                {
                  "x": -2.588375086862551,
                  "y": 0.00816689653076014,
                  "svg_x": 127.7411557788945,
                  "svg_y": 382.9075482373789
                },
                {
                  "x": -2.54419024469224,
                  "y": 0.00955447058922441,
                  "svg_x": 129.41854271356786,
                  "svg_y": 381.69572866775593
                },
                {
                  "x": -2.500005402521929,
                  "y": 0.011213998114074414,
                  "svg_x": 131.09592964824122,
                  "svg_y": 380.2464021120498
                },
                {
                  "x": -2.4558205603516177,
                  "y": 0.013176142299326211,
                  "svg_x": 132.7733165829146,
                  "svg_y": 378.5327892727166
                },
                {
                  "x": -2.411635718181307,
                  "y": 0.015466432767102797,
                  "svg_x": 134.45070351758795,
                  "svg_y": 376.53259418976427
                },
                {
                  "x": -2.367450876010996,
                  "y": 0.018102298264606652,
                  "svg_x": 136.12809045226132,
                  "svg_y": 374.23059569585735
                },
                {
                  "x": -2.3232660338406848,
                  "y": 0.021090992314206837,
                  "svg_x": 137.8054773869347,
                  "svg_y": 371.6204590225546
                },
                {
                  "x": -2.2790811916703735,
                  "y": 0.024428988799018718,
                  "svg_x": 139.48286432160808,
                  "svg_y": 368.7052636576999
                },
                {
                  "x": -2.2348963495000627,
                  "y": 0.02810320766963468,
                  "svg_x": 141.16025125628144,
                  "svg_y": 365.49643289055643
                },
                {
                  "x": -2.1907115073297514,
                  "y": 0.03209410150887552,
                  "svg_x": 142.8376381909548,
                  "svg_y": 362.01103820104174
                },
                {
                  "x": -2.14652666515944,
                  "y": 0.03638024637711627,
                  "svg_x": 144.51502512562817,
                  "svg_y": 358.2677899052919
                },
                {
                  "x": -2.1023418229891293,
                  "y": 0.04094371272125957,
                  "svg_x": 146.1924120603015,
                  "svg_y": 354.2823465428893
                },
                {
                  "x": -2.058156980818818,
                  "y": 0.045775230098893754,
                  "svg_x": 147.8697989949749,
                  "svg_y": 350.06280433288975
                },
                {
                  "x": -2.013972138648507,
                  "y": 0.05087807783074991,
                  "svg_x": 149.54718592964826,
                  "svg_y": 345.60629932362684
                },
                {
                  "x": -1.969787296478196,
                  "y": 0.05626977565145946,
                  "svg_x": 151.22457286432166,
                  "svg_y": 340.89753088508985
                },
                {
                  "x": -1.9256024543078851,
                  "y": 0.06198100985542495,
                  "svg_x": 152.901959798995,
                  "svg_y": 335.909699545316
                },
                {
                  "x": -1.8814176121375739,
                  "y": 0.06805175414252536,
                  "svg_x": 154.57934673366836,
                  "svg_y": 330.6078947988169
                },
                {
                  "x": -1.837232769967263,
                  "y": 0.07452512761687477,
                  "svg_x": 156.2567336683417,
                  "svg_y": 324.9544591426496
                },
                {
                  "x": -1.7930479277969518,
                  "y": 0.08144004739823013,
                  "svg_x": 157.9341206030151,
                  "svg_y": 318.9154048216907
                },
                {
                  "x": -1.7488630856266405,
                  "y": 0.08882405659950532,
                  "svg_x": 159.61150753768845,
                  "svg_y": 312.46667742022527
                },
                {
                  "x": -1.7046782434563297,
                  "y": 0.09668775184442237,
                  "svg_x": 161.28889447236185,
                  "svg_y": 305.5990225161777
                },
                {
                  "x": -1.6604934012860184,
                  "y": 0.10502196952360994,
                  "svg_x": 162.9662814070352,
                  "svg_y": 298.320443027372
                },
                {
                  "x": -1.6163085591157076,
                  "y": 0.11379835840206126,
                  "svg_x": 164.64366834170855,
                  "svg_y": 290.65569913233304
                },
                {
                  "x": -1.5721237169453963,
                  "y": 0.12297327358409418,
                  "svg_x": 166.32105527638194,
                  "svg_y": 282.6429075271602
                },
                {
                  "x": -1.527938874775085,
                  "y": 0.13249421999549524,
                  "svg_x": 167.9984422110553,
                  "svg_y": 274.3279140950715
                },
                {
                  "x": -1.4837540326047742,
                  "y": 0.14230750717421917,
                  "svg_x": 169.67582914572867,
                  "svg_y": 265.75760869553903
                },
                {
                  "x": -1.439569190434463,
                  "y": 0.15236547832193598,
                  "svg_x": 171.35321608040204,
                  "svg_y": 256.97361176711854
                },
                {
                  "x": -1.3953843482641521,
                  "y": 0.1626317155316665,
                  "svg_x": 173.03060301507543,
                  "svg_y": 248.00772841029658
                },
                {
                  "x": -1.3511995060938409,
                  "y": 0.17308299772117272,
                  "svg_x": 174.70798994974876,
                  "svg_y": 238.8802384520938
                },
                {
                  "x": -1.30701466392353,
                  "y": 0.18370742466476686,
                  "svg_x": 176.38537688442213,
                  "svg_y": 229.60153479823182
                },
                {
                  "x": -1.2628298217532188,
                  "y": 0.19449889202295975,
                  "svg_x": 178.0627638190955,
                  "svg_y": 220.17694859338522
                },
                {
                  "x": -1.2186449795829075,
                  "y": 0.2054488548588255,
                  "svg_x": 179.7401507537689,
                  "svg_y": 210.61394244592802
                },
                {
                  "x": -1.1744601374125967,
                  "y": 0.2165369037626608,
                  "svg_x": 181.41753768844222,
                  "svg_y": 200.9303406456211
                },
                {
                  "x": -1.1302752952422854,
                  "y": 0.22772198721362596,
                  "svg_x": 183.09492462311562,
                  "svg_y": 191.1619949987251
                },
                {
                  "x": -1.0860904530719746,
                  "y": 0.23893609109306826,
                  "svg_x": 184.77231155778895,
                  "svg_y": 181.36830474198078
                },
                {
                  "x": -1.0419056109016633,
                  "y": 0.2500818398791641,
                  "svg_x": 186.44969849246235,
                  "svg_y": 171.6343115077452
                },
                {
                  "x": -0.9977207687313525,
                  "y": 0.2610348806492031,
                  "svg_x": 188.12708542713568,
                  "svg_y": 162.06861728692533
                },
                {
                  "x": -0.9535359265610412,
                  "y": 0.2716511589935541,
                  "svg_x": 189.80447236180905,
                  "svg_y": 152.79703010513026
                },
                {
                  "x": -0.90935108439073,
                  "y": 0.28177842263187014,
                  "svg_x": 191.48185929648247,
                  "svg_y": 143.95251749062885
                },
                {
                  "x": -0.8651662422204192,
                  "y": 0.29127061621789874,
                  "svg_x": 193.1592462311558,
                  "svg_y": 135.6626349607336
                },
                {
                  "x": -0.8209814000501079,
                  "y": 0.30000335676177387,
                  "svg_x": 194.83663316582917,
                  "svg_y": 128.03601076510688
                },
                {
                  "x": -0.7767965578797971,
                  "y": 0.3078884629472529,
                  "svg_x": 196.51402010050253,
                  "svg_y": 121.14965689748414
                },
                {
                  "x": -0.7326117157094858,
                  "y": 0.3148855717629324,
                  "svg_x": 198.1914070351759,
                  "svg_y": 115.03882386345772
                },
                {
                  "x": -0.6884268735391745,
                  "y": 0.32100919334303957,
                  "svg_x": 199.8687939698493,
                  "svg_y": 109.69083942798028
                },
                {
                  "x": -0.6442420313688637,
                  "y": 0.3263300819174363,
                  "svg_x": 201.54618090452263,
                  "svg_y": 105.04391131419479
                },
                {
                  "x": -0.6000571891985524,
                  "y": 0.3309704701335142,
                  "svg_x": 203.223567839196,
                  "svg_y": 100.99128924578093
                },
                {
                  "x": -0.5558723470282416,
                  "y": 0.33509344713360784,
                  "svg_x": 204.9009547738694,
                  "svg_y": 97.39054146346182
                },
                {
                  "x": -0.5116875048579304,
                  "y": 0.3388874734755469,
                  "svg_x": 206.57834170854272,
                  "svg_y": 94.07707841564785
                },
                {
                  "x": -0.46750266268761953,
                  "y": 0.34254763379388015,
                  "svg_x": 208.25572864321612,
                  "svg_y": 90.88052550039473
                },
                {
                  "x": -0.42331782051730826,
                  "y": 0.3462556531994323,
                  "svg_x": 209.93311557788948,
                  "svg_y": 87.64217548024303
                },
                {
                  "x": -0.379132978346997,
                  "y": 0.35016088460650785,
                  "svg_x": 211.61050251256287,
                  "svg_y": 84.23159295015594
                },
                {
                  "x": -0.3349481361766862,
                  "y": 0.35436437876964516,
                  "svg_x": 213.28788944723618,
                  "svg_y": 80.56052656158184
                },
                {
                  "x": -0.2907632940063749,
                  "y": 0.3589077829052686,
                  "svg_x": 214.96527638190958,
                  "svg_y": 76.59260426534928
                },
                {
                  "x": -0.24657845183606408,
                  "y": 0.36376822627732547,
                  "svg_x": 216.6426633165829,
                  "svg_y": 72.34779991824182
                },
                {
                  "x": -0.20239360966575282,
                  "y": 0.3688596280403082,
                  "svg_x": 218.32005025125628,
                  "svg_y": 67.90129109548116
                },
                {
                  "x": -0.158208767495442,
                  "y": 0.37404011136746473,
                  "svg_x": 219.9974371859297,
                  "svg_y": 63.376984059284666
                },
                {
                  "x": -0.11402392532513073,
                  "y": 0.3791245353462726,
                  "svg_x": 221.67482412060306,
                  "svg_y": 58.93656919263699
                },
                {
                  "x": -0.0698390831548199,
                  "y": 0.3839006470696864,
                  "svg_x": 223.35221105527637,
                  "svg_y": 54.76541478265602
                },
                {
                  "x": -0.025654240984508192,
                  "y": 0.3881470589083364,
                  "svg_x": 225.0295979899498,
                  "svg_y": 51.05686680616102
                },
                {
                  "x": 0.01853060118580263,
                  "y": 0.3916511783707175,
                  "svg_x": 226.70698492462313,
                  "svg_y": 47.996590121895395
                },
                {
                  "x": 0.06271544335611345,
                  "y": 0.3942253366467558,
                  "svg_x": 228.3843718592965,
                  "svg_y": 45.748482818950734
                },
                {
                  "x": 0.10690028552642428,
                  "y": 0.3957196363213503,
                  "svg_x": 230.06175879396986,
                  "svg_y": 44.44345583497918
                },
                {
                  "x": 0.151085127696736,
                  "y": 0.39603042641955505,
                  "svg_x": 231.73914572864328,
                  "svg_y": 44.17203138685543
                },
                {
                  "x": 0.1952699698670468,
                  "y": 0.3951037788258021,
                  "svg_x": 233.41653266331664,
                  "svg_y": 44.98130688563249
                },
                {
                  "x": 0.23945481203735763,
                  "y": 0.3929338567226222,
                  "svg_x": 235.09391959798995,
                  "svg_y": 46.87637983914471
                },
                {
                  "x": 0.28363965420766934,
                  "y": 0.38955660570240125,
                  "svg_x": 236.77130653266335,
                  "svg_y": 49.82585763664865
                },
                {
                  "x": 0.32782449637798017,
                  "y": 0.3850397242779236,
                  "svg_x": 238.4486934673367,
                  "svg_y": 53.770616671641264
                },
                {
                  "x": 0.372009338548291,
                  "y": 0.37947032874379705,
                  "svg_x": 240.12608040201007,
                  "svg_y": 58.63457507303636
                },
                {
                  "x": 0.4161941807186018,
                  "y": 0.372942049436482,
                  "svg_x": 241.80346733668344,
                  "svg_y": 64.33596201689767
                },
                {
                  "x": 0.4603790228889135,
                  "y": 0.3655434111757971,
                  "svg_x": 243.4808542713568,
                  "svg_y": 70.79746551515571
                },
                {
                  "x": 0.5045638650592243,
                  "y": 0.3573492075739796,
                  "svg_x": 245.1582412060302,
                  "svg_y": 77.95376554943806
                },
                {
                  "x": 0.5487487072295352,
                  "y": 0.3484161627521771,
                  "svg_x": 246.83562814070353,
                  "svg_y": 85.75532285396146
                },
                {
                  "x": 0.5929335493998469,
                  "y": 0.3387835224962189,
                  "svg_x": 248.51301507537693,
                  "svg_y": 94.16786263740713
                },
                {
                  "x": 0.6371183915701577,
                  "y": 0.3284784205214732,
                  "svg_x": 250.19040201005024,
                  "svg_y": 103.16768802602685
                },
                {
                  "x": 0.6813032337404685,
                  "y": 0.31752505393460234,
                  "svg_x": 251.86778894472366,
                  "svg_y": 112.7336667946952
                },
                {
                  "x": 0.7254880759107802,
                  "y": 0.3059560185697742,
                  "svg_x": 253.54517587939702,
                  "svg_y": 122.83733179998868
                },
                {
                  "x": 0.7696729180810911,
                  "y": 0.29382372648592153,
                  "svg_x": 255.2225628140704,
                  "svg_y": 133.43290965899396
                },
                {
                  "x": 0.8138577602514019,
                  "y": 0.2812097378049739,
                  "svg_x": 256.8999497487437,
                  "svg_y": 144.44917091101868
                },
                {
                  "x": 0.8580426024217127,
                  "y": 0.26823011005451347,
                  "svg_x": 258.5773366834171,
                  "svg_y": 155.78475823947977
                },
                {
                  "x": 0.9022274445920244,
                  "y": 0.25503545937694905,
                  "svg_x": 260.2547236180905,
                  "svg_y": 167.3081330156758
                },
                {
                  "x": 0.9464122867623352,
                  "y": 0.241805244640202,
                  "svg_x": 261.93211055276385,
                  "svg_y": 178.8625671956059
                },
                {
                  "x": 0.9905971289326461,
                  "y": 0.2287366979512775,
                  "svg_x": 263.60949748743724,
                  "svg_y": 190.2758107104763
                },
                {
                  "x": 1.0347819711029578,
                  "y": 0.21602969136412215,
                  "svg_x": 265.2868844221106,
                  "svg_y": 201.37330792852399
                },
                {
                  "x": 1.0789668132732686,
                  "y": 0.20386951697380692,
                  "svg_x": 266.96427135678397,
                  "svg_y": 211.99323643347245
                },
                {
                  "x": 1.1231516554435794,
                  "y": 0.19240996017254688,
                  "svg_x": 268.64165829145725,
                  "svg_y": 222.00128977394942
                },
                {
                  "x": 1.1673364976138902,
                  "y": 0.18175909718993138,
                  "svg_x": 270.3190452261307,
                  "svg_y": 231.3030809950905
                },
                {
                  "x": 1.211521339784202,
                  "y": 0.17196992964293195,
                  "svg_x": 271.9964321608041,
                  "svg_y": 239.85232183121636
                },
                {
                  "x": 1.2557061819545128,
                  "y": 0.16303731457455878,
                  "svg_x": 273.67381909547737,
                  "svg_y": 247.65350381622972
                },
                {
                  "x": 1.2998910241248236,
                  "y": 0.15490174451017114,
                  "svg_x": 275.35120603015076,
                  "svg_y": 254.75859702111066
                },
                {
                  "x": 1.3440758662951353,
                  "y": 0.14745951009473,
                  "svg_x": 277.02859296482416,
                  "svg_y": 261.25817464822086
                },
                {
                  "x": 1.3882607084654461,
                  "y": 0.14057779975761067,
                  "svg_x": 278.70597989949755,
                  "svg_y": 267.268225937467
                },
                {
                  "x": 1.432445550635757,
                  "y": 0.13411252411764132,
                  "svg_x": 280.38336683417083,
                  "svg_y": 272.9145894563934
                },
                {
                  "x": 1.4766303928060678,
                  "y": 0.12792623967307265,
                  "svg_x": 282.0607537688443,
                  "svg_y": 278.31729968108544
                },
                {
                  "x": 1.5208152349763795,
                  "y": 0.12190357217991503,
                  "svg_x": 283.7381407035176,
                  "svg_y": 283.57711719137956
                },
                {
                  "x": 1.5650000771466903,
                  "y": 0.11596201041823524,
                  "svg_x": 285.41552763819095,
                  "svg_y": 288.76610207691124
                },
                {
                  "x": 1.6091849193170011,
                  "y": 0.11005677379190186,
                  "svg_x": 287.09291457286434,
                  "svg_y": 293.92336288284264
                },
                {
                  "x": 1.6533697614873129,
                  "y": 0.1041794959941977,
                  "svg_x": 288.7703015075377,
                  "svg_y": 299.05620621320224
                },
                {
                  "x": 1.6975546036576237,
                  "y": 0.09835151283339667,
                  "svg_x": 290.44768844221113,
                  "svg_y": 304.1459987202113
                },
                {
                  "x": 1.7417394458279345,
                  "y": 0.09261339706378388,
                  "svg_x": 292.1250753768844,
                  "svg_y": 309.1573067220882
                },
                {
                  "x": 1.7859242879982453,
                  "y": 0.08701289282645258,
                  "svg_x": 293.8024623115578,
                  "svg_y": 314.04843350062254
                },
                {
                  "x": 1.830109130168557,
                  "y": 0.08159348966267956,
                  "svg_x": 295.4798492462312,
                  "svg_y": 318.7813980364436
                },
                {
                  "x": 1.8742939723388679,
                  "y": 0.0763855528957766,
                  "svg_x": 297.15723618090453,
                  "svg_y": 323.32968117347247
                },
                {
                  "x": 1.9184788145091787,
                  "y": 0.07140128599983042,
                  "svg_x": 298.8346231155779,
                  "svg_y": 327.68262516798353
                },
                {
                  "x": 1.9626636566794904,
                  "y": 0.06663398846512668,
                  "svg_x": 300.51201005025126,
                  "svg_y": 331.8460818220832
                },
                {
                  "x": 2.006848498849801,
                  "y": 0.06206125598316489,
                  "svg_x": 302.18939698492466,
                  "svg_y": 335.8396176441818
                },
                {
                  "x": 2.051033341020112,
                  "y": 0.05765109900480679,
                  "svg_x": 303.866783919598,
                  "svg_y": 339.6911702866393
                },
                {
                  "x": 2.095218183190423,
                  "y": 0.05336953822680194,
                  "svg_x": 305.54417085427133,
                  "svg_y": 343.4304151274219
                },
                {
                  "x": 2.1394030253607346,
                  "y": 0.04918812043192671,
                  "svg_x": 307.2215577889447,
                  "svg_y": 347.08220140988345
                },
                {
                  "x": 2.1835878675310454,
                  "y": 0.04508997402881915,
                  "svg_x": 308.8989447236181,
                  "svg_y": 350.66126371662773
                },
                {
                  "x": 2.227772709701356,
                  "y": 0.04107342782164594,
                  "svg_x": 310.5763316582915,
                  "svg_y": 354.1690615645742
                },
                {
                  "x": 2.271957551871668,
                  "y": 0.03715275152929256,
                  "svg_x": 312.25371859296484,
                  "svg_y": 357.5931326822549
                },
                {
                  "x": 2.3161423940419787,
                  "y": 0.03335613121151739,
                  "svg_x": 313.93110552763824,
                  "svg_y": 360.9088611447775
                },
                {
                  "x": 2.3603272362122896,
                  "y": 0.029721463665121975,
                  "svg_x": 315.6084924623116,
                  "svg_y": 364.0831502826634
                },
                {
                  "x": 2.4045120783826004,
                  "y": 0.026290863920869323,
                  "svg_x": 317.2858793969849,
                  "svg_y": 367.0792194872361
                },
                {
                  "x": 2.448696920552912,
                  "y": 0.02310489079809747,
                  "svg_x": 318.9632663316583,
                  "svg_y": 369.8616472466169
                },
                {
                  "x": 2.492881762723223,
                  "y": 0.020197411492372003,
                  "svg_x": 320.6406532663317,
                  "svg_y": 372.4008560906129
                },
                {
                  "x": 2.5370666048935337,
                  "y": 0.017591789775999962,
                  "svg_x": 322.3180402010051,
                  "svg_y": 374.67644157570675
                },
                {
                  "x": 2.5812514470638455,
                  "y": 0.01529876128924196,
                  "svg_x": 323.9954271356784,
                  "svg_y": 376.67902787155583
                },
                {
                  "x": 2.6254362892341563,
                  "y": 0.013316029334183386,
                  "svg_x": 325.67281407035176,
                  "svg_y": 378.4106207691025
                },
                {
                  "x": 2.669621131404467,
                  "y": 0.01162934173930686,
                  "svg_x": 327.35020100502516,
                  "svg_y": 379.88366721505133
                },
                {
                  "x": 2.713805973574779,
                  "y": 0.010214636781484931,
                  "svg_x": 329.02758793969855,
                  "svg_y": 381.1191811990967
                },
                {
                  "x": 2.7579908157450896,
                  "y": 0.009040787223736605,
                  "svg_x": 330.7049748743719,
                  "svg_y": 382.1443472846079
                },
                {
                  "x": 2.8021756579154005,
                  "y": 0.008072511565588254,
                  "svg_x": 332.3823618090452,
                  "svg_y": 382.9899781063835
                },
                {
                  "x": 2.8463605000857113,
                  "y": 0.00727312623331302,
                  "svg_x": 334.0597487437186,
                  "svg_y": 383.6881107814732
                },
                {
                  "x": 2.890545342256023,
                  "y": 0.006606939789464267,
                  "svg_x": 335.737135678392,
                  "svg_y": 384.2699159577439
                },
                {
                  "x": 2.934730184426334,
                  "y": 0.006041203199682887,
                  "svg_x": 337.41452261306534,
                  "svg_y": 384.7639945739927
                },
                {
                  "x": 2.9789150265966446,
                  "y": 0.0055476053537744045,
                  "svg_x": 339.0919095477387,
                  "svg_y": 385.1950717662671
                },
                {
                  "x": 3.0230998687669564,
                  "y": 0.005103334328184673,
                  "svg_x": 340.76929648241213,
                  "svg_y": 385.583070028228
                },
                {
                  "x": 3.067284710937267,
                  "y": 0.00469172161203444,
                  "svg_x": 342.44668341708547,
                  "svg_y": 385.942546584808
                },
                {
                  "x": 3.111469553107578,
                  "y": 0.004302467273663569,
                  "svg_x": 344.1240703517588,
                  "svg_y": 386.2824967459695
                },
                {
                  "x": 3.155654395277889,
                  "y": 0.0039314288367225045,
                  "svg_x": 345.8014572864322,
                  "svg_y": 386.6065382889954
                },
                {
                  "x": 3.1998392374482005,
                  "y": 0.00357996005874073,
                  "svg_x": 347.4788442211056,
                  "svg_y": 386.9134889275373
                },
                {
                  "x": 3.2440240796185114,
                  "y": 0.00325381308477103,
                  "svg_x": 349.1562311557789,
                  "svg_y": 387.1983251013032
                },
                {
                  "x": 3.288208921788822,
                  "y": 0.0029616641378080047,
                  "svg_x": 350.83361809045226,
                  "svg_y": 387.4534695449565
                },
                {
                  "x": 3.332393763959134,
                  "y": 0.002713377658558054,
                  "svg_x": 352.51100502512566,
                  "svg_y": 387.6703072788363
                },
                {
                  "x": 3.3765786061294447,
                  "y": 0.0025181727194137945,
                  "svg_x": 354.18839195979905,
                  "svg_y": 387.840786947218
                },
                {
                  "x": 3.4207634482997555,
                  "y": 0.002382886367062822,
                  "svg_x": 355.8657788944724,
                  "svg_y": 387.9589375052238
                },
                {
                  "x": 3.4649482904700664,
                  "y": 0.0023105334984811314,
                  "svg_x": 357.5431658291457,
                  "svg_y": 388.0221259321987
                },
                {
                  "x": 3.509133132640378,
                  "y": 0.002299339525314164,
                  "svg_x": 359.22055276381917,
                  "svg_y": 388.03190204156226
                },
                {
                  "x": 3.553317974810689,
                  "y": 0.002342372821469825,
                  "svg_x": 360.8979396984925,
                  "svg_y": 387.9943194778723
                },
                {
                  "x": 3.5975028169809997,
                  "y": 0.0024278347355157397,
                  "svg_x": 362.57532663316584,
                  "svg_y": 387.9196824383092
                },
                {
                  "x": 3.6416876591513114,
                  "y": 0.002539984145932302,
                  "svg_x": 364.25271356783924,
                  "svg_y": 387.82173822449556
                },
                {
                  "x": 3.6858725013216223,
                  "y": 0.00266059114609928,
                  "svg_x": 365.9301005025126,
                  "svg_y": 387.71640768581597
                },
                {
                  "x": 3.730057343491933,
                  "y": 0.0027707415340285407,
                  "svg_x": 367.60748743718597,
                  "svg_y": 387.6202092920222
                },
                {
                  "x": 3.774242185662244,
                  "y": 0.0028527615963428567,
                  "svg_x": 369.2848743718593,
                  "svg_y": 387.548578148439
                },
                {
                  "x": 3.8184270278325556,
                  "y": 0.0028920110633454373,
                  "svg_x": 370.9622613065327,
                  "svg_y": 387.5143001422159
                },
                {
                  "x": 3.8626118700028664,
                  "y": 0.0028783073053032645,
                  "svg_x": 372.6396482412061,
                  "svg_y": 387.52626813921876
                },
                {
                  "x": 3.9067967121731773,
                  "y": 0.0028067962210261664,
                  "svg_x": 374.3170351758794,
                  "svg_y": 387.5887214049333
                },
                {
                  "x": 3.950981554343488,
                  "y": 0.0026781680364643024,
                  "svg_x": 375.9944221105527,
                  "svg_y": 387.70105713959646
                },
                {
                  "x": 3.9951663965138,
                  "y": 0.00249821579518853,
                  "svg_x": 377.67180904522615,
                  "svg_y": 387.85821606473297
                },
                {
                  "x": 4.0393512386841115,
                  "y": 0.0022768327260684323,
                  "svg_x": 379.3491959798996,
                  "svg_y": 388.05155805891803
                },
                {
                  "x": 4.083536080854421,
                  "y": 0.0020266235580977277,
                  "svg_x": 381.0265829145729,
                  "svg_y": 388.2700749477258
                },
                {
                  "x": 4.127720923024733,
                  "y": 0.0017613498743171332,
                  "svg_x": 382.7039698492462,
                  "svg_y": 388.5017482334508
                },
                {
                  "x": 4.171905765195045,
                  "y": 0.0014944339249074296,
                  "svg_x": 384.3813567839196,
                  "svg_y": 388.73485577028185
                },
                {
                  "x": 4.216090607365355,
                  "y": 0.0012377111179778001,
                  "svg_x": 386.058743718593,
                  "svg_y": 388.9590612600776
                },
                {
                  "x": 4.2602754495356665,
                  "y": 0.0010005588724088612,
                  "svg_x": 387.7361306532664,
                  "svg_y": 389.1661750572889
                },
                {
                  "x": 4.304460291705976,
                  "y": 0.0007894538513937033,
                  "svg_x": 389.4135175879397,
                  "svg_y": 389.350540853227
                },
                {
                  "x": 4.348645133876288,
                  "y": 0.0006079369247854676,
                  "svg_x": 391.09090452261313,
                  "svg_y": 389.5090662757368
                },
                {
                  "x": 4.3928299760466,
                  "y": 0.0004569087173062373,
                  "svg_x": 392.76829145728647,
                  "svg_y": 389.6409647760525
                },
                {
                  "x": 4.43701481821691,
                  "y": 0.0003351459303867038,
                  "svg_x": 394.4456783919598,
                  "svg_y": 389.747304705904
                },
                {
                  "x": 4.4811996603872215,
                  "y": 0.00023992108230452394,
                  "svg_x": 396.1230653266332,
                  "svg_y": 389.8304680756114
                },
                {
                  "x": 4.525384502557533,
                  "y": 0.00016762178506926528,
                  "svg_x": 397.8004522613066,
                  "svg_y": 389.89360971675495
                },
                {
                  "x": 4.569569344727843,
                  "y": 0.00011429271609108016,
                  "svg_x": 399.47783919597987,
                  "svg_y": 389.94018395834104
                },
                {
                  "x": 4.613754186898155,
                  "y": 0.00007605568471392627,
                  "svg_x": 401.15522613065326,
                  "svg_y": 389.9735777672152
                },
                {
                  "x": 4.657939029068467,
                  "y": 0.00004939342986240425,
                  "svg_x": 402.8326130653267,
                  "svg_y": 389.9968628971167
                },
                {
                  "x": 4.7021238712387765,
                  "y": 0.00003130622022640016,
                  "svg_x": 404.51000000000005,
                  "svg_y": 390.0126591239654
                }
              ]
            ],
            "selectors": [
              "g[id='maidr-03825914-44f3-4ca5-94f0-42078a82560e'] path"
            ]
          }
        ]
      }
    ]
  ]
};

const smoothSvgInnerHTML = `<metadata>
          <rdf:RDF xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:cc="http://creativecommons.org/ns#"
            xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
            <cc:Work>
              <dc:type rdf:resource="http://purl.org/dc/dcmitype/StillImage" />
              <dc:date>2025-11-11T11:50:33.867359</dc:date>
              <dc:format>image/svg+xml</dc:format>
              <dc:creator>
                <cc:Agent>
                  <dc:title>Matplotlib v3.10.6, https://matplotlib.org/</dc:title>
                </cc:Agent>
              </dc:creator>
            </cc:Work>
          </rdf:RDF>
        </metadata>
        <defs>
          <style type="text/css">
            * {
              stroke-linejoin: round;
              stroke-linecap: butt;
            }
          </style>
        </defs>
        <g id="figure_1">
          <g id="maidr-3382c564-4511-4ee3-a329-7c22e2d4d3d5">
            <path d="M 0 432  L 432 432  L 432 0  L 0 0  z " style="fill: #ffffff" />
          </g>
          <g id="axes_1">
            <g id="maidr-e9382024-2062-4491-832d-d0d28e911925">
              <path d="M 54.02 390.04  L 421.2 390.04  L 421.2 26.88  L 54.02 26.88  z " style="fill: #ffffff" />
            </g>
            <g id="matplotlib.axis_1">
              <g id="xtick_1">
                <g id="maidr-e3c2fa07-ce41-4959-bee7-ed5399d39210">
                  <defs>
                    <path id="m19a28796e0" d="M 0 0  L 0 3.5  " style="stroke: #000000; stroke-width: 0.8" />
                  </defs>
                  <g>
                    <use xlink:href="#m19a28796e0" x="74.15171" y="390.04" style="stroke: #000000; stroke-width: 0.8" />
                  </g>
                </g>
                <g id="text_1">
                  <!-- −4 -->
                  <g transform="translate(66.780617 404.638438) scale(0.1 -0.1)">
                    <defs>
                      <path id="DejaVuSans-2212" d="M 678 2272  L 4684 2272  L 4684 1741  L 678 1741  L 678 2272  z "
                        transform="scale(0.015625)" />
                      <path id="DejaVuSans-34"
                        d="M 2419 4116  L 825 1625  L 2419 1625  L 2419 4116  z M 2253 4666  L 3047 4666  L 3047 1625  L 3713 1625  L 3713 1100  L 3047 1100  L 3047 0  L 2419 0  L 2419 1100  L 313 1100  L 313 1709  L 2253 4666  z "
                        transform="scale(0.015625)" />
                    </defs>
                    <use xlink:href="#DejaVuSans-2212" />
                    <use xlink:href="#DejaVuSans-34" transform="translate(83.789062 0)" />
                  </g>
                </g>
              </g>
              <g id="xtick_2">
                <g id="maidr-1c981d93-8880-4757-92b2-34444488b778">
                  <g>
                    <use xlink:href="#m19a28796e0" x="150.07761" y="390.04"
                      style="stroke: #000000; stroke-width: 0.8" />
                  </g>
                </g>
                <g id="text_2">
                  <!-- −2 -->
                  <g transform="translate(142.706516 404.638438) scale(0.1 -0.1)">
                    <defs>
                      <path id="DejaVuSans-32"
                        d="M 1228 531  L 3431 531  L 3431 0  L 469 0  L 469 531  Q 828 903 1448 1529  Q 2069 2156 2228 2338  Q 2531 2678 2651 2914  Q 2772 3150 2772 3378  Q 2772 3750 2511 3984  Q 2250 4219 1831 4219  Q 1534 4219 1204 4116  Q 875 4013 500 3803  L 500 4441  Q 881 4594 1212 4672  Q 1544 4750 1819 4750  Q 2544 4750 2975 4387  Q 3406 4025 3406 3419  Q 3406 3131 3298 2873  Q 3191 2616 2906 2266  Q 2828 2175 2409 1742  Q 1991 1309 1228 531  z "
                        transform="scale(0.015625)" />
                    </defs>
                    <use xlink:href="#DejaVuSans-2212" />
                    <use xlink:href="#DejaVuSans-32" transform="translate(83.789062 0)" />
                  </g>
                </g>
              </g>
              <g id="xtick_3">
                <g id="maidr-f02b210b-b453-43b1-aa43-0b93d2f6146f">
                  <g>
                    <use xlink:href="#m19a28796e0" x="226.003509" y="390.04"
                      style="stroke: #000000; stroke-width: 0.8" />
                  </g>
                </g>
                <g id="text_3">
                  <!-- 0 -->
                  <g transform="translate(222.822259 404.638438) scale(0.1 -0.1)">
                    <defs>
                      <path id="DejaVuSans-30"
                        d="M 2034 4250  Q 1547 4250 1301 3770  Q 1056 3291 1056 2328  Q 1056 1369 1301 889  Q 1547 409 2034 409  Q 2525 409 2770 889  Q 3016 1369 3016 2328  Q 3016 3291 2770 3770  Q 2525 4250 2034 4250  z M 2034 4750  Q 2819 4750 3233 4129  Q 3647 3509 3647 2328  Q 3647 1150 3233 529  Q 2819 -91 2034 -91  Q 1250 -91 836 529  Q 422 1150 422 2328  Q 422 3509 836 4129  Q 1250 4750 2034 4750  z "
                        transform="scale(0.015625)" />
                    </defs>
                    <use xlink:href="#DejaVuSans-30" />
                  </g>
                </g>
              </g>
              <g id="xtick_4">
                <g id="maidr-a09de124-5632-4b8a-b77c-53bc13dd7405">
                  <g>
                    <use xlink:href="#m19a28796e0" x="301.929408" y="390.04"
                      style="stroke: #000000; stroke-width: 0.8" />
                  </g>
                </g>
                <g id="text_4">
                  <!-- 2 -->
                  <g transform="translate(298.748158 404.638438) scale(0.1 -0.1)">
                    <use xlink:href="#DejaVuSans-32" />
                  </g>
                </g>
              </g>
              <g id="xtick_5">
                <g id="maidr-de1fb053-bbb5-41bc-a5f6-593d389495a6">
                  <g>
                    <use xlink:href="#m19a28796e0" x="377.855307" y="390.04"
                      style="stroke: #000000; stroke-width: 0.8" />
                  </g>
                </g>
                <g id="text_5">
                  <!-- 4 -->
                  <g transform="translate(374.674057 404.638438) scale(0.1 -0.1)">
                    <use xlink:href="#DejaVuSans-34" />
                  </g>
                </g>
              </g>
              <g id="text_6">
                <!-- Value -->
                <g transform="translate(223.87875 418.316562) scale(0.1 -0.1)">
                  <defs>
                    <path id="DejaVuSans-56"
                      d="M 1831 0  L 50 4666  L 709 4666  L 2188 738  L 3669 4666  L 4325 4666  L 2547 0  L 1831 0  z "
                      transform="scale(0.015625)" />
                    <path id="DejaVuSans-61"
                      d="M 2194 1759  Q 1497 1759 1228 1600  Q 959 1441 959 1056  Q 959 750 1161 570  Q 1363 391 1709 391  Q 2188 391 2477 730  Q 2766 1069 2766 1631  L 2766 1759  L 2194 1759  z M 3341 1997  L 3341 0  L 2766 0  L 2766 531  Q 2569 213 2275 61  Q 1981 -91 1556 -91  Q 1019 -91 701 211  Q 384 513 384 1019  Q 384 1609 779 1909  Q 1175 2209 1959 2209  L 2766 2209  L 2766 2266  Q 2766 2663 2505 2880  Q 2244 3097 1772 3097  Q 1472 3097 1187 3025  Q 903 2953 641 2809  L 641 3341  Q 956 3463 1253 3523  Q 1550 3584 1831 3584  Q 2591 3584 2966 3190  Q 3341 2797 3341 1997  z "
                      transform="scale(0.015625)" />
                    <path id="DejaVuSans-6c" d="M 603 4863  L 1178 4863  L 1178 0  L 603 0  L 603 4863  z "
                      transform="scale(0.015625)" />
                    <path id="DejaVuSans-75"
                      d="M 544 1381  L 544 3500  L 1119 3500  L 1119 1403  Q 1119 906 1312 657  Q 1506 409 1894 409  Q 2359 409 2629 706  Q 2900 1003 2900 1516  L 2900 3500  L 3475 3500  L 3475 0  L 2900 0  L 2900 538  Q 2691 219 2414 64  Q 2138 -91 1772 -91  Q 1169 -91 856 284  Q 544 659 544 1381  z M 1991 3584  L 1991 3584  z "
                      transform="scale(0.015625)" />
                    <path id="DejaVuSans-65"
                      d="M 3597 1894  L 3597 1613  L 953 1613  Q 991 1019 1311 708  Q 1631 397 2203 397  Q 2534 397 2845 478  Q 3156 559 3463 722  L 3463 178  Q 3153 47 2828 -22  Q 2503 -91 2169 -91  Q 1331 -91 842 396  Q 353 884 353 1716  Q 353 2575 817 3079  Q 1281 3584 2069 3584  Q 2775 3584 3186 3129  Q 3597 2675 3597 1894  z M 3022 2063  Q 3016 2534 2758 2815  Q 2500 3097 2075 3097  Q 1594 3097 1305 2825  Q 1016 2553 972 2059  L 3022 2063  z "
                      transform="scale(0.015625)" />
                  </defs>
                  <use xlink:href="#DejaVuSans-56" />
                  <use xlink:href="#DejaVuSans-61" transform="translate(60.658203 0)" />
                  <use xlink:href="#DejaVuSans-6c" transform="translate(121.9375 0)" />
                  <use xlink:href="#DejaVuSans-75" transform="translate(149.720703 0)" />
                  <use xlink:href="#DejaVuSans-65" transform="translate(213.099609 0)" />
                </g>
              </g>
            </g>
            <g id="matplotlib.axis_2">
              <g id="ytick_1">
                <g id="maidr-e7fd593f-cc23-40ef-b184-45a1a36bcade">
                  <defs>
                    <path id="m142d86c565" d="M 0 0  L -3.5 0  " style="stroke: #000000; stroke-width: 0.8" />
                  </defs>
                  <g>
                    <use xlink:href="#m142d86c565" x="54.02" y="390.04" style="stroke: #000000; stroke-width: 0.8" />
                  </g>
                </g>
                <g id="text_7">
                  <!-- 0.00 -->
                  <g transform="translate(24.754375 393.839219) scale(0.1 -0.1)">
                    <defs>
                      <path id="DejaVuSans-2e" d="M 684 794  L 1344 794  L 1344 0  L 684 0  L 684 794  z "
                        transform="scale(0.015625)" />
                    </defs>
                    <use xlink:href="#DejaVuSans-30" />
                    <use xlink:href="#DejaVuSans-2e" transform="translate(63.623047 0)" />
                    <use xlink:href="#DejaVuSans-30" transform="translate(95.410156 0)" />
                    <use xlink:href="#DejaVuSans-30" transform="translate(159.033203 0)" />
                  </g>
                </g>
              </g>
              <g id="ytick_2">
                <g id="maidr-443f8519-2b7b-4c51-9466-8e69e61dad22">
                  <g>
                    <use xlink:href="#m142d86c565" x="54.02" y="346.373157"
                      style="stroke: #000000; stroke-width: 0.8" />
                  </g>
                </g>
                <g id="text_8">
                  <!-- 0.05 -->
                  <g transform="translate(24.754375 350.172376) scale(0.1 -0.1)">
                    <defs>
                      <path id="DejaVuSans-35"
                        d="M 691 4666  L 3169 4666  L 3169 4134  L 1269 4134  L 1269 2991  Q 1406 3038 1543 3061  Q 1681 3084 1819 3084  Q 2600 3084 3056 2656  Q 3513 2228 3513 1497  Q 3513 744 3044 326  Q 2575 -91 1722 -91  Q 1428 -91 1123 -41  Q 819 9 494 109  L 494 744  Q 775 591 1075 516  Q 1375 441 1709 441  Q 2250 441 2565 725  Q 2881 1009 2881 1497  Q 2881 1984 2565 2268  Q 2250 2553 1709 2553  Q 1456 2553 1204 2497  Q 953 2441 691 2322  L 691 4666  z "
                        transform="scale(0.015625)" />
                    </defs>
                    <use xlink:href="#DejaVuSans-30" />
                    <use xlink:href="#DejaVuSans-2e" transform="translate(63.623047 0)" />
                    <use xlink:href="#DejaVuSans-30" transform="translate(95.410156 0)" />
                    <use xlink:href="#DejaVuSans-35" transform="translate(159.033203 0)" />
                  </g>
                </g>
              </g>
              <g id="ytick_3">
                <g id="maidr-3f5c9486-0c33-4b04-abb4-35a6ab35fca0">
                  <g>
                    <use xlink:href="#m142d86c565" x="54.02" y="302.706314"
                      style="stroke: #000000; stroke-width: 0.8" />
                  </g>
                </g>
                <g id="text_9">
                  <!-- 0.10 -->
                  <g transform="translate(24.754375 306.505533) scale(0.1 -0.1)">
                    <defs>
                      <path id="DejaVuSans-31"
                        d="M 794 531  L 1825 531  L 1825 4091  L 703 3866  L 703 4441  L 1819 4666  L 2450 4666  L 2450 531  L 3481 531  L 3481 0  L 794 0  L 794 531  z "
                        transform="scale(0.015625)" />
                    </defs>
                    <use xlink:href="#DejaVuSans-30" />
                    <use xlink:href="#DejaVuSans-2e" transform="translate(63.623047 0)" />
                    <use xlink:href="#DejaVuSans-31" transform="translate(95.410156 0)" />
                    <use xlink:href="#DejaVuSans-30" transform="translate(159.033203 0)" />
                  </g>
                </g>
              </g>
              <g id="ytick_4">
                <g id="maidr-54299080-c7e4-4f63-9682-4d125d434e7c">
                  <g>
                    <use xlink:href="#m142d86c565" x="54.02" y="259.039471"
                      style="stroke: #000000; stroke-width: 0.8" />
                  </g>
                </g>
                <g id="text_10">
                  <!-- 0.15 -->
                  <g transform="translate(24.754375 262.83869) scale(0.1 -0.1)">
                    <use xlink:href="#DejaVuSans-30" />
                    <use xlink:href="#DejaVuSans-2e" transform="translate(63.623047 0)" />
                    <use xlink:href="#DejaVuSans-31" transform="translate(95.410156 0)" />
                    <use xlink:href="#DejaVuSans-35" transform="translate(159.033203 0)" />
                  </g>
                </g>
              </g>
              <g id="ytick_5">
                <g id="maidr-0e5a447c-2dee-4ee6-8479-14877957699f">
                  <g>
                    <use xlink:href="#m142d86c565" x="54.02" y="215.372628"
                      style="stroke: #000000; stroke-width: 0.8" />
                  </g>
                </g>
                <g id="text_11">
                  <!-- 0.20 -->
                  <g transform="translate(24.754375 219.171847) scale(0.1 -0.1)">
                    <use xlink:href="#DejaVuSans-30" />
                    <use xlink:href="#DejaVuSans-2e" transform="translate(63.623047 0)" />
                    <use xlink:href="#DejaVuSans-32" transform="translate(95.410156 0)" />
                    <use xlink:href="#DejaVuSans-30" transform="translate(159.033203 0)" />
                  </g>
                </g>
              </g>
              <g id="ytick_6">
                <g id="maidr-c607a0b6-7162-40f3-ab4a-78af3ddd0a47">
                  <g>
                    <use xlink:href="#m142d86c565" x="54.02" y="171.705785"
                      style="stroke: #000000; stroke-width: 0.8" />
                  </g>
                </g>
                <g id="text_12">
                  <!-- 0.25 -->
                  <g transform="translate(24.754375 175.505004) scale(0.1 -0.1)">
                    <use xlink:href="#DejaVuSans-30" />
                    <use xlink:href="#DejaVuSans-2e" transform="translate(63.623047 0)" />
                    <use xlink:href="#DejaVuSans-32" transform="translate(95.410156 0)" />
                    <use xlink:href="#DejaVuSans-35" transform="translate(159.033203 0)" />
                  </g>
                </g>
              </g>
              <g id="ytick_7">
                <g id="maidr-ebcd1e79-e37e-4249-b5d6-7896db1eed8a">
                  <g>
                    <use xlink:href="#m142d86c565" x="54.02" y="128.038942"
                      style="stroke: #000000; stroke-width: 0.8" />
                  </g>
                </g>
                <g id="text_13">
                  <!-- 0.30 -->
                  <g transform="translate(24.754375 131.838161) scale(0.1 -0.1)">
                    <defs>
                      <path id="DejaVuSans-33"
                        d="M 2597 2516  Q 3050 2419 3304 2112  Q 3559 1806 3559 1356  Q 3559 666 3084 287  Q 2609 -91 1734 -91  Q 1441 -91 1130 -33  Q 819 25 488 141  L 488 750  Q 750 597 1062 519  Q 1375 441 1716 441  Q 2309 441 2620 675  Q 2931 909 2931 1356  Q 2931 1769 2642 2001  Q 2353 2234 1838 2234  L 1294 2234  L 1294 2753  L 1863 2753  Q 2328 2753 2575 2939  Q 2822 3125 2822 3475  Q 2822 3834 2567 4026  Q 2313 4219 1838 4219  Q 1578 4219 1281 4162  Q 984 4106 628 3988  L 628 4550  Q 988 4650 1302 4700  Q 1616 4750 1894 4750  Q 2613 4750 3031 4423  Q 3450 4097 3450 3541  Q 3450 3153 3228 2886  Q 3006 2619 2597 2516  z "
                        transform="scale(0.015625)" />
                    </defs>
                    <use xlink:href="#DejaVuSans-30" />
                    <use xlink:href="#DejaVuSans-2e" transform="translate(63.623047 0)" />
                    <use xlink:href="#DejaVuSans-33" transform="translate(95.410156 0)" />
                    <use xlink:href="#DejaVuSans-30" transform="translate(159.033203 0)" />
                  </g>
                </g>
              </g>
              <g id="ytick_8">
                <g id="maidr-03af15bc-6bb7-4044-83e5-2c2c6d7b0fdf">
                  <g>
                    <use xlink:href="#m142d86c565" x="54.02" y="84.372099" style="stroke: #000000; stroke-width: 0.8" />
                  </g>
                </g>
                <g id="text_14">
                  <!-- 0.35 -->
                  <g transform="translate(24.754375 88.171318) scale(0.1 -0.1)">
                    <use xlink:href="#DejaVuSans-30" />
                    <use xlink:href="#DejaVuSans-2e" transform="translate(63.623047 0)" />
                    <use xlink:href="#DejaVuSans-33" transform="translate(95.410156 0)" />
                    <use xlink:href="#DejaVuSans-35" transform="translate(159.033203 0)" />
                  </g>
                </g>
              </g>
              <g id="ytick_9">
                <g id="maidr-4cac562f-922d-483f-8c66-fb813e6a8b08">
                  <g>
                    <use xlink:href="#m142d86c565" x="54.02" y="40.705256" style="stroke: #000000; stroke-width: 0.8" />
                  </g>
                </g>
                <g id="text_15">
                  <!-- 0.40 -->
                  <g transform="translate(24.754375 44.504475) scale(0.1 -0.1)">
                    <use xlink:href="#DejaVuSans-30" />
                    <use xlink:href="#DejaVuSans-2e" transform="translate(63.623047 0)" />
                    <use xlink:href="#DejaVuSans-34" transform="translate(95.410156 0)" />
                    <use xlink:href="#DejaVuSans-30" transform="translate(159.033203 0)" />
                  </g>
                </g>
              </g>
              <g id="text_16">
                <!-- Density -->
                <g transform="translate(18.674688 227.468594) rotate(-90) scale(0.1 -0.1)">
                  <defs>
                    <path id="DejaVuSans-44"
                      d="M 1259 4147  L 1259 519  L 2022 519  Q 2988 519 3436 956  Q 3884 1394 3884 2338  Q 3884 3275 3436 3711  Q 2988 4147 2022 4147  L 1259 4147  z M 628 4666  L 1925 4666  Q 3281 4666 3915 4102  Q 4550 3538 4550 2338  Q 4550 1131 3912 565  Q 3275 0 1925 0  L 628 0  L 628 4666  z "
                      transform="scale(0.015625)" />
                    <path id="DejaVuSans-6e"
                      d="M 3513 2113  L 3513 0  L 2938 0  L 2938 2094  Q 2938 2591 2744 2837  Q 2550 3084 2163 3084  Q 1697 3084 1428 2787  Q 1159 2491 1159 1978  L 1159 0  L 581 0  L 581 3500  L 1159 3500  L 1159 2956  Q 1366 3272 1645 3428  Q 1925 3584 2291 3584  Q 2894 3584 3203 3211  Q 3513 2838 3513 2113  z "
                      transform="scale(0.015625)" />
                    <path id="DejaVuSans-73"
                      d="M 2834 3397  L 2834 2853  Q 2591 2978 2328 3040  Q 2066 3103 1784 3103  Q 1356 3103 1142 2972  Q 928 2841 928 2578  Q 928 2378 1081 2264  Q 1234 2150 1697 2047  L 1894 2003  Q 2506 1872 2764 1633  Q 3022 1394 3022 966  Q 3022 478 2636 193  Q 2250 -91 1575 -91  Q 1294 -91 989 -36  Q 684 19 347 128  L 347 722  Q 666 556 975 473  Q 1284 391 1588 391  Q 1994 391 2212 530  Q 2431 669 2431 922  Q 2431 1156 2273 1281  Q 2116 1406 1581 1522  L 1381 1569  Q 847 1681 609 1914  Q 372 2147 372 2553  Q 372 3047 722 3315  Q 1072 3584 1716 3584  Q 2034 3584 2315 3537  Q 2597 3491 2834 3397  z "
                      transform="scale(0.015625)" />
                    <path id="DejaVuSans-69"
                      d="M 603 3500  L 1178 3500  L 1178 0  L 603 0  L 603 3500  z M 603 4863  L 1178 4863  L 1178 4134  L 603 4134  L 603 4863  z "
                      transform="scale(0.015625)" />
                    <path id="DejaVuSans-74"
                      d="M 1172 4494  L 1172 3500  L 2356 3500  L 2356 3053  L 1172 3053  L 1172 1153  Q 1172 725 1289 603  Q 1406 481 1766 481  L 2356 481  L 2356 0  L 1766 0  Q 1100 0 847 248  Q 594 497 594 1153  L 594 3053  L 172 3053  L 172 3500  L 594 3500  L 594 4494  L 1172 4494  z "
                      transform="scale(0.015625)" />
                    <path id="DejaVuSans-79"
                      d="M 2059 -325  Q 1816 -950 1584 -1140  Q 1353 -1331 966 -1331  L 506 -1331  L 506 -850  L 844 -850  Q 1081 -850 1212 -737  Q 1344 -625 1503 -206  L 1606 56  L 191 3500  L 800 3500  L 1894 763  L 2988 3500  L 3597 3500  L 2059 -325  z "
                      transform="scale(0.015625)" />
                  </defs>
                  <use xlink:href="#DejaVuSans-44" />
                  <use xlink:href="#DejaVuSans-65" transform="translate(77.001953 0)" />
                  <use xlink:href="#DejaVuSans-6e" transform="translate(138.525391 0)" />
                  <use xlink:href="#DejaVuSans-73" transform="translate(201.904297 0)" />
                  <use xlink:href="#DejaVuSans-69" transform="translate(254.003906 0)" />
                  <use xlink:href="#DejaVuSans-74" transform="translate(281.787109 0)" />
                  <use xlink:href="#DejaVuSans-79" transform="translate(320.996094 0)" />
                </g>
              </g>
            </g>
            <g id="maidr-03825914-44f3-4ca5-94f0-42078a82560e" maidr="60f50ac9-e463-4bba-8295-9040749065b2">
              <path
                d="M 70.71 390.012656  L 79.096935 389.830335  L 84.129095 389.508145  L 89.161256 388.953966  L 99.225578 387.621928  L 102.580352 387.364597  L 107.612513 387.226182  L 112.644673 387.131181  L 115.999447 386.881853  L 119.354221 386.341606  L 121.031608 385.927405  L 122.708995 385.396867  L 124.386382 384.73173  L 126.063769 383.910325  L 127.741156 382.907548  L 129.418543 381.695729  L 131.09593 380.246402  L 132.773317 378.532789  L 134.450704 376.532594  L 136.12809 374.230596  L 137.805477 371.620459  L 139.482864 368.705264  L 141.160251 365.496433  L 142.837638 362.011038  L 146.192412 354.282347  L 149.547186 345.606299  L 152.90196 335.9097  L 156.256734 324.954459  L 159.611508 312.466677  L 162.966281 298.320443  L 166.321055 282.642908  L 169.675829 265.757609  L 174.70799 238.880238  L 179.740151 210.613942  L 189.804472 152.79703  L 193.159246 135.662635  L 194.836633 128.036011  L 196.51402 121.149657  L 198.191407 115.038824  L 199.868794 109.690839  L 201.546181 105.043911  L 203.223568 100.991289  L 204.900955 97.390541  L 211.610503 84.231593  L 213.287889 80.560527  L 216.642663 72.3478  L 223.352211 54.765415  L 225.029598 51.056867  L 226.706985 47.99659  L 228.384372 45.748483  L 230.061759 44.443456  L 231.739146 44.172031  L 233.416533 44.981307  L 235.09392 46.87638  L 236.771307 49.825858  L 238.448693 53.770617  L 240.12608 58.634575  L 241.803467 64.335962  L 243.480854 70.797466  L 245.158241 77.953766  L 246.835628 85.755323  L 248.513015 94.167863  L 251.867789 112.733667  L 255.222563 133.43291  L 258.577337 155.784758  L 265.286884 201.373308  L 268.641658 222.00129  L 270.319045 231.303081  L 271.996432 239.852322  L 273.673819 247.653504  L 275.351206 254.758597  L 277.028593 261.258175  L 280.383367 272.914589  L 285.415528 288.766102  L 292.125075 309.157307  L 295.479849 318.781398  L 298.834623 327.682625  L 302.189397 335.839618  L 305.544171 343.430415  L 310.576332 354.169062  L 313.931106 360.908861  L 317.285879 367.079219  L 318.963266 369.861647  L 320.640653 372.400856  L 322.31804 374.676442  L 323.995427 376.679028  L 325.672814 378.410621  L 327.350201 379.883667  L 329.027588 381.119181  L 330.704975 382.144347  L 332.382362 382.989978  L 335.737136 384.269916  L 339.09191 385.195072  L 344.12407 386.282497  L 349.156231 387.198325  L 352.511005 387.670307  L 355.865779 387.958938  L 359.220553 388.031902  L 364.252714 387.821738  L 369.284874 387.548578  L 372.639648 387.526268  L 375.994422 387.701057  L 381.026583 388.270075  L 389.413518 389.350541  L 394.445678 389.747305  L 401.155226 389.973578  L 404.51 390.012659  L 404.51 390.012659  "
                clip-path="url(#p33fac25150)"
                style="fill: none; stroke: #0000ff; stroke-width: 1.5; stroke-linecap: square" />
            </g>
            <g id="maidr-abfd2140-d1c9-4e37-b080-a350071554e8">
              <path d="M 54.02 390.04  L 54.02 26.88  "
                style="fill: none; stroke: #000000; stroke-width: 0.8; stroke-linejoin: miter; stroke-linecap: square" />
            </g>
            <g id="maidr-8041cf82-ebb1-4c3a-8aec-da37ac86dce6">
              <path d="M 421.2 390.04  L 421.2 26.88  "
                style="fill: none; stroke: #000000; stroke-width: 0.8; stroke-linejoin: miter; stroke-linecap: square" />
            </g>
            <g id="maidr-bfebce9f-61c6-4fac-a309-84f675131a5e">
              <path d="M 54.02 390.04  L 421.2 390.04  "
                style="fill: none; stroke: #000000; stroke-width: 0.8; stroke-linejoin: miter; stroke-linecap: square" />
            </g>
            <g id="maidr-0c9583dc-6832-496d-9beb-04e94b1c8fba">
              <path d="M 54.02 26.88  L 421.2 26.88  "
                style="fill: none; stroke: #000000; stroke-width: 0.8; stroke-linejoin: miter; stroke-linecap: square" />
            </g>
            <g id="text_17">
              <!-- KDE Plot of Random Data -->
              <g transform="translate(161.380938 20.88) scale(0.12 -0.12)">
                <defs>
                  <path id="DejaVuSans-4b"
                    d="M 628 4666  L 1259 4666  L 1259 2694  L 3353 4666  L 4166 4666  L 1850 2491  L 4331 0  L 3500 0  L 1259 2247  L 1259 0  L 628 0  L 628 4666  z "
                    transform="scale(0.015625)" />
                  <path id="DejaVuSans-45"
                    d="M 628 4666  L 3578 4666  L 3578 4134  L 1259 4134  L 1259 2753  L 3481 2753  L 3481 2222  L 1259 2222  L 1259 531  L 3634 531  L 3634 0  L 628 0  L 628 4666  z "
                    transform="scale(0.015625)" />
                  <path id="DejaVuSans-20" transform="scale(0.015625)" />
                  <path id="DejaVuSans-50"
                    d="M 1259 4147  L 1259 2394  L 2053 2394  Q 2494 2394 2734 2622  Q 2975 2850 2975 3272  Q 2975 3691 2734 3919  Q 2494 4147 2053 4147  L 1259 4147  z M 628 4666  L 2053 4666  Q 2838 4666 3239 4311  Q 3641 3956 3641 3272  Q 3641 2581 3239 2228  Q 2838 1875 2053 1875  L 1259 1875  L 1259 0  L 628 0  L 628 4666  z "
                    transform="scale(0.015625)" />
                  <path id="DejaVuSans-6f"
                    d="M 1959 3097  Q 1497 3097 1228 2736  Q 959 2375 959 1747  Q 959 1119 1226 758  Q 1494 397 1959 397  Q 2419 397 2687 759  Q 2956 1122 2956 1747  Q 2956 2369 2687 2733  Q 2419 3097 1959 3097  z M 1959 3584  Q 2709 3584 3137 3096  Q 3566 2609 3566 1747  Q 3566 888 3137 398  Q 2709 -91 1959 -91  Q 1206 -91 779 398  Q 353 888 353 1747  Q 353 2609 779 3096  Q 1206 3584 1959 3584  z "
                    transform="scale(0.015625)" />
                  <path id="DejaVuSans-66"
                    d="M 2375 4863  L 2375 4384  L 1825 4384  Q 1516 4384 1395 4259  Q 1275 4134 1275 3809  L 1275 3500  L 2222 3500  L 2222 3053  L 1275 3053  L 1275 0  L 697 0  L 697 3053  L 147 3053  L 147 3500  L 697 3500  L 697 3744  Q 697 4328 969 4595  Q 1241 4863 1831 4863  L 2375 4863  z "
                    transform="scale(0.015625)" />
                  <path id="DejaVuSans-52"
                    d="M 2841 2188  Q 3044 2119 3236 1894  Q 3428 1669 3622 1275  L 4263 0  L 3584 0  L 2988 1197  Q 2756 1666 2539 1819  Q 2322 1972 1947 1972  L 1259 1972  L 1259 0  L 628 0  L 628 4666  L 2053 4666  Q 2853 4666 3247 4331  Q 3641 3997 3641 3322  Q 3641 2881 3436 2590  Q 3231 2300 2841 2188  z M 1259 4147  L 1259 2491  L 2053 2491  Q 2509 2491 2742 2702  Q 2975 2913 2975 3322  Q 2975 3731 2742 3939  Q 2509 4147 2053 4147  L 1259 4147  z "
                    transform="scale(0.015625)" />
                  <path id="DejaVuSans-64"
                    d="M 2906 2969  L 2906 4863  L 3481 4863  L 3481 0  L 2906 0  L 2906 525  Q 2725 213 2448 61  Q 2172 -91 1784 -91  Q 1150 -91 751 415  Q 353 922 353 1747  Q 353 2572 751 3078  Q 1150 3584 1784 3584  Q 2172 3584 2448 3432  Q 2725 3281 2906 2969  z M 947 1747  Q 947 1113 1208 752  Q 1469 391 1925 391  Q 2381 391 2643 752  Q 2906 1113 2906 1747  Q 2906 2381 2643 2742  Q 2381 3103 1925 3103  Q 1469 3103 1208 2742  Q 947 2381 947 1747  z "
                    transform="scale(0.015625)" />
                  <path id="DejaVuSans-6d"
                    d="M 3328 2828  Q 3544 3216 3844 3400  Q 4144 3584 4550 3584  Q 5097 3584 5394 3201  Q 5691 2819 5691 2113  L 5691 0  L 5113 0  L 5113 2094  Q 5113 2597 4934 2840  Q 4756 3084 4391 3084  Q 3944 3084 3684 2787  Q 3425 2491 3425 1978  L 3425 0  L 2847 0  L 2847 2094  Q 2847 2600 2669 2842  Q 2491 3084 2119 3084  Q 1678 3084 1418 2786  Q 1159 2488 1159 1978  L 1159 0  L 581 0  L 581 3500  L 1159 3500  L 1159 2956  Q 1356 3278 1631 3431  Q 1906 3584 2284 3584  Q 2666 3584 2933 3390  Q 3200 3197 3328 2828  z "
                    transform="scale(0.015625)" />
                </defs>
                <use xlink:href="#DejaVuSans-4b" />
                <use xlink:href="#DejaVuSans-44" transform="translate(65.576172 0)" />
                <use xlink:href="#DejaVuSans-45" transform="translate(142.578125 0)" />
                <use xlink:href="#DejaVuSans-20" transform="translate(205.761719 0)" />
                <use xlink:href="#DejaVuSans-50" transform="translate(237.548828 0)" />
                <use xlink:href="#DejaVuSans-6c" transform="translate(297.851562 0)" />
                <use xlink:href="#DejaVuSans-6f" transform="translate(325.634766 0)" />
                <use xlink:href="#DejaVuSans-74" transform="translate(386.816406 0)" />
                <use xlink:href="#DejaVuSans-20" transform="translate(426.025391 0)" />
                <use xlink:href="#DejaVuSans-6f" transform="translate(457.8125 0)" />
                <use xlink:href="#DejaVuSans-66" transform="translate(518.994141 0)" />
                <use xlink:href="#DejaVuSans-20" transform="translate(554.199219 0)" />
                <use xlink:href="#DejaVuSans-52" transform="translate(585.986328 0)" />
                <use xlink:href="#DejaVuSans-61" transform="translate(653.21875 0)" />
                <use xlink:href="#DejaVuSans-6e" transform="translate(714.498047 0)" />
                <use xlink:href="#DejaVuSans-64" transform="translate(777.876953 0)" />
                <use xlink:href="#DejaVuSans-6f" transform="translate(841.353516 0)" />
                <use xlink:href="#DejaVuSans-6d" transform="translate(902.535156 0)" />
                <use xlink:href="#DejaVuSans-20" transform="translate(999.947266 0)" />
                <use xlink:href="#DejaVuSans-44" transform="translate(1031.734375 0)" />
                <use xlink:href="#DejaVuSans-61" transform="translate(1108.736328 0)" />
                <use xlink:href="#DejaVuSans-74" transform="translate(1170.015625 0)" />
                <use xlink:href="#DejaVuSans-61" transform="translate(1209.224609 0)" />
              </g>
            </g>
          </g>
        </g>
        <defs>
          <clipPath id="p33fac25150">
            <rect x="54.02" y="26.88" width="367.18" height="363.16" />
          </clipPath>
        </defs>`;

function BarChart() {
  return (
    <Maidr data={barData}>
      <svg
        xmlns="http://www.w3.org/2000/svg"
        xmlnsXlink="http://www.w3.org/1999/xlink"
        width="720pt"
        height="432pt"
        viewBox="0 0 720 432"
        version="1.1"
        dangerouslySetInnerHTML={{ __html: barSvgInnerHTML }}
      />
    </Maidr>
  );
}

function LineChart() {
  return (
    <Maidr data={lineData}>
      <svg
        xmlns="http://www.w3.org/2000/svg"
        xmlnsXlink="http://www.w3.org/1999/xlink"
        width="1008pt"
        height="504pt"
        viewBox="0 0 1008 504"
        version="1.1"
        dangerouslySetInnerHTML={{ __html: lineSvgInnerHTML }}
      />
    </Maidr>
  );
}

function SmoothChart() {
  return (
    <Maidr data={smoothData}>
      <svg
        xmlns="http://www.w3.org/2000/svg"
        xmlnsXlink="http://www.w3.org/1999/xlink"
        width="432pt"
        height="432pt"
        viewBox="0 0 432 432"
        version="1.1"
        id="a6b8ffb5-9a9d-44be-9151-439a5373e405"
        dangerouslySetInnerHTML={{ __html: smoothSvgInnerHTML }}
      />
    </Maidr>
  );
}

function App() {
  return (
    <div style={{ padding: '20px' }}>
      <h1>MAIDR React Examples</h1>
      <h2>Bar Chart</h2>
      <BarChart />
      <h2>Line Chart</h2>
      <LineChart />
      <h2>Smooth Chart</h2>
      <SmoothChart />
    </div>
  );
}

document.addEventListener('DOMContentLoaded', () => {
  createRoot(document.getElementById('root')!).render(<App />);
});
