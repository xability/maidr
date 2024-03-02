import { useState } from 'react'
import reactLogo from './assets/react.svg'
import './App.css'

function App() {
  const [count, setCount] = useState(0)

  return (
    <div>
    <div className="container mt-3">
      <div id="container">
        <div>
          <svg
            xmlns="http://www.w3.org/2000/svg"
            xmlns:xlink="http://www.w3.org/1999/xlink"
            width="628px"
            height="456px"
            viewBox="0 0 628 456"
            version="1.1"
            id="barplot1"
            tabindex="0"
          >
            <metadata
              xmlns:gridsvg="http://www.stat.auckland.ac.nz/~paul/R/gridSVG/"
            >
              <gridsvg:generator
                name="gridSVG"
                version="1.7-5"
                time="2023-04-06 15:46:48"
              />
              <gridsvg:argument name="name" value="barplot_labels.svg" />
              <gridsvg:argument name="exportCoords" value="none" />
              <gridsvg:argument name="exportMappings" value="none" />
              <gridsvg:argument name="exportJS" value="none" />
              <gridsvg:argument name="res" value="72" />
              <gridsvg:argument name="prefix" value="" />
              <gridsvg:argument name="addClasses" value="FALSE" />
              <gridsvg:argument name="indent" value="TRUE" />
              <gridsvg:argument name="htmlWrapper" value="FALSE" />
              <gridsvg:argument name="usePaths" value="vpPaths" />
              <gridsvg:argument name="uniqueNames" value="TRUE" />
              <gridsvg:separator name="id.sep" value="." />
              <gridsvg:separator name="gPath.sep" value="::" />
              <gridsvg:separator name="vpPath.sep" value="::" />
            </metadata>
            <g transform="translate(0, 456) scale(1, -1)">
              <g
                id="gridSVG"
                fill="rgb(255,255,255)"
                stroke="rgb(0,0,0)"
                stroke-dasharray="none"
                stroke-width="0.75"
                font-size="12"
                font-family="Helvetica, Arial, FreeSans, Liberation Sans, Nimbus Sans L, sans-serif"
                opacity="1"
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-miterlimit="10"
                stroke-opacity="1"
                fill-opacity="1"
                font-weight="normal"
                font-style="normal"
              >
                <g id="layout.1">
                  <g id="layout.2">
                    <defs>
                      <clipPath id="layout::background.1-9-12-1.1.clipPath">
                        <rect
                          x="0"
                          y="0"
                          width="628"
                          height="456"
                          fill="none"
                          stroke="none"
                        />
                      </clipPath>
                    </defs>
                    <g
                      id="layout::background.1-9-12-1.1"
                      clip-path="url(#layout::background.1-9-12-1.1.clipPath)"
                    >
                      <g id="background.1-9-12-1.1">
                        <g id="plot.background..rect.50.1">
                          <rect
                            id="plot.background..rect.50.1.1"
                            x="0"
                            y="0"
                            width="628"
                            height="456"
                            transform=""
                            stroke-width="1.07"
                            stroke="rgb(255,255,255)"
                            fill="rgb(255,255,255)"
                            stroke-dasharray="none"
                            stroke-opacity="1"
                            fill-opacity="1"
                          />
                        </g>
                      </g>
                    </g>
                    <defs>
                      <clipPath id="layout::panel.7-5-7-5.1.clipPath">
                        <rect
                          x="47.83"
                          y="31.5"
                          width="574.69"
                          height="401.33"
                          fill="none"
                          stroke="none"
                        />
                      </clipPath>
                    </defs>
                    <g
                      id="layout::panel.7-5-7-5.1"
                      clip-path="url(#layout::panel.7-5-7-5.1.clipPath)"
                    >
                      <g id="panel.7-5-7-5.1">
                        <g id="panel-1.gTree.25.1">
                          <g id="grill.gTree.23.1">
                            <g id="panel.background..rect.16.1">
                              <rect
                                id="panel.background..rect.16.1.1"
                                x="47.83"
                                y="31.5"
                                width="574.69"
                                height="401.33"
                                transform=""
                                stroke-width="1.07"
                                stroke="none"
                                fill="rgb(235,235,235)"
                                stroke-dasharray="none"
                                stroke-opacity="0"
                                fill-opacity="1"
                              />
                            </g>
                            <g id="panel.grid.minor.y..polyline.18.1">
                              <polyline
                                id="panel.grid.minor.y..polyline.18.1.1"
                                points="47.83,92.06 622.52,92.06"
                                stroke="rgb(255,255,255)"
                                fill="none"
                                stroke-width="0.53"
                                stroke-dasharray="none"
                                stroke-linecap="butt"
                                stroke-opacity="1"
                                fill-opacity="1"
                              />
                              <polyline
                                id="panel.grid.minor.y..polyline.18.1.2"
                                points="47.83,176.71 622.52,176.71"
                                stroke="rgb(255,255,255)"
                                fill="none"
                                stroke-width="0.53"
                                stroke-dasharray="none"
                                stroke-linecap="butt"
                                stroke-opacity="1"
                                fill-opacity="1"
                              />
                              <polyline
                                id="panel.grid.minor.y..polyline.18.1.3"
                                points="47.83,261.35 622.52,261.35"
                                stroke="rgb(255,255,255)"
                                fill="none"
                                stroke-width="0.53"
                                stroke-dasharray="none"
                                stroke-linecap="butt"
                                stroke-opacity="1"
                                fill-opacity="1"
                              />
                              <polyline
                                id="panel.grid.minor.y..polyline.18.1.4"
                                points="47.83,346 622.52,346"
                                stroke="rgb(255,255,255)"
                                fill="none"
                                stroke-width="0.53"
                                stroke-dasharray="none"
                                stroke-linecap="butt"
                                stroke-opacity="1"
                                fill-opacity="1"
                              />
                              <polyline
                                id="panel.grid.minor.y..polyline.18.1.5"
                                points="47.83,430.65 622.52,430.65"
                                stroke="rgb(255,255,255)"
                                fill="none"
                                stroke-width="0.53"
                                stroke-dasharray="none"
                                stroke-linecap="butt"
                                stroke-opacity="1"
                                fill-opacity="1"
                              />
                            </g>
                            <g id="panel.grid.major.y..polyline.20.1">
                              <polyline
                                id="panel.grid.major.y..polyline.20.1.1"
                                points="47.83,49.74 622.52,49.74"
                                stroke="rgb(255,255,255)"
                                fill="none"
                                stroke-width="1.07"
                                stroke-dasharray="none"
                                stroke-linecap="butt"
                                stroke-opacity="1"
                                fill-opacity="1"
                              />
                              <polyline
                                id="panel.grid.major.y..polyline.20.1.2"
                                points="47.83,134.38 622.52,134.38"
                                stroke="rgb(255,255,255)"
                                fill="none"
                                stroke-width="1.07"
                                stroke-dasharray="none"
                                stroke-linecap="butt"
                                stroke-opacity="1"
                                fill-opacity="1"
                              />
                              <polyline
                                id="panel.grid.major.y..polyline.20.1.3"
                                points="47.83,219.03 622.52,219.03"
                                stroke="rgb(255,255,255)"
                                fill="none"
                                stroke-width="1.07"
                                stroke-dasharray="none"
                                stroke-linecap="butt"
                                stroke-opacity="1"
                                fill-opacity="1"
                              />
                              <polyline
                                id="panel.grid.major.y..polyline.20.1.4"
                                points="47.83,303.68 622.52,303.68"
                                stroke="rgb(255,255,255)"
                                fill="none"
                                stroke-width="1.07"
                                stroke-dasharray="none"
                                stroke-linecap="butt"
                                stroke-opacity="1"
                                fill-opacity="1"
                              />
                              <polyline
                                id="panel.grid.major.y..polyline.20.1.5"
                                points="47.83,388.32 622.52,388.32"
                                stroke="rgb(255,255,255)"
                                fill="none"
                                stroke-width="1.07"
                                stroke-dasharray="none"
                                stroke-linecap="butt"
                                stroke-opacity="1"
                                fill-opacity="1"
                              />
                            </g>
                            <g id="panel.grid.major.x..polyline.22.1">
                              <polyline
                                id="panel.grid.major.x..polyline.22.1.1"
                                points="114.14,31.5 114.14,432.82"
                                stroke="rgb(255,255,255)"
                                fill="none"
                                stroke-width="1.07"
                                stroke-dasharray="none"
                                stroke-linecap="butt"
                                stroke-opacity="1"
                                fill-opacity="1"
                              />
                              <polyline
                                id="panel.grid.major.x..polyline.22.1.2"
                                points="224.66,31.5 224.66,432.82"
                                stroke="rgb(255,255,255)"
                                fill="none"
                                stroke-width="1.07"
                                stroke-dasharray="none"
                                stroke-linecap="butt"
                                stroke-opacity="1"
                                fill-opacity="1"
                              />
                              <polyline
                                id="panel.grid.major.x..polyline.22.1.3"
                                points="335.17,31.5 335.17,432.82"
                                stroke="rgb(255,255,255)"
                                fill="none"
                                stroke-width="1.07"
                                stroke-dasharray="none"
                                stroke-linecap="butt"
                                stroke-opacity="1"
                                fill-opacity="1"
                              />
                              <polyline
                                id="panel.grid.major.x..polyline.22.1.4"
                                points="445.69,31.5 445.69,432.82"
                                stroke="rgb(255,255,255)"
                                fill="none"
                                stroke-width="1.07"
                                stroke-dasharray="none"
                                stroke-linecap="butt"
                                stroke-opacity="1"
                                fill-opacity="1"
                              />
                              <polyline
                                id="panel.grid.major.x..polyline.22.1.5"
                                points="556.21,31.5 556.21,432.82"
                                stroke="rgb(255,255,255)"
                                fill="none"
                                stroke-width="1.07"
                                stroke-dasharray="none"
                                stroke-linecap="butt"
                                stroke-opacity="1"
                                fill-opacity="1"
                              />
                            </g>
                          </g>
                          <g id="geom_rect.rect.12.1">
                            <rect
                              id="geom_rect.rect.12.1.1"
                              x="64.4"
                              y="49.74"
                              width="99.47"
                              height="27.26"
                              transform=""
                              stroke="none"
                              fill="rgb(89,89,89)"
                              stroke-width="1.07"
                              stroke-dasharray="none"
                              stroke-linejoin="miter"
                              stroke-linecap="butt"
                              stroke-opacity="0"
                              fill-opacity="1"
                            />
                            <rect
                              id="geom_rect.rect.12.1.2"
                              x="174.92"
                              y="49.74"
                              width="99.47"
                              height="83.05"
                              transform=""
                              stroke="none"
                              fill="rgb(89,89,89)"
                              stroke-width="1.07"
                              stroke-dasharray="none"
                              stroke-linejoin="miter"
                              stroke-linecap="butt"
                              stroke-opacity="0"
                              fill-opacity="1"
                            />
                            <rect
                              id="geom_rect.rect.12.1.3"
                              x="285.44"
                              y="49.74"
                              width="99.47"
                              height="204.54"
                              transform=""
                              stroke="none"
                              fill="rgb(89,89,89)"
                              stroke-width="1.07"
                              stroke-dasharray="none"
                              stroke-linejoin="miter"
                              stroke-linecap="butt"
                              stroke-opacity="0"
                              fill-opacity="1"
                            />
                            <rect
                              id="geom_rect.rect.12.1.4"
                              x="395.96"
                              y="49.74"
                              width="99.47"
                              height="233.47"
                              transform=""
                              stroke="none"
                              fill="rgb(89,89,89)"
                              stroke-width="1.07"
                              stroke-dasharray="none"
                              stroke-linejoin="miter"
                              stroke-linecap="butt"
                              stroke-opacity="0"
                              fill-opacity="1"
                            />
                            <rect
                              id="geom_rect.rect.12.1.5"
                              x="506.48"
                              y="49.74"
                              width="99.47"
                              height="364.84"
                              transform=""
                              stroke="none"
                              fill="rgb(89,89,89)"
                              stroke-width="1.07"
                              stroke-dasharray="none"
                              stroke-linejoin="miter"
                              stroke-linecap="butt"
                              stroke-opacity="0"
                              fill-opacity="1"
                            />
                          </g>
                        </g>
                      </g>
                    </g>
                    <g id="layout::spacer.8-6-8-6.1">
                      <g id="spacer.8-6-8-6.1" />
                    </g>
                    <g id="layout::spacer.8-4-8-4.1">
                      <g id="spacer.8-4-8-4.1" />
                    </g>
                    <g id="layout::spacer.6-6-6-6.1">
                      <g id="spacer.6-6-6-6.1" />
                    </g>
                    <g id="layout::spacer.6-4-6-4.1">
                      <g id="spacer.6-4-6-4.1" />
                    </g>
                    <g id="layout::axis-t.6-5-6-5.1">
                      <g id="axis-t.6-5-6-5.1" />
                    </g>
                    <g id="layout::axis-l.7-4-7-4.1">
                      <g id="axis-l.7-4-7-4.1">
                        <g id="layout::axis-l.7-4-7-4::GRID.VP.6.1">
                          <g id="GRID.absoluteGrob.34.1">
                            <g id="layout::axis-l.7-4-7-4::GRID.VP.6::axis.1">
                              <g id="axis.1">
                                <g
                                  id="layout::axis-l.7-4-7-4::GRID.VP.6::axis::axis.1-1-1-1.1"
                                >
                                  <g id="axis.1-1-1-1.1">
                                    <g
                                      id="layout::axis-l.7-4-7-4::GRID.VP.6::axis::axis.1-1-1-1::GRID.VP.4.1"
                                      font-size="8.8"
                                      stroke="rgb(77,77,77)"
                                      font-family="Helvetica, Arial, FreeSans, Liberation Sans, Nimbus Sans L, sans-serif"
                                      stroke-opacity="1"
                                      font-weight="normal"
                                      font-style="normal"
                                    >
                                      <g
                                        id="layout::axis-l.7-4-7-4::GRID.VP.6::axis::axis.1-1-1-1::GRID.VP.4::GRID.VP.5.1"
                                      >
                                        <g id="GRID.titleGrob.32.1">
                                          <g id="GRID.text.31.1">
                                            <g
                                              id="GRID.text.31.1.1"
                                              transform="translate(42.89, 49.74)"
                                              stroke-width="0.1"
                                            >
                                              <g
                                                id="GRID.text.31.1.1.scale"
                                                transform="scale(1, -1)"
                                              >
                                                <text
                                                  x="0"
                                                  y="0"
                                                  id="GRID.text.31.1.1.text"
                                                  text-anchor="end"
                                                  font-size="8.8"
                                                  stroke="rgb(77,77,77)"
                                                  font-family="Helvetica, Arial, FreeSans, Liberation Sans, Nimbus Sans L, sans-serif"
                                                  fill="rgb(77,77,77)"
                                                  stroke-opacity="1"
                                                  fill-opacity="1"
                                                  font-weight="normal"
                                                  font-style="normal"
                                                >
                                                  <tspan
                                                    id="GRID.text.31.1.1.tspan.1"
                                                    dy="3.15"
                                                    x="0"
                                                  >
                                                    0
                                                  </tspan>
                                                </text>
                                              </g>
                                            </g>
                                            <g
                                              id="GRID.text.31.1.2"
                                              transform="translate(42.89, 134.38)"
                                              stroke-width="0.1"
                                            >
                                              <g
                                                id="GRID.text.31.1.2.scale"
                                                transform="scale(1, -1)"
                                              >
                                                <text
                                                  x="0"
                                                  y="0"
                                                  id="GRID.text.31.1.2.text"
                                                  text-anchor="end"
                                                  font-size="8.8"
                                                  stroke="rgb(77,77,77)"
                                                  font-family="Helvetica, Arial, FreeSans, Liberation Sans, Nimbus Sans L, sans-serif"
                                                  fill="rgb(77,77,77)"
                                                  stroke-opacity="1"
                                                  fill-opacity="1"
                                                  font-weight="normal"
                                                  font-style="normal"
                                                >
                                                  <tspan
                                                    id="GRID.text.31.1.2.tspan.1"
                                                    dy="3.15"
                                                    x="0"
                                                  >
                                                    5000
                                                  </tspan>
                                                </text>
                                              </g>
                                            </g>
                                            <g
                                              id="GRID.text.31.1.3"
                                              transform="translate(42.89, 219.03)"
                                              stroke-width="0.1"
                                            >
                                              <g
                                                id="GRID.text.31.1.3.scale"
                                                transform="scale(1, -1)"
                                              >
                                                <text
                                                  x="0"
                                                  y="0"
                                                  id="GRID.text.31.1.3.text"
                                                  text-anchor="end"
                                                  font-size="8.8"
                                                  stroke="rgb(77,77,77)"
                                                  font-family="Helvetica, Arial, FreeSans, Liberation Sans, Nimbus Sans L, sans-serif"
                                                  fill="rgb(77,77,77)"
                                                  stroke-opacity="1"
                                                  fill-opacity="1"
                                                  font-weight="normal"
                                                  font-style="normal"
                                                >
                                                  <tspan
                                                    id="GRID.text.31.1.3.tspan.1"
                                                    dy="3.15"
                                                    x="0"
                                                  >
                                                    10000
                                                  </tspan>
                                                </text>
                                              </g>
                                            </g>
                                            <g
                                              id="GRID.text.31.1.4"
                                              transform="translate(42.89, 303.68)"
                                              stroke-width="0.1"
                                            >
                                              <g
                                                id="GRID.text.31.1.4.scale"
                                                transform="scale(1, -1)"
                                              >
                                                <text
                                                  x="0"
                                                  y="0"
                                                  id="GRID.text.31.1.4.text"
                                                  text-anchor="end"
                                                  font-size="8.8"
                                                  stroke="rgb(77,77,77)"
                                                  font-family="Helvetica, Arial, FreeSans, Liberation Sans, Nimbus Sans L, sans-serif"
                                                  fill="rgb(77,77,77)"
                                                  stroke-opacity="1"
                                                  fill-opacity="1"
                                                  font-weight="normal"
                                                  font-style="normal"
                                                >
                                                  <tspan
                                                    id="GRID.text.31.1.4.tspan.1"
                                                    dy="3.15"
                                                    x="0"
                                                  >
                                                    15000
                                                  </tspan>
                                                </text>
                                              </g>
                                            </g>
                                            <g
                                              id="GRID.text.31.1.5"
                                              transform="translate(42.89, 388.32)"
                                              stroke-width="0.1"
                                            >
                                              <g
                                                id="GRID.text.31.1.5.scale"
                                                transform="scale(1, -1)"
                                              >
                                                <text
                                                  x="0"
                                                  y="0"
                                                  id="GRID.text.31.1.5.text"
                                                  text-anchor="end"
                                                  font-size="8.8"
                                                  stroke="rgb(77,77,77)"
                                                  font-family="Helvetica, Arial, FreeSans, Liberation Sans, Nimbus Sans L, sans-serif"
                                                  fill="rgb(77,77,77)"
                                                  stroke-opacity="1"
                                                  fill-opacity="1"
                                                  font-weight="normal"
                                                  font-style="normal"
                                                >
                                                  <tspan
                                                    id="GRID.text.31.1.5.tspan.1"
                                                    dy="3.15"
                                                    x="0"
                                                  >
                                                    20000
                                                  </tspan>
                                                </text>
                                              </g>
                                            </g>
                                          </g>
                                        </g>
                                      </g>
                                    </g>
                                  </g>
                                </g>
                                <g
                                  id="layout::axis-l.7-4-7-4::GRID.VP.6::axis::axis.1-2-1-2.1"
                                >
                                  <g id="axis.1-2-1-2.1">
                                    <g id="GRID.polyline.33.1">
                                      <polyline
                                        id="GRID.polyline.33.1.1"
                                        points="45.09,49.74 47.83,49.74"
                                        stroke="rgb(51,51,51)"
                                        fill="none"
                                        stroke-width="1.07"
                                        stroke-dasharray="none"
                                        stroke-linecap="butt"
                                        stroke-opacity="1"
                                        fill-opacity="1"
                                      />
                                      <polyline
                                        id="GRID.polyline.33.1.2"
                                        points="45.09,134.38 47.83,134.38"
                                        stroke="rgb(51,51,51)"
                                        fill="none"
                                        stroke-width="1.07"
                                        stroke-dasharray="none"
                                        stroke-linecap="butt"
                                        stroke-opacity="1"
                                        fill-opacity="1"
                                      />
                                      <polyline
                                        id="GRID.polyline.33.1.3"
                                        points="45.09,219.03 47.83,219.03"
                                        stroke="rgb(51,51,51)"
                                        fill="none"
                                        stroke-width="1.07"
                                        stroke-dasharray="none"
                                        stroke-linecap="butt"
                                        stroke-opacity="1"
                                        fill-opacity="1"
                                      />
                                      <polyline
                                        id="GRID.polyline.33.1.4"
                                        points="45.09,303.68 47.83,303.68"
                                        stroke="rgb(51,51,51)"
                                        fill="none"
                                        stroke-width="1.07"
                                        stroke-dasharray="none"
                                        stroke-linecap="butt"
                                        stroke-opacity="1"
                                        fill-opacity="1"
                                      />
                                      <polyline
                                        id="GRID.polyline.33.1.5"
                                        points="45.09,388.32 47.83,388.32"
                                        stroke="rgb(51,51,51)"
                                        fill="none"
                                        stroke-width="1.07"
                                        stroke-dasharray="none"
                                        stroke-linecap="butt"
                                        stroke-opacity="1"
                                        fill-opacity="1"
                                      />
                                    </g>
                                  </g>
                                </g>
                              </g>
                            </g>
                          </g>
                        </g>
                      </g>
                    </g>
                    <g id="layout::axis-r.7-6-7-6.1">
                      <g id="axis-r.7-6-7-6.1" />
                    </g>
                    <g id="layout::axis-b.8-5-8-5.1">
                      <g id="axis-b.8-5-8-5.1">
                        <g id="layout::axis-b.8-5-8-5::GRID.VP.3.1">
                          <g id="GRID.absoluteGrob.30.1">
                            <g id="layout::axis-b.8-5-8-5::GRID.VP.3::axis.1">
                              <g id="axis.2">
                                <g
                                  id="layout::axis-b.8-5-8-5::GRID.VP.3::axis::axis.1-1-1-1.1"
                                >
                                  <g id="axis.1-1-1-1.2">
                                    <g id="GRID.polyline.29.1">
                                      <polyline
                                        id="GRID.polyline.29.1.1"
                                        points="114.14,28.76 114.14,31.5"
                                        stroke="rgb(51,51,51)"
                                        fill="none"
                                        stroke-width="1.07"
                                        stroke-dasharray="none"
                                        stroke-linecap="butt"
                                        stroke-opacity="1"
                                        fill-opacity="1"
                                      />
                                      <polyline
                                        id="GRID.polyline.29.1.2"
                                        points="224.66,28.76 224.66,31.5"
                                        stroke="rgb(51,51,51)"
                                        fill="none"
                                        stroke-width="1.07"
                                        stroke-dasharray="none"
                                        stroke-linecap="butt"
                                        stroke-opacity="1"
                                        fill-opacity="1"
                                      />
                                      <polyline
                                        id="GRID.polyline.29.1.3"
                                        points="335.17,28.76 335.17,31.5"
                                        stroke="rgb(51,51,51)"
                                        fill="none"
                                        stroke-width="1.07"
                                        stroke-dasharray="none"
                                        stroke-linecap="butt"
                                        stroke-opacity="1"
                                        fill-opacity="1"
                                      />
                                      <polyline
                                        id="GRID.polyline.29.1.4"
                                        points="445.69,28.76 445.69,31.5"
                                        stroke="rgb(51,51,51)"
                                        fill="none"
                                        stroke-width="1.07"
                                        stroke-dasharray="none"
                                        stroke-linecap="butt"
                                        stroke-opacity="1"
                                        fill-opacity="1"
                                      />
                                      <polyline
                                        id="GRID.polyline.29.1.5"
                                        points="556.21,28.76 556.21,31.5"
                                        stroke="rgb(51,51,51)"
                                        fill="none"
                                        stroke-width="1.07"
                                        stroke-dasharray="none"
                                        stroke-linecap="butt"
                                        stroke-opacity="1"
                                        fill-opacity="1"
                                      />
                                    </g>
                                  </g>
                                </g>
                                <g
                                  id="layout::axis-b.8-5-8-5::GRID.VP.3::axis::axis.2-1-2-1.1"
                                >
                                  <g id="axis.2-1-2-1.1">
                                    <g
                                      id="layout::axis-b.8-5-8-5::GRID.VP.3::axis::axis.2-1-2-1::GRID.VP.1.1"
                                      font-size="8.8"
                                      stroke="rgb(77,77,77)"
                                      font-family="Helvetica, Arial, FreeSans, Liberation Sans, Nimbus Sans L, sans-serif"
                                      stroke-opacity="1"
                                      font-weight="normal"
                                      font-style="normal"
                                    >
                                      <g
                                        id="layout::axis-b.8-5-8-5::GRID.VP.3::axis::axis.2-1-2-1::GRID.VP.1::GRID.VP.2.1"
                                      >
                                        <g id="GRID.titleGrob.28.1">
                                          <g id="GRID.text.26.1">
                                            <g
                                              id="GRID.text.26.1.1"
                                              transform="translate(114.14, 26.56)"
                                              stroke-width="0.1"
                                            >
                                              <g
                                                id="GRID.text.26.1.1.scale"
                                                transform="scale(1, -1)"
                                              >
                                                <text
                                                  x="0"
                                                  y="0"
                                                  id="GRID.text.26.1.1.text"
                                                  text-anchor="middle"
                                                  font-size="8.8"
                                                  stroke="rgb(77,77,77)"
                                                  font-family="Helvetica, Arial, FreeSans, Liberation Sans, Nimbus Sans L, sans-serif"
                                                  fill="rgb(77,77,77)"
                                                  stroke-opacity="1"
                                                  fill-opacity="1"
                                                  font-weight="normal"
                                                  font-style="normal"
                                                >
                                                  <tspan
                                                    id="GRID.text.26.1.1.tspan.1"
                                                    dy="6.3"
                                                    x="0"
                                                  >
                                                    Fair
                                                  </tspan>
                                                </text>
                                              </g>
                                            </g>
                                            <g
                                              id="GRID.text.26.1.2"
                                              transform="translate(224.66, 26.56)"
                                              stroke-width="0.1"
                                            >
                                              <g
                                                id="GRID.text.26.1.2.scale"
                                                transform="scale(1, -1)"
                                              >
                                                <text
                                                  x="0"
                                                  y="0"
                                                  id="GRID.text.26.1.2.text"
                                                  text-anchor="middle"
                                                  font-size="8.8"
                                                  stroke="rgb(77,77,77)"
                                                  font-family="Helvetica, Arial, FreeSans, Liberation Sans, Nimbus Sans L, sans-serif"
                                                  fill="rgb(77,77,77)"
                                                  stroke-opacity="1"
                                                  fill-opacity="1"
                                                  font-weight="normal"
                                                  font-style="normal"
                                                >
                                                  <tspan
                                                    id="GRID.text.26.1.2.tspan.1"
                                                    dy="6.3"
                                                    x="0"
                                                  >
                                                    Good
                                                  </tspan>
                                                </text>
                                              </g>
                                            </g>
                                            <g
                                              id="GRID.text.26.1.3"
                                              transform="translate(335.17, 26.56)"
                                              stroke-width="0.1"
                                            >
                                              <g
                                                id="GRID.text.26.1.3.scale"
                                                transform="scale(1, -1)"
                                              >
                                                <text
                                                  x="0"
                                                  y="0"
                                                  id="GRID.text.26.1.3.text"
                                                  text-anchor="middle"
                                                  font-size="8.8"
                                                  stroke="rgb(77,77,77)"
                                                  font-family="Helvetica, Arial, FreeSans, Liberation Sans, Nimbus Sans L, sans-serif"
                                                  fill="rgb(77,77,77)"
                                                  stroke-opacity="1"
                                                  fill-opacity="1"
                                                  font-weight="normal"
                                                  font-style="normal"
                                                >
                                                  <tspan
                                                    id="GRID.text.26.1.3.tspan.1"
                                                    dy="6.3"
                                                    x="0"
                                                  >
                                                    Very Good
                                                  </tspan>
                                                </text>
                                              </g>
                                            </g>
                                            <g
                                              id="GRID.text.26.1.4"
                                              transform="translate(445.69, 26.56)"
                                              stroke-width="0.1"
                                            >
                                              <g
                                                id="GRID.text.26.1.4.scale"
                                                transform="scale(1, -1)"
                                              >
                                                <text
                                                  x="0"
                                                  y="0"
                                                  id="GRID.text.26.1.4.text"
                                                  text-anchor="middle"
                                                  font-size="8.8"
                                                  stroke="rgb(77,77,77)"
                                                  font-family="Helvetica, Arial, FreeSans, Liberation Sans, Nimbus Sans L, sans-serif"
                                                  fill="rgb(77,77,77)"
                                                  stroke-opacity="1"
                                                  fill-opacity="1"
                                                  font-weight="normal"
                                                  font-style="normal"
                                                >
                                                  <tspan
                                                    id="GRID.text.26.1.4.tspan.1"
                                                    dy="6.3"
                                                    x="0"
                                                  >
                                                    Premium
                                                  </tspan>
                                                </text>
                                              </g>
                                            </g>
                                            <g
                                              id="GRID.text.26.1.5"
                                              transform="translate(556.21, 26.56)"
                                              stroke-width="0.1"
                                            >
                                              <g
                                                id="GRID.text.26.1.5.scale"
                                                transform="scale(1, -1)"
                                              >
                                                <text
                                                  x="0"
                                                  y="0"
                                                  id="GRID.text.26.1.5.text"
                                                  text-anchor="middle"
                                                  font-size="8.8"
                                                  stroke="rgb(77,77,77)"
                                                  font-family="Helvetica, Arial, FreeSans, Liberation Sans, Nimbus Sans L, sans-serif"
                                                  fill="rgb(77,77,77)"
                                                  stroke-opacity="1"
                                                  fill-opacity="1"
                                                  font-weight="normal"
                                                  font-style="normal"
                                                >
                                                  <tspan
                                                    id="GRID.text.26.1.5.tspan.1"
                                                    dy="6.3"
                                                    x="0"
                                                  >
                                                    Ideal
                                                  </tspan>
                                                </text>
                                              </g>
                                            </g>
                                          </g>
                                        </g>
                                      </g>
                                    </g>
                                  </g>
                                </g>
                              </g>
                            </g>
                          </g>
                        </g>
                      </g>
                    </g>
                    <g id="layout::xlab-t.5-5-5-5.1">
                      <g id="xlab-t.5-5-5-5.1" />
                    </g>
                    <g id="layout::xlab-b.9-5-9-5.1">
                      <g id="xlab-b.9-5-9-5.1">
                        <g
                          id="layout::xlab-b.9-5-9-5::GRID.VP.7.1"
                          font-size="11"
                          stroke="rgb(0,0,0)"
                          font-family="Helvetica, Arial, FreeSans, Liberation Sans, Nimbus Sans L, sans-serif"
                          stroke-opacity="1"
                          font-weight="normal"
                          font-style="normal"
                        >
                          <g
                            id="layout::xlab-b.9-5-9-5::GRID.VP.7::GRID.VP.8.1"
                          >
                            <g id="axis.title.x.bottom..titleGrob.38.1">
                              <g id="GRID.text.35.1">
                                <g
                                  id="GRID.text.35.1.1"
                                  transform="translate(335.17, 15.67)"
                                  stroke-width="0.1"
                                >
                                  <g
                                    id="GRID.text.35.1.1.scale"
                                    transform="scale(1, -1)"
                                  >
                                    <text
                                      x="0"
                                      y="0"
                                      id="GRID.text.35.1.1.text"
                                      text-anchor="middle"
                                      font-size="11"
                                      stroke="rgb(0,0,0)"
                                      font-family="Helvetica, Arial, FreeSans, Liberation Sans, Nimbus Sans L, sans-serif"
                                      fill="rgb(0,0,0)"
                                      stroke-opacity="1"
                                      fill-opacity="1"
                                      font-weight="normal"
                                      font-style="normal"
                                    >
                                      <tspan
                                        id="GRID.text.35.1.1.tspan.1"
                                        dy="7.88"
                                        x="0"
                                      >
                                        Cut
                                      </tspan>
                                    </text>
                                  </g>
                                </g>
                              </g>
                            </g>
                          </g>
                        </g>
                      </g>
                    </g>
                    <g id="layout::ylab-l.7-3-7-3.1">
                      <g id="ylab-l.7-3-7-3.1">
                        <g
                          id="layout::ylab-l.7-3-7-3::GRID.VP.9.1"
                          font-size="11"
                          stroke="rgb(0,0,0)"
                          font-family="Helvetica, Arial, FreeSans, Liberation Sans, Nimbus Sans L, sans-serif"
                          stroke-opacity="1"
                          font-weight="normal"
                          font-style="normal"
                        >
                          <g
                            id="layout::ylab-l.7-3-7-3::GRID.VP.9::GRID.VP.10.1"
                          >
                            <g id="axis.title.y.left..titleGrob.41.1">
                              <g id="GRID.text.39.1">
                                <g
                                  id="GRID.text.39.1.1"
                                  transform="translate(5.48, 232.16)"
                                  stroke-width="0.1"
                                >
                                  <g
                                    id="GRID.text.39.1.1.scale"
                                    transform="scale(1, -1)"
                                  >
                                    <text
                                      x="0"
                                      y="0"
                                      id="GRID.text.39.1.1.text"
                                      transform="rotate(-90)"
                                      text-anchor="middle"
                                      font-size="11"
                                      stroke="rgb(0,0,0)"
                                      font-family="Helvetica, Arial, FreeSans, Liberation Sans, Nimbus Sans L, sans-serif"
                                      fill="rgb(0,0,0)"
                                      stroke-opacity="1"
                                      fill-opacity="1"
                                      font-weight="normal"
                                      font-style="normal"
                                    >
                                      <tspan
                                        id="GRID.text.39.1.1.tspan.1"
                                        dy="7.88"
                                        x="0"
                                      >
                                        Count
                                      </tspan>
                                    </text>
                                  </g>
                                </g>
                              </g>
                            </g>
                          </g>
                        </g>
                      </g>
                    </g>
                    <g id="layout::ylab-r.7-7-7-7.1">
                      <g id="ylab-r.7-7-7-7.1" />
                    </g>
                    <g id="layout::subtitle.4-5-4-5.1">
                      <g id="subtitle.4-5-4-5.1" />
                    </g>
                    <g id="layout::title.3-5-3-5.1">
                      <g id="title.3-5-3-5.1">
                        <g
                          id="layout::title.3-5-3-5::GRID.VP.11.1"
                          font-size="13.2"
                          stroke="rgb(0,0,0)"
                          font-family="Helvetica, Arial, FreeSans, Liberation Sans, Nimbus Sans L, sans-serif"
                          stroke-opacity="1"
                          font-weight="normal"
                          font-style="normal"
                        >
                          <g
                            id="layout::title.3-5-3-5::GRID.VP.11::GRID.VP.12.1"
                          >
                            <g id="plot.title..titleGrob.45.1">
                              <g id="GRID.text.42.1">
                                <g
                                  id="GRID.text.42.1.1"
                                  transform="translate(47.83, 450.52)"
                                  stroke-width="0.1"
                                >
                                  <g
                                    id="GRID.text.42.1.1.scale"
                                    transform="scale(1, -1)"
                                  >
                                    <text
                                      x="0"
                                      y="0"
                                      id="GRID.text.42.1.1.text"
                                      text-anchor="start"
                                      font-size="13.2"
                                      stroke="rgb(0,0,0)"
                                      font-family="Helvetica, Arial, FreeSans, Liberation Sans, Nimbus Sans L, sans-serif"
                                      fill="rgb(0,0,0)"
                                      stroke-opacity="1"
                                      fill-opacity="1"
                                      font-weight="normal"
                                      font-style="normal"
                                    >
                                      <tspan
                                        id="GRID.text.42.1.1.tspan.1"
                                        dy="9.45"
                                        x="0"
                                      >
                                        The Number of Diamonds by Cut.
                                      </tspan>
                                    </text>
                                  </g>
                                </g>
                              </g>
                            </g>
                          </g>
                        </g>
                      </g>
                    </g>
                    <g id="layout::caption.10-5-10-5.1">
                      <g id="caption.10-5-10-5.1" />
                    </g>
                    <g id="layout::tag.2-2-2-2.1">
                      <g id="tag.2-2-2-2.1" />
                    </g>
                  </g>
                </g>
              </g>
            </g>
          </svg>
        </div>
        <br />
      </div>
    </div>
    
  </div>
  )
}

export default App
