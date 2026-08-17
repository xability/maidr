# [4.4.0](https://github.com/xability/maidr/compare/v4.3.0...v4.4.0) (2026-08-17)


### Bug Fixes

* **audio:** centre a trace that has no horizontal extent ([#946](https://github.com/xability/maidr/issues/946)) ([0d032e2](https://github.com/xability/maidr/commit/0d032e2e7d307727a9fa06d7839ea6fafad86854)), closes [#945](https://github.com/xability/maidr/issues/945)
* **autoplay:** sound the point playback starts from ([#940](https://github.com/xability/maidr/issues/940)) ([c707bd0](https://github.com/xability/maidr/commit/c707bd0e2888509726f35b7c0b50b7a739f2c9fc)), closes [#615](https://github.com/xability/maidr/issues/615)
* **autoplay:** take the tempo from the trace's longest axis ([#944](https://github.com/xability/maidr/issues/944)) ([308fca9](https://github.com/xability/maidr/commit/308fca9ef251f31f250627df65da15e966bce1b4)), closes [#614](https://github.com/xability/maidr/issues/614)
* **format:** announce a value a numeric format cannot express, not NaN ([#931](https://github.com/xability/maidr/issues/931)) ([e7f98ab](https://github.com/xability/maidr/commit/e7f98abcdc914677c223053f94d87ed58fdc3e3d)), closes [#930](https://github.com/xability/maidr/issues/930)
* **tableau:** correct the visual specification against the shipped declarations ([#939](https://github.com/xability/maidr/issues/939)) ([1b50ce3](https://github.com/xability/maidr/commit/1b50ce36ce900c8394411bf850311a7220c3fac3)), closes [#935](https://github.com/xability/maidr/issues/935)


### Features

* **bar:** say so when a category name reaches the magnitude field ([#951](https://github.com/xability/maidr/issues/951)) ([bda4bfd](https://github.com/xability/maidr/commit/bda4bfdafd564f35bead53a7c46fd402b848e08c)), closes [xability/py-maidr#427](https://github.com/xability/py-maidr/issues/427) [#925](https://github.com/xability/maidr/issues/925) [#927](https://github.com/xability/maidr/issues/927) [#930](https://github.com/xability/maidr/issues/930) [#615](https://github.com/xability/maidr/issues/615) [#942](https://github.com/xability/maidr/issues/942) [#943](https://github.com/xability/maidr/issues/943) [#614](https://github.com/xability/maidr/issues/614) [#945](https://github.com/xability/maidr/issues/945) [#184](https://github.com/xability/maidr/issues/184) [#186](https://github.com/xability/maidr/issues/186) [#947](https://github.com/xability/maidr/issues/947) [#184](https://github.com/xability/maidr/issues/184) [#480](https://github.com/xability/maidr/issues/480) [#482](https://github.com/xability/maidr/issues/482) [#950](https://github.com/xability/maidr/issues/950)
* **error-bar:** give a grouped interval chart a shape in the grammar ([#943](https://github.com/xability/maidr/issues/943)) ([e8d3874](https://github.com/xability/maidr/commit/e8d387409a18e7132c5df53242095eaec87f652f)), closes [#942](https://github.com/xability/maidr/issues/942)
* **scatter:** let a point say which category it is in ([#929](https://github.com/xability/maidr/issues/929)) ([0e08938](https://github.com/xability/maidr/commit/0e0893842739503a691a693c28d6abb5053122ee)), closes [#927](https://github.com/xability/maidr/issues/927)
* **tableau:** add tableau embedding api adapter ([#932](https://github.com/xability/maidr/issues/932)) ([62a4e62](https://github.com/xability/maidr/commit/62a4e627b602647d40dea4f0e4dd4813506edf48))
* **tableau:** lay dashboard worksheets into a geometry-aware subplot grid ([#941](https://github.com/xability/maidr/issues/941)) ([12a4760](https://github.com/xability/maidr/commit/12a4760ae4a4a3a914715c9ca9e54b74c3df291e)), closes [#936](https://github.com/xability/maidr/issues/936)

# [4.3.0](https://github.com/xability/maidr/compare/v4.2.0...v4.3.0) (2026-08-16)


### Bug Fixes

* **ci:** size the e2e report's code fence so its content cannot close it ([#924](https://github.com/xability/maidr/issues/924)) ([e4afdd9](https://github.com/xability/maidr/commit/e4afdd9c9ffe5f76e604dce8b4416b89cbc36c48)), closes [#715](https://github.com/xability/maidr/issues/715)
* **docs:** generate the examples gallery so it cannot miss a page ([#914](https://github.com/xability/maidr/issues/914)) ([f5aecad](https://github.com/xability/maidr/commit/f5aecad934944c3f36413e23403b81493b3428f0)), closes [#911](https://github.com/xability/maidr/issues/911)
* **docs:** give built pages heading ids so in-page links jump ([#918](https://github.com/xability/maidr/issues/918)) ([9ed5a39](https://github.com/xability/maidr/commit/9ed5a396e2e4668c3d00e6d91861995223d73607)), closes [#917](https://github.com/xability/maidr/issues/917) [#913](https://github.com/xability/maidr/issues/913)
* **docs:** resolve the committed conflict markers and guard against more ([#921](https://github.com/xability/maidr/issues/921)) ([0c04513](https://github.com/xability/maidr/commit/0c04513a25cb96afbff3d15195cbb435716140b1)), closes [#918](https://github.com/xability/maidr/issues/918) [#917](https://github.com/xability/maidr/issues/917)
* **highlight:** let a flow or network trace publish the ribbon it highlighted ([#906](https://github.com/xability/maidr/issues/906)) ([da131aa](https://github.com/xability/maidr/commit/da131aa76099a2730119e9bdf9c5391f99a72cd9)), closes [#895](https://github.com/xability/maidr/issues/895) [#903](https://github.com/xability/maidr/issues/903) [#899](https://github.com/xability/maidr/issues/899) [#904](https://github.com/xability/maidr/issues/904) [#903](https://github.com/xability/maidr/issues/903) [#904](https://github.com/xability/maidr/issues/904) [#904](https://github.com/xability/maidr/issues/904)
* **line:** read every path command, so a staircase highlights its samples ([#908](https://github.com/xability/maidr/issues/908)) ([035c5bd](https://github.com/xability/maidr/commit/035c5bdd95d076385d7e26b815fb0e9503811005))
* **plotly:** count a box's group across the whole box layer ([#883](https://github.com/xability/maidr/issues/883)) ([78375cb](https://github.com/xability/maidr/commit/78375cb4587b1468fb14d4dc5381b0529f172d3a)), closes [#882](https://github.com/xability/maidr/issues/882)
* **plotly:** scope a candlestick's selector to its own panel and trace ([#882](https://github.com/xability/maidr/issues/882)) ([1cf0470](https://github.com/xability/maidr/commit/1cf0470be356e5d9adcb97d938d0795695367042)), closes [#881](https://github.com/xability/maidr/issues/881)
* **trace:** answer empty rather than throwing when the cursor has no point ([#909](https://github.com/xability/maidr/issues/909)) ([893d6ea](https://github.com/xability/maidr/commit/893d6ead3d7b6078f4e0bdf798c0b1b537522a48))
* **trace:** answer for a row that does not exist instead of throwing ([#916](https://github.com/xability/maidr/issues/916)) ([4b6f731](https://github.com/xability/maidr/commit/4b6f7315fca7f2de45d417c95fe4a2a1fe18f449)), closes [#905](https://github.com/xability/maidr/issues/905)


### Features

* **adapters:** add the co-located maidr trace declaration ([#886](https://github.com/xability/maidr/issues/886)) ([bbd62b6](https://github.com/xability/maidr/commit/bbd62b690c4e2bd46ce7ae8532303be557abe026))
* **adapters:** close the declaration-foundation gaps the adapters reported ([#900](https://github.com/xability/maidr/issues/900)) ([ec47b0e](https://github.com/xability/maidr/commit/ec47b0eb12200b8d50e70d964e6aab31f57a93e9)), closes [#896](https://github.com/xability/maidr/issues/896) [#896](https://github.com/xability/maidr/issues/896)
* **amcharts:** read flow, hierarchy, map and gauge charts ([#903](https://github.com/xability/maidr/issues/903)) ([7cf4c5c](https://github.com/xability/maidr/commit/7cf4c5ce3f64dcedbaf39553f213e29ee4f7385d))
* **amcharts:** read the chart types deferred out of the coverage PR ([#895](https://github.com/xability/maidr/issues/895)) ([5a39999](https://github.com/xability/maidr/commit/5a39999581a6f033bc5de762a68bcd7d776c97e0))
* **amcharts:** support the chart types added since the pie chart ([#879](https://github.com/xability/maidr/issues/879)) ([1763eec](https://github.com/xability/maidr/commit/1763eec9667d0fb26bc59de9e8bc9eb8a5545562))
* **anychart:** read the chart types deferred out of the coverage PR ([#892](https://github.com/xability/maidr/issues/892)) ([cd9c89f](https://github.com/xability/maidr/commit/cd9c89fd449f3c9d2d9f6ebb7033fb58923fc1dc))
* **anychart:** support the chart types added since the pie chart ([#877](https://github.com/xability/maidr/issues/877)) ([3f0cb99](https://github.com/xability/maidr/commit/3f0cb994f50f10ad92a9670fef70ce034804f174))
* **area:** announce and highlight the step direction of a filled staircase ([#902](https://github.com/xability/maidr/issues/902)) ([1715d6a](https://github.com/xability/maidr/commit/1715d6ab0a170ae805f8aa4408ff80fb26989f85))
* **chartjs:** read the chart types deferred out of the coverage PR ([#890](https://github.com/xability/maidr/issues/890)) ([0c402aa](https://github.com/xability/maidr/commit/0c402aad757f03b46a91668bee793b87db990705))
* **chartjs:** support the chart types added since the pie chart ([#872](https://github.com/xability/maidr/issues/872)) ([b482bdc](https://github.com/xability/maidr/commit/b482bdcd78f576480552896ab8a43882253fe6a9))
* **d3:** read the chart types deferred out of the coverage PR ([#888](https://github.com/xability/maidr/issues/888)) ([aad9d47](https://github.com/xability/maidr/commit/aad9d47c18e0f6cd0c881449e94a963c24126ce1))
* **d3:** support the chart types added since the pie chart ([#880](https://github.com/xability/maidr/issues/880)) ([e4e5e69](https://github.com/xability/maidr/commit/e4e5e69912e88e9f759fe7e673db693aa84ab9ae))
* **frappe:** support the chart types added since the pie chart ([#870](https://github.com/xability/maidr/issues/870)) ([739f55d](https://github.com/xability/maidr/commit/739f55de5b27d371598236333bb979f3cc5f77aa))
* **google-charts:** support the chart types added since the pie chart ([#876](https://github.com/xability/maidr/issues/876)) ([b4bfa5c](https://github.com/xability/maidr/commit/b4bfa5c84f656fad4bef082128f978ae77435bdb))
* **highcharts:** read the chart types deferred out of the coverage PR ([#893](https://github.com/xability/maidr/issues/893)) ([22853ee](https://github.com/xability/maidr/commit/22853eef267a116c59fa370ea33407856dd06ae9))
* **highcharts:** support the chart types added since the pie chart ([#878](https://github.com/xability/maidr/issues/878)) ([33a4336](https://github.com/xability/maidr/commit/33a4336cf69eb6da4fee3f8208af8366883fb382)), closes [WordcloudSeries#drawPoints](https://github.com/WordcloudSeries/issues/drawPoints)
* **highlight:** let a canvas adapter address a scatter-family point ([#899](https://github.com/xability/maidr/issues/899)) ([e13ba10](https://github.com/xability/maidr/commit/e13ba101d19f8d073631af08e7ee1e5f9b85f1eb)), closes [#897](https://github.com/xability/maidr/issues/897) [#897](https://github.com/xability/maidr/issues/897)
* **line:** let a fitted curve carry its confidence band ([#920](https://github.com/xability/maidr/issues/920)) ([9233d51](https://github.com/xability/maidr/commit/9233d51921fe2f35e25d58484d1ad4bebfed3ea5))
* **line:** let a sample carry a position with no reading ([#926](https://github.com/xability/maidr/issues/926)) ([d2ccc1b](https://github.com/xability/maidr/commit/d2ccc1b3d0b6a91068a494292a123ba3d37a2259)), closes [xability/py-maidr#427](https://github.com/xability/py-maidr/issues/427) [#925](https://github.com/xability/maidr/issues/925)
* **observable:** make Quarto's Observable Plot charts accessible ([#887](https://github.com/xability/maidr/issues/887)) ([7d9f419](https://github.com/xability/maidr/commit/7d9f419aa5996cf23ba02ab9ef5719912dd80baa))
* **observable:** name the watcher for what it watches, and document the plain-page path ([#898](https://github.com/xability/maidr/issues/898)) ([7e2a8bf](https://github.com/xability/maidr/commit/7e2a8bf9a780baf449c1467d2698ed8c93e565ad)), closes [#887](https://github.com/xability/maidr/issues/887)
* **plotly:** read the chart types deferred out of the coverage PR ([#891](https://github.com/xability/maidr/issues/891)) ([5a7c4ac](https://github.com/xability/maidr/commit/5a7c4ac8dd96a00fdca550d4e842f6a7da0c7a8c))
* **plotly:** support the chart types added since the pie chart ([#874](https://github.com/xability/maidr/issues/874)) ([d2ed9c6](https://github.com/xability/maidr/commit/d2ed9c60af64d97bdb56d36398b22b5dc0a7be13))
* **recharts:** read the chart types deferred out of the coverage PR ([#894](https://github.com/xability/maidr/issues/894)) ([b8f4b3a](https://github.com/xability/maidr/commit/b8f4b3a4b2f0c3bb5a76124caef758e4f7578e95))
* **recharts:** support the chart types added since the pie chart ([#875](https://github.com/xability/maidr/issues/875)) ([bd4e637](https://github.com/xability/maidr/commit/bd4e63772a14dcc06bb2c8fe2513d053014e160c))
* **vegalite:** read the chart types deferred out of the coverage PR ([#889](https://github.com/xability/maidr/issues/889)) ([713660a](https://github.com/xability/maidr/commit/713660a3bfaa3f099b433232d543ead982309f2e))
* **vegalite:** support the chart types added since the pie chart ([#871](https://github.com/xability/maidr/issues/871)) ([170c4d1](https://github.com/xability/maidr/commit/170c4d1a8fa526073b64f8219520c479271f9c1e))
* **victory:** support the chart types added since the pie chart ([#873](https://github.com/xability/maidr/issues/873)) ([5ef2429](https://github.com/xability/maidr/commit/5ef24296b8f10bc74840e889b05c88d491ecf174))

# [4.2.0](https://github.com/xability/maidr/compare/v4.1.0...v4.2.0) (2026-08-13)


### Bug Fixes

* **bar:** stop a trace writing to the spec it was handed ([#837](https://github.com/xability/maidr/issues/837)) ([340dac5](https://github.com/xability/maidr/commit/340dac58e80b2152a0f8325f124a5a0c2c5d6111))
* **chartjs:** carry a bubble's radius instead of discarding it ([#826](https://github.com/xability/maidr/issues/826)) ([7fd4e12](https://github.com/xability/maidr/commit/7fd4e126b31576d2b60ba463bfc1e66d1212cc46))
* **text:** render a section's case as authored wherever it is announced ([#855](https://github.com/xability/maidr/issues/855)) ([d7faae4](https://github.com/xability/maidr/commit/d7faae4e243d1461d32eb60dcf9bca8fdccfa23c))


### Features

* **boxen:** read a quantile ladder however deep it goes ([#841](https://github.com/xability/maidr/issues/841)) ([979923f](https://github.com/xability/maidr/commit/979923f4243c5aff48fce9070f943a13a60494b2))
* **bump:** sound first place as first place ([#836](https://github.com/xability/maidr/issues/836)) ([88ea7eb](https://github.com/xability/maidr/commit/88ea7eb4ec624c15b21cee17b99f9c864c791021))
* **choropleth:** read a map as a map, not as a list of places ([#850](https://github.com/xability/maidr/issues/850)) ([8de0354](https://github.com/xability/maidr/commit/8de03546a755ab249f79031d6512260bd7fbac33))
* **contour:** read a level as a value and the spacing as a gradient ([#848](https://github.com/xability/maidr/issues/848)) ([f51c0d9](https://github.com/xability/maidr/commit/f51c0d9c4d8d1b87ed2f4afb673593d27f0bd4e1))
* **diverging:** read a population pyramid by size and side ([#838](https://github.com/xability/maidr/issues/838)) ([48c7057](https://github.com/xability/maidr/commit/48c7057e77c03e7d5229c80b8f2a5eb0df64c1c8))
* **dot:** let a dot plot and a lollipop say which chart they are ([#840](https://github.com/xability/maidr/issues/840)) ([d57b03d](https://github.com/xability/maidr/commit/d57b03d6a22f38cb299d11f82b42c42e4334a7df))
* **forest:** say whether a study crosses the null, and what it weighs ([#844](https://github.com/xability/maidr/issues/844)) ([20c8ce8](https://github.com/xability/maidr/commit/20c8ce88d8562fb656207c8c944b50207745a719))
* **funnel:** give the ear the ratio it cannot compute ([#839](https://github.com/xability/maidr/issues/839)) ([d61cbf6](https://github.com/xability/maidr/commit/d61cbf6486df1c5149522b714810701a0da6a007))
* **gantt:** read a schedule as the intervals it is ([#834](https://github.com/xability/maidr/issues/834)) ([dd0c73a](https://github.com/xability/maidr/commit/dd0c73aadf3fa7ab850fda7549377c747eac9c32))
* **grammar:** let a layer say which one it is ([#831](https://github.com/xability/maidr/issues/831)) ([9c44965](https://github.com/xability/maidr/commit/9c44965bfb8967ac5f237dd47b937f837ae4443d))
* **hexbin:** keep a vertical walk over the x it started from ([#842](https://github.com/xability/maidr/issues/842)) ([59e9314](https://github.com/xability/maidr/commit/59e9314040e053d9d194beba8bc6883d5b841a6a))
* **mosaic:** read a bar's width as the second magnitude it is ([#846](https://github.com/xability/maidr/issues/846)) ([56ad59f](https://github.com/xability/maidr/commit/56ad59f27bd1c6cd18485500e113c1a5f77ed536))
* **network:** reach every node, which following links cannot ([#853](https://github.com/xability/maidr/issues/853)) ([94d434f](https://github.com/xability/maidr/commit/94d434fa746b0ab85ba5c9b6e9eb11a0e8e80dc4))
* **parallel:** pitch every axis against itself ([#835](https://github.com/xability/maidr/issues/835)) ([16472b1](https://github.com/xability/maidr/commit/16472b1c18d826a0bb9cbd9018722f21b50820a0))
* **radar:** read categories arranged around a circle ([#833](https://github.com/xability/maidr/issues/833)) ([b6d7a37](https://github.com/xability/maidr/commit/b6d7a371ccce3de1c58c7ab89d85d446e2201c34))
* **ridgeline:** compare distributions at the value the reader chose ([#843](https://github.com/xability/maidr/issues/843)) ([a6e3d50](https://github.com/xability/maidr/commit/a6e3d507f0f1cab4cd45621368d3f1c431eb4a8a))
* **sankey:** follow the ribbon, which is what the chart is drawn for ([#852](https://github.com/xability/maidr/issues/852)) ([636c0f0](https://github.com/xability/maidr/commit/636c0f04f3ffb1574dced9988c138bc3ea5abbed))
* **sunburst:** read a sunburst and an icicle as the tree they are ([#851](https://github.com/xability/maidr/issues/851)) ([c48019a](https://github.com/xability/maidr/commit/c48019a34f7031cb13d06328ad305fe61aeaa525))
* **survival:** give a Kaplan-Meier curve its median and its censoring ([#845](https://github.com/xability/maidr/issues/845)) ([49c49bf](https://github.com/xability/maidr/commit/49c49bf43384811a87a0624386b76e812144cdc3))
* **treemap:** navigate the hierarchy as a hierarchy ([#849](https://github.com/xability/maidr/issues/849)) ([b5c4f97](https://github.com/xability/maidr/commit/b5c4f9792f5e179d636729d04c2ea66ec3ce796b))
* **volcano:** find the points that cross the line, not the ones next to them ([#847](https://github.com/xability/maidr/issues/847)) ([842a565](https://github.com/xability/maidr/commit/842a5652b68b863ccf321fa3ac5c9fa3528c2522))

# [4.1.0](https://github.com/xability/maidr/compare/v4.0.0...v4.1.0) (2026-08-11)


### Bug Fixes

* **errorbar:** implement the extrema navigation the trace advertises ([#821](https://github.com/xability/maidr/issues/821)) ([5181cc1](https://github.com/xability/maidr/commit/5181cc132daf9c7976e6b6b89978e59915656202))
* **help:** show braille mode its own shortcuts, not the trace menu ([#527](https://github.com/xability/maidr/issues/527)) ([d429e0b](https://github.com/xability/maidr/commit/d429e0b74ee4e998c910c2156406b5521944a8f5))
* **line:** announce an ordinal y by name instead of by level code ([#786](https://github.com/xability/maidr/issues/786)) ([84d9003](https://github.com/xability/maidr/commit/84d9003455e2335830e0a99dd9623c0154fd4cb8)), closes [#785](https://github.com/xability/maidr/issues/785)
* **pie:** announce a negative slice as the chart draws it ([#781](https://github.com/xability/maidr/issues/781)) ([984e5b6](https://github.com/xability/maidr/commit/984e5b66795f8a04606498ff6abf737e4852248f))
* **scatter:** keep the rotor cursor and its announcements in step ([#823](https://github.com/xability/maidr/issues/823)) ([20981ec](https://github.com/xability/maidr/commit/20981ec0ffaa411cbdc039e2d1a23c3252fe04bf))
* **scatter:** let autoplay sweep the points inside an entered grid cell ([#825](https://github.com/xability/maidr/issues/825)) ([cabf7c5](https://github.com/xability/maidr/commit/cabf7c5dcc0cb90fb3010a91a1e263f89323db37)), closes [#824](https://github.com/xability/maidr/issues/824)
* **vegalite:** read a bar's stack setting without discarding null ([#817](https://github.com/xability/maidr/issues/817)) ([11c0aaa](https://github.com/xability/maidr/commit/11c0aaad2985f372cb9c83b123e62152fab9fa08))


### Features

* **area:** read an area chart as its own trace type ([#815](https://github.com/xability/maidr/issues/815)) ([97ed6d0](https://github.com/xability/maidr/commit/97ed6d0cf05d2b02a00c3cdf79e92a95503520b2)), closes [#788](https://github.com/xability/maidr/issues/788)
* **chartjs:** read a filled line dataset as an area band ([#818](https://github.com/xability/maidr/issues/818)) ([95b8f1e](https://github.com/xability/maidr/commit/95b8f1ebb9bdeb565c6401c6c4d343b9d495be7b))
* **dumbbell:** read a pair per category with the gap between them ([#829](https://github.com/xability/maidr/issues/829)) ([e593d9b](https://github.com/xability/maidr/commit/e593d9be09f304163587625a4cc712bc9134ba1b))
* **errorbar:** read an estimate together with its interval ([#819](https://github.com/xability/maidr/issues/819)) ([1dd9cdb](https://github.com/xability/maidr/commit/1dd9cdb2729dfc55313ce6d6081286bf4943179e))
* **gauge:** read a measure against its range, target and bands ([#827](https://github.com/xability/maidr/issues/827)) ([f3716fc](https://github.com/xability/maidr/commit/f3716fc34692ab0fc9c0827825c9708b1336befc))
* **pie:** announce where a slice sits on the dial ([#784](https://github.com/xability/maidr/issues/784)) ([bfb520d](https://github.com/xability/maidr/commit/bfb520d76ebb845f95f87f8c10fb3bbb0cd5c0e8))
* **pie:** pan a slice by where it sits on the dial ([#782](https://github.com/xability/maidr/issues/782)) ([1015a69](https://github.com/xability/maidr/commit/1015a69b8974d0feaf077b7515a20e218befe87c))
* **scatter:** read a third dimension as an echo train, and walk points one at a time ([#619](https://github.com/xability/maidr/issues/619)) ([16446c5](https://github.com/xability/maidr/commit/16446c5013e45ba4ad6f2f1cf55c551e21f79637)), closes [#601](https://github.com/xability/maidr/issues/601)
* **waterfall:** read a bridge as contributions with running totals ([#820](https://github.com/xability/maidr/issues/820)) ([99dc249](https://github.com/xability/maidr/commit/99dc2495080d5bcb89324b081e5d7801693f44d2))
* **wordcloud:** read a cloud as terms walked by weight ([#822](https://github.com/xability/maidr/issues/822)) ([9d5cab4](https://github.com/xability/maidr/commit/9d5cab48bd4f5b5235a48416f4d2a961d36957ed))

# [4.0.0](https://github.com/xability/maidr/compare/v3.75.1...v4.0.0) (2026-08-10)


### Bug Fixes

* **amcharts:** measure a pie wedge instead of believing its reported box ([#775](https://github.com/xability/maidr/issues/775)) ([d1ac71c](https://github.com/xability/maidr/commit/d1ac71c02edc026f6ba0aadddf90e944c9f2c3b5))
* announce gaps as missing, and stop two adapters mislabelling or dropping highlights ([#772](https://github.com/xability/maidr/issues/772)) ([6851654](https://github.com/xability/maidr/commit/6851654ff231bfdb7ef0da1976cd6bdf1de57433)), closes [#769](https://github.com/xability/maidr/issues/769) [#768](https://github.com/xability/maidr/issues/768)
* **bar:** keep a gap in bar data out of pitch, braille, and extrema ([#728](https://github.com/xability/maidr/issues/728)) ([3fbd1b9](https://github.com/xability/maidr/commit/3fbd1b9c4e71aae63f23cb56a27bb737573c56ac))
* **box:** describe every box's range and outliers, not one chart-wide pair ([#752](https://github.com/xability/maidr/issues/752)) ([31bbac3](https://github.com/xability/maidr/commit/31bbac3fcffdd23792e910f70df073e94215f627))
* **ci:** make the `!` breaking marker actually reach the release ([#779](https://github.com/xability/maidr/issues/779)) ([da87056](https://github.com/xability/maidr/commit/da87056919877aae03407e9c0ae2b220f9ac0164))
* **description:** round the numbers the chart description reads out ([#757](https://github.com/xability/maidr/issues/757)) ([0742033](https://github.com/xability/maidr/commit/07420334f8fee601d0f414d034e4b9c99538d5fa))
* **format:** round announced values to two decimals by default ([#727](https://github.com/xability/maidr/issues/727)) ([8b3c428](https://github.com/xability/maidr/commit/8b3c428ed86947b5d9a1aae44df28b805875417a))
* give blank axis labels a name, and stamp only the wedges a pie fills ([#773](https://github.com/xability/maidr/issues/773)) ([ffaf337](https://github.com/xability/maidr/commit/ffaf33772c73494c133a6631e9222256325cae55))
* **model:** keep a figure navigable when a subplot has no layers ([#751](https://github.com/xability/maidr/issues/751)) ([f1c1140](https://github.com/xability/maidr/commit/f1c114055e76b9d0f72c91482643e6d978c4f6e3))
* **model:** tell the navigate callback when the selection ends ([#777](https://github.com/xability/maidr/issues/777)) ([7a505eb](https://github.com/xability/maidr/commit/7a505ebb828c386a2747886d5069991da5fa775b)), closes [#774](https://github.com/xability/maidr/issues/774)
* **plotly:** read normalized bar values from calcdata ([#724](https://github.com/xability/maidr/issues/724)) ([052a342](https://github.com/xability/maidr/commit/052a3427e4d3c9b8512d39afe8df207cfd029ee5))
* **plotly:** stop announcing plotly's editor placeholders as axis names ([#719](https://github.com/xability/maidr/issues/719)) ([7a138dc](https://github.com/xability/maidr/commit/7a138dc6b5c496937e3b7127c97fb03a7cd85908))
* **svg:** treat an unusable selector as matching nothing ([#750](https://github.com/xability/maidr/issues/750)) ([c69b3e2](https://github.com/xability/maidr/commit/c69b3e2d3df26cbfcfe548b8dc755c0867682c08))
* **violin:** attribute the described extremes to the violin they come from ([#755](https://github.com/xability/maidr/issues/755)) ([a3debfe](https://github.com/xability/maidr/commit/a3debfee698820c0aa9dd5fcbc365fae631b9aad))


### Features

* **adapters:** bind a step chart as a step trace, not a line ([#746](https://github.com/xability/maidr/issues/746)) ([e44afd8](https://github.com/xability/maidr/commit/e44afd8c42451aa326265c660e80545ea0948f49))
* **audio:** play the menu open/close cue for every dialog ([#753](https://github.com/xability/maidr/issues/753)) ([d2b2f1e](https://github.com/xability/maidr/commit/d2b2f1edad98e54e7fcc4d93f812b0fc40af76a4))
* **pie:** support pie charts across the core and every adapter ([#767](https://github.com/xability/maidr/issues/767)) ([821de63](https://github.com/xability/maidr/commit/821de636cc3cef0510fcdd082371deb350c0863d))
* **plotly:** support violin traces, and examine an unsupported chart once ([#722](https://github.com/xability/maidr/issues/722)) ([45ec611](https://github.com/xability/maidr/commit/45ec6113ce2365bd4162eb164a29af8f4674fc56))
* **step:** add a step plot trace type for piecewise-constant data ([#723](https://github.com/xability/maidr/issues/723)) ([e26d40f](https://github.com/xability/maidr/commit/e26d40f2d3f93e254c5afddcb3385df3d32f3ec6))
* **text:** announce orientation for every plot type that has one ([#747](https://github.com/xability/maidr/issues/747)) ([e85d1f9](https://github.com/xability/maidr/commit/e85d1f9044ce0147fa56fb3a445e19ee54f2398b))


### Performance Improvements

* **build:** ship React's production build ([#762](https://github.com/xability/maidr/issues/762)) ([3c3dd0d](https://github.com/xability/maidr/commit/3c3dd0dc009876f88a500a434fbe6ab4e80db78d)), closes [#759](https://github.com/xability/maidr/issues/759)
* **build:** stop publishing sourcemaps to npm ([#716](https://github.com/xability/maidr/issues/716)) ([55ac889](https://github.com/xability/maidr/commit/55ac88935b2e0f0bbe21b60606b41a8cbe416e1e))


### BREAKING CHANGES

* **model:** `NavigateCallback` receives `null` when no data point is active. A callback that dereferences its argument without checking will throw on leaving a subplot. Consumers are the in-repo Chart.js plugin and amCharts binder, both updated here, plus anyone who set `onNavigate` when constructing MAIDR data programmatically.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>

## [3.75.1](https://github.com/xability/maidr/compare/v3.75.0...v3.75.1) (2026-08-03)


### Bug Fixes

* **build:** stop emitting a core ES bundle that UMD overwrites ([#667](https://github.com/xability/maidr/issues/667)) ([45741bf](https://github.com/xability/maidr/commit/45741bfc41ab70ad7f87048d1fff96fc33b9c37d))
* **chat:** announce the chat dialog as what its heading shows ([#712](https://github.com/xability/maidr/issues/712)) ([37bc537](https://github.com/xability/maidr/commit/37bc53712011dcca683ac44ecf17273d9860f09b))
* **chat:** give every message an id no other message can have ([#706](https://github.com/xability/maidr/issues/706)) ([be7e255](https://github.com/xability/maidr/commit/be7e2556dea47a0943a2b87cc9abbfd9070cef70))
* **chat:** hide the live region that was rendering every message twice ([#699](https://github.com/xability/maidr/issues/699)) ([a6e726f](https://github.com/xability/maidr/commit/a6e726fff1a83785cfde54d1999d0a175297ebe2))
* **chat:** keep KaTeX's MathML through markdown sanitisation ([#675](https://github.com/xability/maidr/issues/675)) ([79bde6d](https://github.com/xability/maidr/commit/79bde6d2c6a920242720a0a73fb980bd0a3de3e3))
* **chat:** keep tables, headings and task lists through sanitisation ([#695](https://github.com/xability/maidr/issues/695)) ([f5e2596](https://github.com/xability/maidr/commit/f5e25969ead420741af8c9677d5e4ca0c3f9ae1f))
* **chat:** let a link's own text be its accessible name ([#700](https://github.com/xability/maidr/issues/700)) ([5ff73fe](https://github.com/xability/maidr/commit/5ff73fe812447d51e2639cf8ff864062ce31b6a9))
* **chat:** make footnote anchors in a chat response resolve ([#704](https://github.com/xability/maidr/issues/704)) ([21d92bc](https://github.com/xability/maidr/commit/21d92bc8399b6650a6f4b6d6233853451203ea05))
* **ui:** give each dialog exactly one title heading ([#666](https://github.com/xability/maidr/issues/666)) ([fa94af1](https://github.com/xability/maidr/commit/fa94af16b318d3bef60846b404a5c30668cafcb2))


### Performance Improvements

* **css:** ship only woff2 for inlined KaTeX fonts ([#668](https://github.com/xability/maidr/issues/668)) ([88ad49c](https://github.com/xability/maidr/commit/88ad49cfc30e45fed98d2338975c40e3f3f4a472))
* **css:** split KaTeX out of maidr.css and load it on demand ([#673](https://github.com/xability/maidr/issues/673)) ([d023724](https://github.com/xability/maidr/commit/d0237241a7f3422ada411ac29ee9f151fd14c1f9))

# [3.75.0](https://github.com/xability/maidr/compare/v3.74.0...v3.75.0) (2026-07-29)


### Bug Fixes

* accept SVG targets in the maidr:bindchart listener ([#653](https://github.com/xability/maidr/issues/653)) ([0c3d7c4](https://github.com/xability/maidr/commit/0c3d7c440fc1d547fe5e184d40aca1b4a0d18641))
* **settings:** close the settings dialog on escape ([#658](https://github.com/xability/maidr/issues/658)) ([16dc4be](https://github.com/xability/maidr/commit/16dc4be98fd9b2f6c8e0070701485cd8722fa060))
* **ui:** name the settings dialog with a rendered title ([#664](https://github.com/xability/maidr/issues/664)) ([6a96f8e](https://github.com/xability/maidr/commit/6a96f8ec44d497c67b8692f19083619e8c59b650))
* **ui:** scope dialog aria-hidden to the modal's own parent ([#659](https://github.com/xability/maidr/issues/659)) ([dbec93c](https://github.com/xability/maidr/commit/dbec93c46dbdb7fe9c249f5eec536b40030636d5))


### Features

* **settings:** report maidr.js version, bundle source and browser in the settings dialog ([#654](https://github.com/xability/maidr/issues/654)) ([ba40d07](https://github.com/xability/maidr/commit/ba40d0775c01dd0e9f24eeba054a71d14d4a2a04))

# [3.74.0](https://github.com/xability/maidr/compare/v3.73.0...v3.74.0) (2026-07-27)


### Bug Fixes

* address audiocontext suspension on menu tones ([#643](https://github.com/xability/maidr/issues/643)) ([f0ea94d](https://github.com/xability/maidr/commit/f0ea94dc3f3b5d25020081309f52e1de81286d0f))
* **audio:** defer empty-state tones behind AudioContext.resume() ([#645](https://github.com/xability/maidr/issues/645)) ([d8176e8](https://github.com/xability/maidr/commit/d8176e8afd516b952305fe584559f3403586c016))
* enable intersection rotor on date-axis multiline layers and speed up Go-To dialog navigation ([#646](https://github.com/xability/maidr/issues/646)) ([5259269](https://github.com/xability/maidr/commit/52592698d835355cd7f861587953be2796914d7e))
* name merged multi-series line layers in the Vega-Lite adapter ([#649](https://github.com/xability/maidr/issues/649)) ([38f0499](https://github.com/xability/maidr/commit/38f0499a6b0f7ee889b30a247d2707b184a89e22))


### Features

* **position:** announce the group name for multiline plots ([#647](https://github.com/xability/maidr/issues/647)) ([ca49158](https://github.com/xability/maidr/commit/ca49158b2d67789733df9576c511f1137f74c28b))

# [3.73.0](https://github.com/xability/maidr/compare/v3.72.1...v3.73.0) (2026-07-13)


### Bug Fixes

* **facet:** restore Y label in example and announce blank axis labels as unavailable ([#640](https://github.com/xability/maidr/issues/640)) ([ff3d508](https://github.com/xability/maidr/commit/ff3d50834d833d6e09d4bad06dc87e224d90f059))


### Features

* **candlestick:** rework delta layer with Ctrl+L toggle, OHLC nav, and directional sonification ([#635](https://github.com/xability/maidr/issues/635)) ([8618376](https://github.com/xability/maidr/commit/861837670c7f4addb56b5a327c7550334ec979e8))
* **description:** support 'd' shortcut at multi-panel figure level ([#638](https://github.com/xability/maidr/issues/638)) ([e35d0b3](https://github.com/xability/maidr/commit/e35d0b342f80967a3bd7e8463dd01372d03eb717))
* **go-to:** format search options, add Esc/Home/End, and open/close audio cues ([#637](https://github.com/xability/maidr/issues/637)) ([8da2ca2](https://github.com/xability/maidr/commit/8da2ca297df133956924f65ef679c4ebf6b78f63))
* improve consistent labels, figure-wide axes, and navigation cues at the multi-panel figure overview ([#639](https://github.com/xability/maidr/issues/639)) ([0904e97](https://github.com/xability/maidr/commit/0904e9715173cd99c38f44f44ff7ca231973293f))

## [3.72.1](https://github.com/xability/maidr/compare/v3.72.0...v3.72.1) (2026-07-06)


### Bug Fixes

* **text:** announce arrow navigation for single-panel plots ([#633](https://github.com/xability/maidr/issues/633)) ([233b98c](https://github.com/xability/maidr/commit/233b98c3d78cf519449d2a23cc4ffda804e9d607))
* **text:** restore edge boundary alert for single-panel navigation ([#634](https://github.com/xability/maidr/issues/634)) ([cceb384](https://github.com/xability/maidr/commit/cceb3845d3c7b011d16518c94792bac27f32f3d4))

# [3.72.0](https://github.com/xability/maidr/compare/v3.71.0...v3.72.0) (2026-07-06)


### Bug Fixes

* capture title from the json ([#616](https://github.com/xability/maidr/issues/616)) ([e347ddd](https://github.com/xability/maidr/commit/e347ddda5a47a2e03fb1ed47495cbbc319c06ec8))
* monitor only the focused layer and stop live-region chatter in live demo ([#622](https://github.com/xability/maidr/issues/622)) ([5a22453](https://github.com/xability/maidr/commit/5a22453a38e778a160dd5d822301c603f094bb0f))
* **rotor:** address orientation-independent candlestick compare + grid-mode re-announce ([#630](https://github.com/xability/maidr/issues/630) items 1–2) ([#631](https://github.com/xability/maidr/issues/631)) ([a112a9f](https://github.com/xability/maidr/commit/a112a9fc9df1b08bcbc33e00a82e5e4182dda2af))
* **rotor:** re-announce compare-mode boundary messages to screen readers ([#629](https://github.com/xability/maidr/issues/629)) ([d734ff4](https://github.com/xability/maidr/commit/d734ff49a45e14f1346f9e5e5fea3a4fffaae602))
* **rotor:** use single-announce rotor boundary messages ([#630](https://github.com/xability/maidr/issues/630) item 3) ([#632](https://github.com/xability/maidr/issues/632)) ([5ff131c](https://github.com/xability/maidr/commit/5ff131cebacf411868fe0f800715c624a260b4f9))


### Features

* **candlestick:** add bullish/bearish/neutral rotor navigation units ([#628](https://github.com/xability/maidr/issues/628)) ([28f0dfc](https://github.com/xability/maidr/commit/28f0dfc839799cd56ebed00b724a1e8ab3cd49f5))
* **candlestick:** add virtual reference-line delta layer with F7 dialog ([#627](https://github.com/xability/maidr/issues/627)) ([ffe0496](https://github.com/xability/maidr/commit/ffe04965c03886f4c3930a6b9624bb648c073c59))
* support multi-panel and faceted plots across all chart-library adapters ([#624](https://github.com/xability/maidr/issues/624)) ([984a7a4](https://github.com/xability/maidr/commit/984a7a4ea7679749525b9db764593f6992e6dfaa))

# [3.71.0](https://github.com/xability/maidr/compare/v3.70.0...v3.71.0) (2026-06-29)


### Features

* add auditory directional guidance towards svg element with mouse ([#587](https://github.com/xability/maidr/issues/587)) ([301109b](https://github.com/xability/maidr/commit/301109b8c2e44016cda2c47a12a7eb1daac182f7)), closes [#3](https://github.com/xability/maidr/issues/3) [#2](https://github.com/xability/maidr/issues/2) [#1](https://github.com/xability/maidr/issues/1) [#4](https://github.com/xability/maidr/issues/4) [#6](https://github.com/xability/maidr/issues/6) [#7](https://github.com/xability/maidr/issues/7)

# [3.70.0](https://github.com/xability/maidr/compare/v3.69.0...v3.70.0) (2026-06-15)


### Features

* add Ollama support and live model discovery to maidrAI ([#621](https://github.com/xability/maidr/issues/621)) ([498089c](https://github.com/xability/maidr/commit/498089cbcbd8d79bfc9c061ef2810b34d1317ff9))
* add realtime/streaming data support ([#620](https://github.com/xability/maidr/issues/620)) ([10424aa](https://github.com/xability/maidr/commit/10424aa2ff0966039392f4dc3888c139115e6316))

# [3.69.0](https://github.com/xability/maidr/compare/v3.68.0...v3.69.0) (2026-05-28)


### Features

* add amCharts 5 binder for MAIDR ([#544](https://github.com/xability/maidr/issues/544)) ([#560](https://github.com/xability/maidr/issues/560)) ([58294b7](https://github.com/xability/maidr/commit/58294b7d3aa7279d90a847925a3388596f4c320a))
* add AnyChart charting library adapter ([#545](https://github.com/xability/maidr/issues/545)) ([#557](https://github.com/xability/maidr/issues/557)) ([b9bf719](https://github.com/xability/maidr/commit/b9bf719083373407770a1aa75ad8c3c621300124))
* add Frappe Charts integration examples ([#546](https://github.com/xability/maidr/issues/546)) ([#559](https://github.com/xability/maidr/issues/559)) ([ed09586](https://github.com/xability/maidr/commit/ed095860c88f9f042a9b4e01d7d343ecd82ed3e9))
* add Highcharts charting library adapter ([#549](https://github.com/xability/maidr/issues/549)) ([cdb0cfb](https://github.com/xability/maidr/commit/cdb0cfb12650798020920e8ca3ceb25069ab2795)), closes [#539](https://github.com/xability/maidr/issues/539)
* add Victory charting library support ([#558](https://github.com/xability/maidr/issues/558)) ([52f3f91](https://github.com/xability/maidr/commit/52f3f9122b6d626452a300a31153dfdff941c008)), closes [#543](https://github.com/xability/maidr/issues/543)

# [3.68.0](https://github.com/xability/maidr/compare/v3.67.0...v3.68.0) (2026-05-25)


### Features

* add Chart.js charting library support ([#538](https://github.com/xability/maidr/issues/538)) ([#554](https://github.com/xability/maidr/issues/554)) ([eaefcfc](https://github.com/xability/maidr/commit/eaefcfc03424f6a23f07baf334c1790b02b11df6))

# [3.67.0](https://github.com/xability/maidr/compare/v3.66.1...v3.67.0) (2026-05-07)


### Features

* description modal with d key ([#592](https://github.com/xability/maidr/issues/592)) ([797ecce](https://github.com/xability/maidr/commit/797eccee61de3e6488c8fa48ebb4a36da5334423))
* let user select braille display model ([#608](https://github.com/xability/maidr/issues/608)) ([c2886bb](https://github.com/xability/maidr/commit/c2886bb46c6141a49b2cde1798c37b481dfd91ca))

## [3.66.1](https://github.com/xability/maidr/compare/v3.66.0...v3.66.1) (2026-05-04)


### Bug Fixes

* harden altair adapter pipeline across line, box, count, dodged plots ([#609](https://github.com/xability/maidr/issues/609)) ([14a08a4](https://github.com/xability/maidr/commit/14a08a408788a7e7ef3474079cbe392487c1c15f))

# [3.66.0](https://github.com/xability/maidr/compare/v3.65.0...v3.66.0) (2026-05-02)


### Bug Fixes

* honor custom z label in multiline plots and align l z with l x / l y semantics ([#607](https://github.com/xability/maidr/issues/607)) ([7741e85](https://github.com/xability/maidr/commit/7741e85347fbffa9ebdb7a2cd913ac66204c9a08))


### Features

* add intersecting point rotor mode for multiline plots ([#604](https://github.com/xability/maidr/issues/604)) ([b4f8257](https://github.com/xability/maidr/commit/b4f8257c45ac85aa0edd71d142142aa5c6716fdb)), closes [#2](https://github.com/xability/maidr/issues/2) [#3](https://github.com/xability/maidr/issues/3) [#4](https://github.com/xability/maidr/issues/4) [#1](https://github.com/xability/maidr/issues/1) [#1](https://github.com/xability/maidr/issues/1)
* add Vega-Lite adapter for accessible chart binding ([#540](https://github.com/xability/maidr/issues/540)) ([#556](https://github.com/xability/maidr/issues/556)) ([86ec308](https://github.com/xability/maidr/commit/86ec3085ca94b13225221326ff6769af171575ff))

# [3.65.0](https://github.com/xability/maidr/compare/v3.64.1...v3.65.0) (2026-04-28)


### Features

* add D3.js charting library support via maidr/d3 binder ([#551](https://github.com/xability/maidr/issues/551)) ([03f1dc6](https://github.com/xability/maidr/commit/03f1dc693b590ac9df6da19f868a677f19b5cffe)), closes [#537](https://github.com/xability/maidr/issues/537)

## [3.64.1](https://github.com/xability/maidr/compare/v3.64.0...v3.64.1) (2026-04-23)


### Bug Fixes

* refactor axes configuration ([#603](https://github.com/xability/maidr/issues/603)) ([e294a86](https://github.com/xability/maidr/commit/e294a86f540744885677c8d5b67949c61ee6c92a))

# [3.64.0](https://github.com/xability/maidr/compare/v3.63.1...v3.64.0) (2026-04-22)


### Features

* support simultaneous representation of multiple traces in multiline braille displays ([#599](https://github.com/xability/maidr/issues/599)) ([b0e6281](https://github.com/xability/maidr/commit/b0e6281c5caed16173baecddf7ff5cd94d69a6ac))

## [3.63.1](https://github.com/xability/maidr/compare/v3.63.0...v3.63.1) (2026-04-17)


### Bug Fixes

* change fill to z and fix minor regressions ([#602](https://github.com/xability/maidr/issues/602)) ([fa4b4ec](https://github.com/xability/maidr/commit/fa4b4ec520a2d6d5e141f674569bb333acf24e1b))

# [3.63.0](https://github.com/xability/maidr/compare/v3.62.0...v3.63.0) (2026-04-16)


### Features

* add Google Charts integration adapter ([#541](https://github.com/xability/maidr/issues/541)) ([#552](https://github.com/xability/maidr/issues/552)) ([d7357f8](https://github.com/xability/maidr/commit/d7357f8c56e137ec89927572a583114c3b0ba7e8))

# [3.62.0](https://github.com/xability/maidr/compare/v3.61.0...v3.62.0) (2026-04-13)


### Bug Fixes

* braille cursor issue and extra braille text at beginning in nvda eliminated ([#596](https://github.com/xability/maidr/issues/596)) ([5e0d998](https://github.com/xability/maidr/commit/5e0d9982e11bc55d436aee7de6bb2c6fca1febd1))


### Features

* enable automatic keybinding capture in help menu ([#597](https://github.com/xability/maidr/issues/597)) ([d207bc0](https://github.com/xability/maidr/commit/d207bc0de20b753498268c290e6ce8d9132bd8e0))

# [3.61.0](https://github.com/xability/maidr/compare/v3.60.1...v3.61.0) (2026-04-08)


### Features

* add Recharts adapter for accessible chart integration ([#555](https://github.com/xability/maidr/issues/555)) ([2d4e4e4](https://github.com/xability/maidr/commit/2d4e4e4286dc0cc1b10ba68b155f01d0408bd789)), closes [#542](https://github.com/xability/maidr/issues/542)

## [3.60.1](https://github.com/xability/maidr/compare/v3.60.0...v3.60.1) (2026-04-08)


### Bug Fixes

* improve scatter plot grid navigation ([#595](https://github.com/xability/maidr/issues/595)) ([615219c](https://github.com/xability/maidr/commit/615219cb148364060b9a607f23f25ac0ea5484a8))

# [3.60.0](https://github.com/xability/maidr/compare/v3.59.2...v3.60.0) (2026-04-08)


### Features

* plotly js adapter ([#591](https://github.com/xability/maidr/issues/591)) ([a3a49e3](https://github.com/xability/maidr/commit/a3a49e31b98d44ad53fd3ec3bea16b6fa93735bb))

## [3.59.2](https://github.com/xability/maidr/compare/v3.59.1...v3.59.2) (2026-04-07)


### Bug Fixes

* escape key works in braille mode for subplot exit ([#593](https://github.com/xability/maidr/issues/593)) ([e30144a](https://github.com/xability/maidr/commit/e30144a19ce020d9d6b0071b3fbfcb6b2554e344))

## [3.59.1](https://github.com/xability/maidr/compare/v3.59.0...v3.59.1) (2026-04-02)


### Bug Fixes

* fetch braille output length from settings ([#590](https://github.com/xability/maidr/issues/590)) ([b64fb4e](https://github.com/xability/maidr/commit/b64fb4ecd8f7724c18987d4586f3b478cf3e5401))

# [3.59.0](https://github.com/xability/maidr/compare/v3.58.3...v3.59.0) (2026-04-01)


### Features

* support grid based movement for scatterplots ([#570](https://github.com/xability/maidr/issues/570)) ([951166e](https://github.com/xability/maidr/commit/951166ede1ff4338df47015359b8cdae9c51df94))

## [3.58.3](https://github.com/xability/maidr/compare/v3.58.2...v3.58.3) (2026-03-26)


### Bug Fixes

* clarify scatterplot without line layer ([#589](https://github.com/xability/maidr/issues/589)) ([a70daf8](https://github.com/xability/maidr/commit/a70daf8818bdf4359403f0c5c3caa48881f36cf6))

## [3.58.2](https://github.com/xability/maidr/compare/v3.58.1...v3.58.2) (2026-03-16)


### Bug Fixes

* clarify point or slope intersection in multiline plot ([#582](https://github.com/xability/maidr/issues/582)) ([d1931ae](https://github.com/xability/maidr/commit/d1931ae82b5f88e61981e6b6943d7ca1d18f6b18))

## [3.58.1](https://github.com/xability/maidr/compare/v3.58.0...v3.58.1) (2026-03-13)


### Bug Fixes

* unify instruction text announcement ([#583](https://github.com/xability/maidr/issues/583)) ([76859e7](https://github.com/xability/maidr/commit/76859e748fe429ae5eb908c608c452c13b13bf18))

# [3.58.0](https://github.com/xability/maidr/compare/v3.57.0...v3.58.0) (2026-03-13)


### Features

* support plotly plots ([#577](https://github.com/xability/maidr/issues/577)) ([acd6f89](https://github.com/xability/maidr/commit/acd6f89bee204b03d5842a52e93651708e187aaa))

# [3.57.0](https://github.com/xability/maidr/compare/v3.56.0...v3.57.0) (2026-03-12)


### Features

* notify users of current position with p key ([7e0172a](https://github.com/xability/maidr/commit/7e0172a554d4f83d2d38ef7fcedb4cc2107e700d))

# [3.56.0](https://github.com/xability/maidr/compare/v3.55.2...v3.56.0) (2026-03-10)


### Features

* go to extrema in heatmap ([#569](https://github.com/xability/maidr/issues/569)) ([7946bdc](https://github.com/xability/maidr/commit/7946bdc5e63218388a13c42afa85f44914ac1ca4))

## [3.55.2](https://github.com/xability/maidr/compare/v3.55.1...v3.55.2) (2026-03-07)


### Bug Fixes

* support svg polygon element highlighting ([#568](https://github.com/xability/maidr/issues/568)) ([0098c1f](https://github.com/xability/maidr/commit/0098c1f9103f32020883afa6815c1282b94fabbd))

## [3.55.1](https://github.com/xability/maidr/compare/v3.55.0...v3.55.1) (2026-03-05)


### Bug Fixes

* address violin plot horizonatal orientation bug ([#567](https://github.com/xability/maidr/issues/567)) ([f9efcdc](https://github.com/xability/maidr/commit/f9efcdcd89b8d3a25df076e4133510251ccbfb12))

# [3.55.0](https://github.com/xability/maidr/compare/v3.54.0...v3.55.0) (2026-03-05)


### Features

* go to intersection ([#563](https://github.com/xability/maidr/issues/563)) ([fc19a99](https://github.com/xability/maidr/commit/fc19a994c51e891c46bf083f22c2bd6ec8446af6))

# [3.54.0](https://github.com/xability/maidr/compare/v3.53.0...v3.54.0) (2026-03-04)


### Features

* support matplotlib violin plot ([#510](https://github.com/xability/maidr/issues/510)) ([30b16c3](https://github.com/xability/maidr/commit/30b16c32e50acfb420651974fcbaa3de7b3507c6))

# [3.53.0](https://github.com/xability/maidr/compare/v3.52.0...v3.53.0) (2026-02-26)


### Bug Fixes

* address empty space SR announcement in react comps (JAWS & NVDA) ([#564](https://github.com/xability/maidr/issues/564)) ([d180d2e](https://github.com/xability/maidr/commit/d180d2edaa9e1a51c4e58dd8537ce47100b3af5e))


### Features

* address JAWS/NVDA not recognizing image assets ([#565](https://github.com/xability/maidr/issues/565)) ([c41495d](https://github.com/xability/maidr/commit/c41495dc19750f20c1b6d42c315d5b6272fafbee))

# [3.52.0](https://github.com/xability/maidr/compare/v3.51.1...v3.52.0) (2026-02-25)


### Features

* restore screen reader graphics navigation for interactive charts ([#561](https://github.com/xability/maidr/issues/561)) ([9e3a1e5](https://github.com/xability/maidr/commit/9e3a1e5f9cc094b9efd778a68d169bd475c86467))

## [3.51.1](https://github.com/xability/maidr/compare/v3.51.0...v3.51.1) (2026-02-25)


### Bug Fixes

* address scatter plot navigation ([#562](https://github.com/xability/maidr/issues/562)) ([3b12fa8](https://github.com/xability/maidr/commit/3b12fa822cc0c821a14b06e325b117ec67dfea88))

# [3.51.0](https://github.com/xability/maidr/compare/v3.50.1...v3.51.0) (2026-02-23)


### Features

* react component ([#532](https://github.com/xability/maidr/issues/532)) ([b5ce186](https://github.com/xability/maidr/commit/b5ce186aebb8ebc5b34f5585992c3ce7fedb5cdc))

## [3.50.1](https://github.com/xability/maidr/compare/v3.50.0...v3.50.1) (2026-02-19)


### Bug Fixes

* remove JAWS/NVDA special char announcement for spacebar ([#530](https://github.com/xability/maidr/issues/530)) ([6939df9](https://github.com/xability/maidr/commit/6939df90573e93a1b8859cfe7cc6897ef155a247))

# [3.50.0](https://github.com/xability/maidr/compare/v3.49.0...v3.50.0) (2026-02-17)


### Features

* fix terse mode label announcements ([#525](https://github.com/xability/maidr/issues/525)) ([c2c5c27](https://github.com/xability/maidr/commit/c2c5c27b59ca359fb5c34860ffba7c81daf7bcf7))

# [3.49.0](https://github.com/xability/maidr/compare/v3.48.1...v3.49.0) (2026-02-10)


### Features

* smooth stereo panning ([#518](https://github.com/xability/maidr/issues/518)) ([b464c87](https://github.com/xability/maidr/commit/b464c87aed31aafca1865d87c0d391f3efcd54db))

## [3.48.1](https://github.com/xability/maidr/compare/v3.48.0...v3.48.1) (2026-02-07)


### Bug Fixes

* resolve layer switching regression ([#519](https://github.com/xability/maidr/issues/519)) ([2433ce9](https://github.com/xability/maidr/commit/2433ce9134b8bd76d698c734e2c1e2ceaebcb2fc))

# [3.48.0](https://github.com/xability/maidr/compare/v3.47.0...v3.48.0) (2026-01-31)


### Features

* fix audio panning for line plots ([#516](https://github.com/xability/maidr/issues/516)) ([47d6122](https://github.com/xability/maidr/commit/47d61221655642ed0c42b8ed97ac9b38b46388d3))

# [3.47.0](https://github.com/xability/maidr/compare/v3.46.2...v3.47.0) (2026-01-30)


### Features

* support custom formatting ([#515](https://github.com/xability/maidr/issues/515)) ([52ee8bb](https://github.com/xability/maidr/commit/52ee8bb768269dc4c23196c9a9b1669e35e5722d))

## [3.46.2](https://github.com/xability/maidr/compare/v3.46.1...v3.46.2) (2026-01-28)


### Bug Fixes

* add back sine, square, sawtooth, triangle waveforms ([#514](https://github.com/xability/maidr/issues/514)) ([94f3db3](https://github.com/xability/maidr/commit/94f3db34e7a44ea94518a9d9417f1580db3a96d2))

## [3.46.1](https://github.com/xability/maidr/compare/v3.46.0...v3.46.1) (2026-01-28)


### Bug Fixes

* exit l scope when axis/figure metadata is present ([#513](https://github.com/xability/maidr/issues/513)) ([c19b2f5](https://github.com/xability/maidr/commit/c19b2f53daf7041fdf3668648de2b78a8a61455a))

# [3.46.0](https://github.com/xability/maidr/compare/v3.45.0...v3.46.0) (2026-01-27)


### Features

* fix label scope freeze wherever data is not available ([#512](https://github.com/xability/maidr/issues/512)) ([ddc3de9](https://github.com/xability/maidr/commit/ddc3de99f66e284ceef828fb59f626ff5e16ef4a))

# [3.45.0](https://github.com/xability/maidr/compare/v3.44.1...v3.45.0) (2026-01-19)


### Features

* support high contrast mode via C toggle key ([#406](https://github.com/xability/maidr/issues/406)) ([68c9bac](https://github.com/xability/maidr/commit/68c9bac2ce3c8704f1fe7864813fd4413e65b840))

## [3.44.1](https://github.com/xability/maidr/compare/v3.44.0...v3.44.1) (2026-01-11)


### Reverts

* Revert "feat: support matplotlib violin plot ([#492](https://github.com/xability/maidr/issues/492))" ([#509](https://github.com/xability/maidr/issues/509)) ([a4ce32c](https://github.com/xability/maidr/commit/a4ce32c4901c9c58b8a3d5704b14bb25558b8715))

# [3.44.0](https://github.com/xability/maidr/compare/v3.43.1...v3.44.0) (2026-01-11)


### Features

* support matplotlib violin plot ([#492](https://github.com/xability/maidr/issues/492)) ([e2c9435](https://github.com/xability/maidr/commit/e2c9435a5263bc974a9d6de7919129e5e782ac88))

## [3.43.1](https://github.com/xability/maidr/compare/v3.43.0...v3.43.1) (2025-12-24)


### Bug Fixes

* fix build error ([#507](https://github.com/xability/maidr/issues/507)) ([e8113c2](https://github.com/xability/maidr/commit/e8113c234e7db46c58bf4e3e27f1b22934609faf))

# [3.43.0](https://github.com/xability/maidr/compare/v3.42.4...v3.43.0) (2025-12-24)


### Features

* extend rotor text mode, sonification ([#506](https://github.com/xability/maidr/issues/506)) ([24d5bac](https://github.com/xability/maidr/commit/24d5bac79770f611f2138090cc7c2f1a63587933))

## [3.42.4](https://github.com/xability/maidr/compare/v3.42.3...v3.42.4) (2025-12-23)


### Bug Fixes

* release wf ([#504](https://github.com/xability/maidr/issues/504)) ([487b932](https://github.com/xability/maidr/commit/487b932d153ede20202bd5a82b2f6b9ddb213cc2))

## [3.42.3](https://github.com/xability/maidr/compare/v3.42.2...v3.42.3) (2025-12-23)


### Bug Fixes

* add plot listener ([#502](https://github.com/xability/maidr/issues/502)) ([861b826](https://github.com/xability/maidr/commit/861b8260dc5fcdd915a9c03aeedca6aba249aadd))

## [3.42.2](https://github.com/xability/maidr/compare/v3.42.1...v3.42.2) (2025-12-19)


### Bug Fixes

* add env config, artifact for logs ([#500](https://github.com/xability/maidr/issues/500)) ([b6e5106](https://github.com/xability/maidr/commit/b6e5106ee532d278a8a0868eeaf34a04dd681367))

## [3.42.1](https://github.com/xability/maidr/compare/v3.42.0...v3.42.1) (2025-12-19)


### Bug Fixes

* remove cache ([#499](https://github.com/xability/maidr/issues/499)) ([a92f7d6](https://github.com/xability/maidr/commit/a92f7d6da3d8cdeffb5002b56087bc5c76bdca25))
* remove npm config from interfering ([#498](https://github.com/xability/maidr/issues/498)) ([8966902](https://github.com/xability/maidr/commit/8966902dbfaae833fb02f221fca6b6115a8ef20f))

# [3.42.0](https://github.com/xability/maidr/compare/v3.41.0...v3.42.0) (2025-12-19)


### Features

* add provenance flag to npm publish command ([#497](https://github.com/xability/maidr/issues/497)) ([d68ff62](https://github.com/xability/maidr/commit/d68ff62a4fb7580095fc1df06e4718a0fdffcb9f))

# [3.41.0](https://github.com/xability/maidr/compare/v3.40.0...v3.41.0) (2025-12-19)


### Features

* test release on PR merge ([#496](https://github.com/xability/maidr/issues/496)) ([823f072](https://github.com/xability/maidr/commit/823f072b6616cbc3e7ba3e1387de95dfe7d6d48b))

# [3.40.0](https://github.com/xability/maidr/compare/v3.39.0...v3.40.0) (2025-12-19)


### Bug Fixes

* test release workflow ([#493](https://github.com/xability/maidr/issues/493)) ([ad9a64d](https://github.com/xability/maidr/commit/ad9a64d56b457da60d8ed4073436175b018c626e))


### Features

* change release yml for trusted publishing ([#494](https://github.com/xability/maidr/issues/494)) ([c1d6955](https://github.com/xability/maidr/commit/c1d6955e3411f6ecf5bac93ae0b251bc90d4983a))
* fix smooth plot naming conventions ([#488](https://github.com/xability/maidr/issues/488)) ([cd48595](https://github.com/xability/maidr/commit/cd48595efeb84b37bedf025d9337ab4196481ad5))
* integrate claude code ([#484](https://github.com/xability/maidr/issues/484)) ([#485](https://github.com/xability/maidr/issues/485)) ([490b87c](https://github.com/xability/maidr/commit/490b87c49ce7e195a9a38a7721c88f01fd1cd3bb))
* push release ([#490](https://github.com/xability/maidr/issues/490)) ([a027250](https://github.com/xability/maidr/commit/a0272505306e1858b579aa7ed147fe0675eda319))

# [3.39.0](https://github.com/xability/maidr/compare/v3.38.1...v3.39.0) (2025-12-09)


### Features

* support violin plot ([#477](https://github.com/xability/maidr/issues/477)) ([d68343f](https://github.com/xability/maidr/commit/d68343f0ca370adc05e74d420cc43897a8ca9a0b))

## [3.38.1](https://github.com/xability/maidr/compare/v3.38.0...v3.38.1) (2025-12-02)


### Bug Fixes

* removing version, semantic release to release new version tag ([#482](https://github.com/xability/maidr/issues/482)) ([dc2bf34](https://github.com/xability/maidr/commit/dc2bf3443bd4e5fa3069f5013669cb96bcdf36d4))

# [3.38.0](https://github.com/xability/maidr/compare/v3.37.0...v3.38.0) (2025-12-02)


### Features

* braille architecture chnage ([#481](https://github.com/xability/maidr/issues/481)) ([60c2c18](https://github.com/xability/maidr/commit/60c2c1867c7e970eccd338fb268d2753a2723cf1))

# [3.38.0](https://github.com/xability/maidr/compare/v3.37.0...v3.38.0) (2025-12-02)


### Features

* braille architecture chnage ([#481](https://github.com/xability/maidr/issues/481)) ([60c2c18](https://github.com/xability/maidr/commit/60c2c1867c7e970eccd338fb268d2753a2723cf1))

# [3.38.0](https://github.com/xability/maidr/compare/v3.37.0...v3.38.0) (2025-12-02)


### Features

* braille architecture chnage ([#481](https://github.com/xability/maidr/issues/481)) ([60c2c18](https://github.com/xability/maidr/commit/60c2c1867c7e970eccd338fb268d2753a2723cf1))

# [3.37.0](https://github.com/xability/maidr/compare/v3.36.3...v3.37.0) (2025-11-13)


### Features

* add onHover settings for scatterplots ([#446](https://github.com/xability/maidr/issues/446)) ([ba27f08](https://github.com/xability/maidr/commit/ba27f087ffc1e509c550d08c4d3c0a7b61a9030a)), closes [#453](https://github.com/xability/maidr/issues/453) [#454](https://github.com/xability/maidr/issues/454) [#447](https://github.com/xability/maidr/issues/447)

## [3.36.3](https://github.com/xability/maidr/compare/v3.36.2...v3.36.3) (2025-11-11)


### Bug Fixes

* address smooth plot braille not functional ([#468](https://github.com/xability/maidr/issues/468)) ([7c79cc1](https://github.com/xability/maidr/commit/7c79cc1429b2d132a9c433499809118e2171e05a))

## [3.36.2](https://github.com/xability/maidr/compare/v3.36.1...v3.36.2) (2025-11-04)


### Bug Fixes

* address selector failures in boxplot ([#465](https://github.com/xability/maidr/issues/465)) ([76ef8d3](https://github.com/xability/maidr/commit/76ef8d33f99b885fb360f3a17e2736cc991fdd57))

## [3.36.1](https://github.com/xability/maidr/compare/v3.36.0...v3.36.1) (2025-11-02)


### Bug Fixes

* address boxplot label misalignment ([#464](https://github.com/xability/maidr/issues/464)) ([6ec7db7](https://github.com/xability/maidr/commit/6ec7db715e84da6dc64f3c20010dedb2204db593))

# [3.36.0](https://github.com/xability/maidr/compare/v3.35.0...v3.36.0) (2025-10-31)


### Features

* support custom dom ordering ([#461](https://github.com/xability/maidr/issues/461)) ([ddf3bf4](https://github.com/xability/maidr/commit/ddf3bf43d42140c60abfb925ea70a6a881ba8f68))

# [3.35.0](https://github.com/xability/maidr/compare/v3.34.0...v3.35.0) (2025-10-30)


### Features

* support for both maidr-data & maidr payload within svg ([#460](https://github.com/xability/maidr/issues/460)) ([8611c69](https://github.com/xability/maidr/commit/8611c6983eff11ca6f1b910235460b866f6345bb))

# [3.34.0](https://github.com/xability/maidr/compare/v3.33.0...v3.34.0) (2025-10-27)


### Features

* support rotor-based navigation via alt+shift+arrowup or arrowdown ([#429](https://github.com/xability/maidr/issues/429)) ([3ff61ec](https://github.com/xability/maidr/commit/3ff61ecaee55744390d1174245b68be0908371c2)), closes [#432](https://github.com/xability/maidr/issues/432) [#433](https://github.com/xability/maidr/issues/433) [#437](https://github.com/xability/maidr/issues/437) [#436](https://github.com/xability/maidr/issues/436)
* trigger release for rotor fature ([#457](https://github.com/xability/maidr/issues/457)) ([bd6e5ff](https://github.com/xability/maidr/commit/bd6e5ff33006d882b6904f6b1115f2f7083abee7))

# [3.33.0](https://github.com/xability/maidr/compare/v3.32.0...v3.33.0) (2025-10-23)


### Features

* starting position is always lower left ([#455](https://github.com/xability/maidr/issues/455)) ([96c3a75](https://github.com/xability/maidr/commit/96c3a75fecafbbc76eab73c63a0b65c05bd3d7dd))

# [3.32.0](https://github.com/xability/maidr/compare/v3.31.0...v3.32.0) (2025-10-15)


### Features

* support reverse dom ordering for dodged/stacked plots ([#453](https://github.com/xability/maidr/issues/453)) ([f61e7e0](https://github.com/xability/maidr/commit/f61e7e0a9d9c64808d043b3f98b81f262c554365))

# [3.31.0](https://github.com/xability/maidr/compare/v3.30.1...v3.31.0) (2025-10-10)


### Bug Fixes

* address issue where esc doesn't work after toggling to label scope ([#444](https://github.com/xability/maidr/issues/444)) ([b54cd4b](https://github.com/xability/maidr/commit/b54cd4b9ddb3fc8db025bb5940fd9802cbdbced3))


### Features

* support outlier visual highlight in boxplots ([#450](https://github.com/xability/maidr/issues/450)) ([979a390](https://github.com/xability/maidr/commit/979a3905ed3ef5af5fd7c137842837d9309d5ff5))

## [3.30.1](https://github.com/xability/maidr/compare/v3.30.0...v3.30.1) (2025-09-22)


### Bug Fixes

* addressed an issue where the LLM response hangs on chart descriptions regardless of the user prompt ([#443](https://github.com/xability/maidr/issues/443)) ([faf63fe](https://github.com/xability/maidr/commit/faf63feda47294d6f830409c5ea526629a291e43))

# [3.30.0](https://github.com/xability/maidr/compare/v3.29.0...v3.30.0) (2025-09-18)


### Features

* remove boxplot hover functionality ([#442](https://github.com/xability/maidr/issues/442)) ([d28f54d](https://github.com/xability/maidr/commit/d28f54da14aa35849fbe516c0b70f992abca36a1))
* retain boxplot labels case ([#441](https://github.com/xability/maidr/issues/441)) ([6a94a5d](https://github.com/xability/maidr/commit/6a94a5dd62277916310ceaaa240df2233359911d))

# [3.29.0](https://github.com/xability/maidr/compare/v3.28.0...v3.29.0) (2025-09-18)


### Features

* revert onhover ([#440](https://github.com/xability/maidr/issues/440)) ([9e45d5e](https://github.com/xability/maidr/commit/9e45d5e9143eaafa1f98569796ff832e044cd174))

# [3.28.0](https://github.com/xability/maidr/compare/v3.27.1...v3.28.0) (2025-09-17)


### Features

* support mouse hover visual highlight ([#436](https://github.com/xability/maidr/issues/436)) ([621b5fe](https://github.com/xability/maidr/commit/621b5fed13d2e4881529d1fe49207e782b6d7780))

## [3.27.1](https://github.com/xability/maidr/compare/v3.27.0...v3.27.1) (2025-09-15)


### Bug Fixes

* address pending welcome message in chat and auto scroll ([#437](https://github.com/xability/maidr/issues/437)) ([609eefb](https://github.com/xability/maidr/commit/609eefb3333f6513d22b27c10c2091f41c584cb0))

# [3.27.0](https://github.com/xability/maidr/compare/v3.26.1...v3.27.0) (2025-09-12)


### Features

* fix subplot nav announcements & cleanup junk in chat component ([#433](https://github.com/xability/maidr/issues/433)) ([97b88f2](https://github.com/xability/maidr/commit/97b88f24f9bb03bb90b4acc3a12e51f75f97bcd7))

## [3.26.1](https://github.com/xability/maidr/compare/v3.26.0...v3.26.1) (2025-09-08)


### Bug Fixes

* address multi-panel plot navigation ([#432](https://github.com/xability/maidr/issues/432)) ([4d5bab9](https://github.com/xability/maidr/commit/4d5bab9a80ebcf66ca587fde7507e39e98d2b730))

# [3.26.0](https://github.com/xability/maidr/compare/v3.25.0...v3.26.0) (2025-09-04)


### Features

* go to extrema/ Specific point for Line plots via g key ([#426](https://github.com/xability/maidr/issues/426)) ([2ff729c](https://github.com/xability/maidr/commit/2ff729c73428fc74d3c1804af819e6aac171e20d))

# [3.25.0](https://github.com/xability/maidr/compare/v3.24.0...v3.25.0) (2025-09-03)


### Features

* add command palette ([#354](https://github.com/xability/maidr/issues/354)) ([0445e24](https://github.com/xability/maidr/commit/0445e248669400a421f87f96d1b3eef4dfc5bb7a))

# [3.24.0](https://github.com/xability/maidr/compare/v3.23.3...v3.24.0) (2025-09-02)


### Features

* go to specific value in candlestick plots ([#427](https://github.com/xability/maidr/issues/427)) ([b1d1191](https://github.com/xability/maidr/commit/b1d11914ee576285db9a6d8d72fc543bdfcdc6bb)), closes [#428](https://github.com/xability/maidr/issues/428)

## [3.23.3](https://github.com/xability/maidr/compare/v3.23.2...v3.23.3) (2025-08-20)


### Bug Fixes

* address nav bug after title diplay ([#424](https://github.com/xability/maidr/issues/424)) ([f309eff](https://github.com/xability/maidr/commit/f309effe588fd34360851a1f414b7298e80bb632))

## [3.23.2](https://github.com/xability/maidr/compare/v3.23.1...v3.23.2) (2025-08-20)


### Bug Fixes

* address boundary spatial audio bug ([#423](https://github.com/xability/maidr/issues/423)) ([7a97d0b](https://github.com/xability/maidr/commit/7a97d0b2f2488af54db119501153fa632aaf4e0a))

## [3.23.1](https://github.com/xability/maidr/compare/v3.23.0...v3.23.1) (2025-08-19)


### Bug Fixes

* address boundary spatial audio bug ([#422](https://github.com/xability/maidr/issues/422)) ([008bf22](https://github.com/xability/maidr/commit/008bf2245f1faf271a0f167d451b5187f6b65b92))

# [3.23.0](https://github.com/xability/maidr/compare/v3.22.1...v3.23.0) (2025-08-19)


### Features

* go-to navigation for candlestick plots ([#418](https://github.com/xability/maidr/issues/418)) ([91a00ff](https://github.com/xability/maidr/commit/91a00ffdd3cce385eb57feba9a6cde393803d6a9))

## [3.22.1](https://github.com/xability/maidr/compare/v3.22.0...v3.22.1) (2025-08-15)


### Bug Fixes

* address screen reader announcement freeze ([#416](https://github.com/xability/maidr/issues/416)) ([caa6229](https://github.com/xability/maidr/commit/caa62290d34e0215913d34363227aacfba73c7cf))

# [3.22.0](https://github.com/xability/maidr/compare/v3.21.1...v3.22.0) (2025-08-12)


### Features

* announce group count in multiline plot instructions with edge case handling ([#409](https://github.com/xability/maidr/issues/409)) ([84db540](https://github.com/xability/maidr/commit/84db54020525941468bcb4baa0545e660cf983d9))

## [3.21.1](https://github.com/xability/maidr/compare/v3.21.0...v3.21.1) (2025-08-12)


### Bug Fixes

* **display:** reset focus on teardown to prevent missing braille view ([#410](https://github.com/xability/maidr/issues/410)) ([c1d6a94](https://github.com/xability/maidr/commit/c1d6a94624d4c27c2a969e9b7de3e052dcfbe72a))

# [3.21.0](https://github.com/xability/maidr/compare/v3.20.4...v3.21.0) (2025-08-11)


### Features

* **candlestick:** support visual highlight per segment ([#407](https://github.com/xability/maidr/issues/407)) ([3423669](https://github.com/xability/maidr/commit/3423669016dfccecae32637b0915ab0b17c9e360))

## [3.20.4](https://github.com/xability/maidr/compare/v3.20.3...v3.20.4) (2025-08-01)


### Bug Fixes

* adress audio service error in safari ([#404](https://github.com/xability/maidr/issues/404)) ([4642af3](https://github.com/xability/maidr/commit/4642af3e554f75e9c1f53d25227671c47af0d255))

## [3.20.3](https://github.com/xability/maidr/compare/v3.20.2...v3.20.3) (2025-07-29)


### Bug Fixes

* correct candlestick text formatting issues in terse and verbose modes ([#400](https://github.com/xability/maidr/issues/400)) ([9198858](https://github.com/xability/maidr/commit/919885801352f0c0d2c6d01a38cc5a9b10d83d78))

## [3.20.2](https://github.com/xability/maidr/compare/v3.20.1...v3.20.2) (2025-07-24)


### Bug Fixes

* correct react tooltip ([#398](https://github.com/xability/maidr/issues/398)) ([1a1404f](https://github.com/xability/maidr/commit/1a1404fea099a528e166e19ac1223b534d05b891))

## [3.20.1](https://github.com/xability/maidr/compare/v3.20.0...v3.20.1) (2025-07-24)


### Bug Fixes

* reset trace state in multi-panel plots and refactor layer switch ([#403](https://github.com/xability/maidr/issues/403)) ([69d1f2f](https://github.com/xability/maidr/commit/69d1f2f98aaa32a32c722986a187a40a2d88f8dc))

# [3.20.0](https://github.com/xability/maidr/compare/v3.19.0...v3.20.0) (2025-07-23)


### Features

* add volatility to candlestick plot ([#397](https://github.com/xability/maidr/issues/397)) ([ce0facf](https://github.com/xability/maidr/commit/ce0facfa622e4560421e0504f6c1c4993872ac96))

# [3.19.0](https://github.com/xability/maidr/compare/v3.18.4...v3.19.0) (2025-07-23)


### Features

* add boundary for layer navigation ([#393](https://github.com/xability/maidr/issues/393)) ([3d36d32](https://github.com/xability/maidr/commit/3d36d32fe8ef0e4e3f5b31282575eba2704ff4b6))

## [3.18.4](https://github.com/xability/maidr/compare/v3.18.3...v3.18.4) (2025-07-23)


### Bug Fixes

* address layer switch logic and reset tracestate on subplot entry ([#396](https://github.com/xability/maidr/issues/396)) ([04b08b9](https://github.com/xability/maidr/commit/04b08b92a9dce480366f81e83bff50af00f20b52))

## [3.18.3](https://github.com/xability/maidr/compare/v3.18.2...v3.18.3) (2025-07-16)


### Bug Fixes

* address subplot announcement message ([#392](https://github.com/xability/maidr/issues/392)) ([03976fe](https://github.com/xability/maidr/commit/03976fe02e49904a0d6dddeb3f181a520fad6162))

## [3.18.2](https://github.com/xability/maidr/compare/v3.18.1...v3.18.2) (2025-07-15)


### Bug Fixes

* address anouncements for single line plots ([#390](https://github.com/xability/maidr/issues/390)) ([0bc8366](https://github.com/xability/maidr/commit/0bc83665b3bead1070cd46d0cef85baef3f54412))

## [3.18.1](https://github.com/xability/maidr/compare/v3.18.0...v3.18.1) (2025-07-11)


### Bug Fixes

* add values to layer announcement ([#388](https://github.com/xability/maidr/issues/388)) ([6f97792](https://github.com/xability/maidr/commit/6f9779214e25cb139ec96c55f4996859c48bc1f8))

# [3.18.0](https://github.com/xability/maidr/compare/v3.17.10...v3.18.0) (2025-07-11)


### Features

* support intersection points in multiline plots ([#387](https://github.com/xability/maidr/issues/387)) ([905b3ea](https://github.com/xability/maidr/commit/905b3ea101acaf0229e8e048840254e0552de58b))

## [3.17.10](https://github.com/xability/maidr/compare/v3.17.9...v3.17.10) (2025-07-01)


### Bug Fixes

* address layer switch by finding exact/nearest x-value ([#384](https://github.com/xability/maidr/issues/384)) ([ba85db5](https://github.com/xability/maidr/commit/ba85db5e30fb1f1848ab1fffd39e55f8d86680fc))

## [3.17.9](https://github.com/xability/maidr/compare/v3.17.8...v3.17.9) (2025-07-01)


### Bug Fixes

* improve accessibility support in settings menu ([#347](https://github.com/xability/maidr/issues/347)) ([53c4238](https://github.com/xability/maidr/commit/53c4238644c7756222b686deed2ace1fb14f14bd))

## [3.17.8](https://github.com/xability/maidr/compare/v3.17.7...v3.17.8) (2025-07-01)


### Bug Fixes

* remove unnecessary sonification models from stacked bar plot ([#383](https://github.com/xability/maidr/issues/383)) ([72d2b5f](https://github.com/xability/maidr/commit/72d2b5f7217495ee9309ec41e14e0670f04a8789))

## [3.17.7](https://github.com/xability/maidr/compare/v3.17.6...v3.17.7) (2025-06-30)


### Bug Fixes

* add missing navigation constants file ([#382](https://github.com/xability/maidr/issues/382)) ([f42ad66](https://github.com/xability/maidr/commit/f42ad66a806b2955bd221c2295b8fc9a9471bff8))
* address inconsistent x-values during inter-layer navigation ([#380](https://github.com/xability/maidr/issues/380)) ([8a3c6ba](https://github.com/xability/maidr/commit/8a3c6baa01191c6918f662cb960b3eeaae432f48))

## [3.17.6](https://github.com/xability/maidr/compare/v3.17.5...v3.17.6) (2025-06-27)


### Bug Fixes

* revert specialized logic for linetrace ([#374](https://github.com/xability/maidr/issues/374)) ([12914c6](https://github.com/xability/maidr/commit/12914c6b64c28386447ecc3d7277b61109a0788c))

## [3.17.5](https://github.com/xability/maidr/compare/v3.17.4...v3.17.5) (2025-06-26)


### Bug Fixes

* address y labels in candlestick plots ([#371](https://github.com/xability/maidr/issues/371)) ([d636e86](https://github.com/xability/maidr/commit/d636e86c7ef2c21c15fcd9052967e4a87d94b7b3))

## [3.17.4](https://github.com/xability/maidr/compare/v3.17.3...v3.17.4) (2025-06-26)


### Bug Fixes

* support multi-line axis label & titles ([#370](https://github.com/xability/maidr/issues/370)) ([f69dce5](https://github.com/xability/maidr/commit/f69dce5084b654d525243b687551906b17b7f938))

## [3.17.3](https://github.com/xability/maidr/compare/v3.17.2...v3.17.3) (2025-06-26)


### Bug Fixes

* update welcome message and rename LLM agents ([#323](https://github.com/xability/maidr/issues/323)) ([a0c83d8](https://github.com/xability/maidr/commit/a0c83d81be53cfc35f3c459e53de48d080fc6175))

## [3.17.2](https://github.com/xability/maidr/compare/v3.17.1...v3.17.2) (2025-06-26)


### Bug Fixes

* address empty labels in candlestick plots ([#369](https://github.com/xability/maidr/issues/369)) ([79245dd](https://github.com/xability/maidr/commit/79245ddc98ffe86aa680771e12ec35edace207b7))

## [3.17.1](https://github.com/xability/maidr/compare/v3.17.0...v3.17.1) (2025-06-25)


### Bug Fixes

* address scatter plot navigation ([#368](https://github.com/xability/maidr/issues/368)) ([3551146](https://github.com/xability/maidr/commit/35511466d329d39a3bc192a008818330d5c2ce8d))

# [3.17.0](https://github.com/xability/maidr/compare/v3.16.0...v3.17.0) (2025-06-25)


### Features

* integrate custom prompting and provide suggested questions for active chat ([#326](https://github.com/xability/maidr/issues/326)) ([f6a342d](https://github.com/xability/maidr/commit/f6a342d4d6e2008f169fd513597e3f6e290405b2))

# [3.16.0](https://github.com/xability/maidr/compare/v3.15.2...v3.16.0) (2025-06-21)


### Bug Fixes

* address navigation in unequally sized multiline plots ([#364](https://github.com/xability/maidr/issues/364)) ([515e92d](https://github.com/xability/maidr/commit/515e92d687a3935035a3177188bbe15d16aa6d39))
* **candlestick:** use distinctive bear tone ([#362](https://github.com/xability/maidr/issues/362)) ([3e42082](https://github.com/xability/maidr/commit/3e420823b2bb7925f5419b1bba768b65c432bb66))


### Features

* **candlestick:** add braille dot8 indicator for bear state ([#349](https://github.com/xability/maidr/issues/349)) ([e6e0bf8](https://github.com/xability/maidr/commit/e6e0bf8a2c4a30c3946247548a125947f92f37ac))
* utilize user-defined color for highlighting ([#345](https://github.com/xability/maidr/issues/345)) ([49f2c97](https://github.com/xability/maidr/commit/49f2c9734f1a9fc32934074a69a3b4f321c5eeae))

## [3.15.2](https://github.com/xability/maidr/compare/v3.15.1...v3.15.2) (2025-06-19)


### Bug Fixes

* address 2D layout plot highlight ([#360](https://github.com/xability/maidr/issues/360)) ([8fd89e7](https://github.com/xability/maidr/commit/8fd89e7b746ed7458ec049ad7262a7a764da07ae))

## [3.15.1](https://github.com/xability/maidr/compare/v3.15.0...v3.15.1) (2025-06-19)


### Reverts

* Revert "fix: use distinctive bear tone ([#350](https://github.com/xability/maidr/issues/350))" ([#359](https://github.com/xability/maidr/issues/359)) ([18016a2](https://github.com/xability/maidr/commit/18016a2fee9b887c1b886c47d5bdcc825f57b294))

# [3.15.0](https://github.com/xability/maidr/compare/v3.14.1...v3.15.0) (2025-06-19)


### Features

* support multi-panel plot highlight ([#357](https://github.com/xability/maidr/issues/357)) ([0b94828](https://github.com/xability/maidr/commit/0b948284bb6fd06628fcd9d1824b4add35df1a0b))

## [3.14.1](https://github.com/xability/maidr/compare/v3.14.0...v3.14.1) (2025-06-19)


### Bug Fixes

* use distinctive bear tone ([#350](https://github.com/xability/maidr/issues/350)) ([120274b](https://github.com/xability/maidr/commit/120274b438c1866fbd86fc5cbb63e5ea28be4633))

# [3.14.0](https://github.com/xability/maidr/compare/v3.13.0...v3.14.0) (2025-06-14)


### Features

* support highlight on candlestick ([#343](https://github.com/xability/maidr/issues/343)) ([e17497b](https://github.com/xability/maidr/commit/e17497ba5846e5c8860fe3c163cd2c8524e99e8a))

# [3.13.0](https://github.com/xability/maidr/compare/v3.12.6...v3.13.0) (2025-06-14)


### Features

* add fallback svg highlight for smooth line trace ([#336](https://github.com/xability/maidr/issues/336)) ([9b18427](https://github.com/xability/maidr/commit/9b18427c25aaa3e27ed25eb1ea21353f32da28eb))
* store aria-live config in state and fix chat  ([#338](https://github.com/xability/maidr/issues/338)) ([3eadad3](https://github.com/xability/maidr/commit/3eadad358929952dc3c940de8f33819d1a511b26))

## [3.12.6](https://github.com/xability/maidr/compare/v3.12.5...v3.12.6) (2025-06-14)


### Bug Fixes

* organize tooltip styling ([#337](https://github.com/xability/maidr/issues/337)) ([d7beaa7](https://github.com/xability/maidr/commit/d7beaa7bfc272db4ddf78c7289fbe44ef45b65db))

## [3.12.5](https://github.com/xability/maidr/compare/v3.12.4...v3.12.5) (2025-06-11)


### Bug Fixes

* revert hotkeys to 3.13.10 ([#331](https://github.com/xability/maidr/issues/331)) ([be10503](https://github.com/xability/maidr/commit/be105039aaab953e03bb987d2d733a0563a62d38))

## [3.12.4](https://github.com/xability/maidr/compare/v3.12.3...v3.12.4) (2025-06-11)


### Bug Fixes

* remove warning suppression in vite config ([#330](https://github.com/xability/maidr/issues/330)) ([da5f280](https://github.com/xability/maidr/commit/da5f280fcd45f02b97ec751e342e862f21d926b7))

## [3.12.3](https://github.com/xability/maidr/compare/v3.12.2...v3.12.3) (2025-06-11)


### Bug Fixes

* restore css ([#329](https://github.com/xability/maidr/issues/329)) ([4c90168](https://github.com/xability/maidr/commit/4c90168c4b009bd3971d31f0dc79e784c1f8ffdc))

## [3.12.2](https://github.com/xability/maidr/compare/v3.12.1...v3.12.2) (2025-06-11)


### Bug Fixes

* remove redundant tooltip styles ([#328](https://github.com/xability/maidr/issues/328)) ([859f371](https://github.com/xability/maidr/commit/859f3715ad8a752606542851855b2d4a8ca2f465))

## [3.11.4](https://github.com/xability/maidr/compare/v3.11.3...v3.11.4) (2025-06-08)


### Bug Fixes

* adapt highlight color for heatmap cell based on cell color ([#318](https://github.com/xability/maidr/issues/318)) ([f285b64](https://github.com/xability/maidr/commit/f285b64711ff5a46d2126a3cd2562e971c962ede))

## [3.11.3](https://github.com/xability/maidr/compare/v3.11.2...v3.11.3) (2025-06-07)


### Bug Fixes

* address visual highlighting on multi lineplot ([#317](https://github.com/xability/maidr/issues/317)) ([feb3dc4](https://github.com/xability/maidr/commit/feb3dc4fb61b7b8c1f52f2c972e4f26bf59633ff))

## [3.11.2](https://github.com/xability/maidr/compare/v3.11.1...v3.11.2) (2025-06-06)


### Bug Fixes

* implement observer on settings for audio and autoplay services ([#313](https://github.com/xability/maidr/issues/313)) ([c0a952a](https://github.com/xability/maidr/commit/c0a952af8aa600d9ce40f8ff1d37ab9345b728d1))

## [3.11.1](https://github.com/xability/maidr/compare/v3.11.0...v3.11.1) (2025-06-06)


### Bug Fixes

* integrate min and max frequency into settings flow ([#310](https://github.com/xability/maidr/issues/310)) ([f903d5c](https://github.com/xability/maidr/commit/f903d5cbb9c9535624020350895514544ab21062))

# [3.11.0](https://github.com/xability/maidr/compare/v3.10.2...v3.11.0) (2025-06-04)


### Features

* support sonification differences between bull and bear states in candlestick charts ([#288](https://github.com/xability/maidr/issues/288)) ([053910e](https://github.com/xability/maidr/commit/053910eaad6d811fc6e45167de3c5188f5fcfa73))

## [3.10.2](https://github.com/xability/maidr/compare/v3.10.1...v3.10.2) (2025-06-03)


### Bug Fixes

* correct panning for multiple tones like in boxplot and smooth ([#295](https://github.com/xability/maidr/issues/295)) ([9d2d7e6](https://github.com/xability/maidr/commit/9d2d7e6a58dac6672148df16fc7980958304175b))

## [3.10.1](https://github.com/xability/maidr/compare/v3.10.0...v3.10.1) (2025-06-03)


### Bug Fixes

* validate llm agent api key ([#287](https://github.com/xability/maidr/issues/287)) ([ddf12d0](https://github.com/xability/maidr/commit/ddf12d07030debbaf528ec7c7f1f7e351eebac13))

# [3.10.0](https://github.com/xability/maidr/compare/v3.9.2...v3.10.0) (2025-06-03)


### Features

* made boundary audio spatial ([#306](https://github.com/xability/maidr/issues/306)) ([93e7744](https://github.com/xability/maidr/commit/93e774498931b86bc8e19a2021add373387af6c1))

## [3.9.2](https://github.com/xability/maidr/compare/v3.9.1...v3.9.2) (2025-06-02)


### Bug Fixes

* integrate prompt level into chat flow ([#297](https://github.com/xability/maidr/issues/297)) ([6a1f126](https://github.com/xability/maidr/commit/6a1f12688345c859cc72e774ce6e93779719a967))

## [3.9.1](https://github.com/xability/maidr/compare/v3.9.0...v3.9.1) (2025-06-01)


### Bug Fixes

* integrate volume toggle with audioservice ([#299](https://github.com/xability/maidr/issues/299)) ([d8f27fd](https://github.com/xability/maidr/commit/d8f27fde9717640e8ff5fc40239500b30f212f14))

# [3.9.0](https://github.com/xability/maidr/compare/v3.8.0...v3.9.0) (2025-05-30)


### Features

* enable markdown rendering for LLM agent messages ([#257](https://github.com/xability/maidr/issues/257)) ([48f2081](https://github.com/xability/maidr/commit/48f2081175ad82157c288f98de085315decd1ac4))

# [3.8.0](https://github.com/xability/maidr/compare/v3.7.1...v3.8.0) (2025-05-29)


### Features

* show settings button when no agents are enabled ([#248](https://github.com/xability/maidr/issues/248)) ([27ba2ca](https://github.com/xability/maidr/commit/27ba2cabf0bf616bc6dccb45dc83798769de0b7c))

## [3.7.1](https://github.com/xability/maidr/compare/v3.7.0...v3.7.1) (2025-05-28)


### Bug Fixes

* optimize candlestick navigation with value-based sorting ([#286](https://github.com/xability/maidr/issues/286)) ([6dce5df](https://github.com/xability/maidr/commit/6dce5df281e0d117cfbdf29ee1cc293a9ccf49ec))

# [3.7.0](https://github.com/xability/maidr/compare/v3.6.0...v3.7.0) (2025-05-28)


### Features

* enhance navigation with y-value-based movement for UPWARD/DOWNWARD directions ([#285](https://github.com/xability/maidr/issues/285)) ([4b94f17](https://github.com/xability/maidr/commit/4b94f176e31d3c0807663335169986091dfc5834))

# [3.6.0](https://github.com/xability/maidr/compare/v3.5.0...v3.6.0) (2025-05-28)


### Features

* let users choose specific llm models within providers ([#253](https://github.com/xability/maidr/issues/253)) ([7803099](https://github.com/xability/maidr/commit/7803099358e96cce6622daf68700f5f2783c682b))

# [3.5.0](https://github.com/xability/maidr/compare/v3.4.1...v3.5.0) (2025-05-27)


### Features

* support audio palette for multiclass plots ([#279](https://github.com/xability/maidr/issues/279)) ([3d70841](https://github.com/xability/maidr/commit/3d7084147130ac5c75097f279456e2f3186f2faa))

## [3.4.1](https://github.com/xability/maidr/compare/v3.4.0...v3.4.1) (2025-05-25)


### Bug Fixes

* assign application role to svg upon activation ([#277](https://github.com/xability/maidr/issues/277)) ([e0a5a43](https://github.com/xability/maidr/commit/e0a5a43b03036c283276ef1659a0d1b10e5a31d4))

# [3.4.0](https://github.com/xability/maidr/compare/v3.3.2...v3.4.0) (2025-05-23)


### Features

* support smooth continuous audio ([#268](https://github.com/xability/maidr/issues/268)) ([7ef714d](https://github.com/xability/maidr/commit/7ef714d5ff6fe0b4a97791696b5f5f4276e992cb))

## [3.3.2](https://github.com/xability/maidr/compare/v3.3.1...v3.3.2) (2025-05-20)


### Bug Fixes

* address e2e test failures ([#267](https://github.com/xability/maidr/issues/267)) ([aed1870](https://github.com/xability/maidr/commit/aed1870d4839b944214fb529c2bb09c999e5d583))

## [3.3.1](https://github.com/xability/maidr/compare/v3.3.0...v3.3.1) (2025-05-19)


### Bug Fixes

* modify filename of vite bundle post build ([#262](https://github.com/xability/maidr/issues/262)) ([949e4ca](https://github.com/xability/maidr/commit/949e4ca0b0028e223af7b9a6914133ad82ff18bb))

# [3.3.0](https://github.com/xability/maidr/compare/v3.2.2...v3.3.0) (2025-05-17)


### Features

* add smooth layer ([#255](https://github.com/xability/maidr/issues/255)) ([86fb3f7](https://github.com/xability/maidr/commit/86fb3f782a25cb3a0976176f6f100cf83921d99c))

## [3.2.2](https://github.com/xability/maidr/compare/v3.2.1...v3.2.2) (2025-05-15)


### Bug Fixes

* tooltip text rendering ([#252](https://github.com/xability/maidr/issues/252)) ([f6548ba](https://github.com/xability/maidr/commit/f6548ba4929a628fe330d8d5b7290144b7505509))

## [3.2.1](https://github.com/xability/maidr/compare/v3.2.0...v3.2.1) (2025-05-15)


### Bug Fixes

* announce new chat responses ([#246](https://github.com/xability/maidr/issues/246)) ([0e40ab2](https://github.com/xability/maidr/commit/0e40ab2dd5af937ef7ad6354cf4d8e2c62254f1c))

# [3.2.0](https://github.com/xability/maidr/compare/v3.1.0...v3.2.0) (2025-05-14)


### Bug Fixes

* implementation of missing handler methods and cleanup of event listeners ([#251](https://github.com/xability/maidr/issues/251)) ([fe27acb](https://github.com/xability/maidr/commit/fe27acb579c75b919318be88c959a7e4bb35a245))


### Features

* add instruction message tooltip on plot hover  ([#244](https://github.com/xability/maidr/issues/244)) ([44966d4](https://github.com/xability/maidr/commit/44966d48f7a7a9462615162653cdae0e5a83c1dc))

# [3.1.0](https://github.com/xability/maidr/compare/v3.0.2...v3.1.0) (2025-05-07)


### Features

* add audio cue while waiting for llm response ([#242](https://github.com/xability/maidr/issues/242)) ([e7971a6](https://github.com/xability/maidr/commit/e7971a6e664208d6487df52a65fb1178495b96c8))

## [3.0.2](https://github.com/xability/maidr/compare/v3.0.1...v3.0.2) (2025-05-06)


### Bug Fixes

* enhance subplot text to include selection instruction ([#241](https://github.com/xability/maidr/issues/241)) ([b4aefbd](https://github.com/xability/maidr/commit/b4aefbd3d5b884b7fd5b761ef4d7bc971dc7971d))

## [3.0.1](https://github.com/xability/maidr/compare/v3.0.0...v3.0.1) (2025-05-03)


### Bug Fixes

* retain the same aria label for llm toggle checkboxes in settings ([#236](https://github.com/xability/maidr/issues/236)) ([c045beb](https://github.com/xability/maidr/commit/c045beb0f8281bccf1a6a7ef7b032aaba8f092f2))

# [3.0.0](https://github.com/xability/maidr/compare/v2.10.1...v3.0.0) (2025-05-01)


* feat!: release v3 ([#232](https://github.com/xability/maidr/issues/232)) ([ca6c18b](https://github.com/xability/maidr/commit/ca6c18b046d2a40a09a5bfa78c01cd9f151cfc41))
* feat!: release v3 ([#233](https://github.com/xability/maidr/issues/233)) ([de13d2d](https://github.com/xability/maidr/commit/de13d2d337e8a72709895e88abeae871614e1071))


### BREAKING CHANGES

* Move maidr-ts to maidr
* Move maidr-ts to maidr

## [2.10.1](https://github.com/xability/maidr/compare/v2.10.0...v2.10.1) (2025-05-01)


### Bug Fixes

* prevent braille onclick to move out of bounds ([#230](https://github.com/xability/maidr/issues/230)) ([a6509b7](https://github.com/xability/maidr/commit/a6509b70fe84db4693ff4224281e8b00a7bc74ec))

# [2.10.0](https://github.com/xability/maidr-ts/compare/v2.9.0...v2.10.0) (2025-05-01)


### Features

* support candlestick braille ([#226](https://github.com/xability/maidr-ts/issues/226)) ([879b3a2](https://github.com/xability/maidr-ts/commit/879b3a254270d8671a83ea6bb6c865c9c213ab38))

# [2.9.0](https://github.com/xability/maidr-ts/compare/v2.8.1...v2.9.0) (2025-04-29)


### Features

* support candlestick plot ([#179](https://github.com/xability/maidr-ts/issues/179)) ([7aaeb0b](https://github.com/xability/maidr-ts/commit/7aaeb0b2c09573265de03cdefa537ab9655b3f69))

## [2.8.1](https://github.com/xability/maidr-ts/compare/v2.8.0...v2.8.1) (2025-04-28)


### Bug Fixes

* braille onclick to move the plot ([#220](https://github.com/xability/maidr-ts/issues/220)) ([5c60780](https://github.com/xability/maidr-ts/commit/5c6078036f0b267baa12f0beaed6ec30e8d2a012))

# [2.8.0](https://github.com/xability/maidr-ts/compare/v2.7.2...v2.8.0) (2025-04-28)


### Features

* support local storage service ([#225](https://github.com/xability/maidr-ts/issues/225)) ([2009f33](https://github.com/xability/maidr-ts/commit/2009f33cf07a0d8e694156fedbf22c1609296e1c))

## [2.7.2](https://github.com/xability/maidr-ts/compare/v2.7.1...v2.7.2) (2025-04-28)


### Bug Fixes

* ci build ([#223](https://github.com/xability/maidr-ts/issues/223)) ([7a24727](https://github.com/xability/maidr-ts/commit/7a247273a8145d1c17581aef961e339db0d6f5c3))

## [2.7.1](https://github.com/xability/maidr-ts/compare/v2.7.0...v2.7.1) (2025-04-28)


### Bug Fixes

* **chat:** disable user input if no agent is enabled ([#175](https://github.com/xability/maidr-ts/issues/175)) ([26d3f23](https://github.com/xability/maidr-ts/commit/26d3f2350f4d2586437362d6113d8187b6179db5))

# [2.7.0](https://github.com/xability/maidr-ts/compare/v2.6.0...v2.7.0) (2025-04-28)


### Features

* support boxplot braille ([#216](https://github.com/xability/maidr-ts/issues/216)) ([fb5f280](https://github.com/xability/maidr-ts/commit/fb5f280424a2304d1bfbbe32abc40c9c5570dee2))

# [2.6.0](https://github.com/xability/maidr-ts/compare/v2.5.2...v2.6.0) (2025-04-28)


### Features

* provide audio feedback when moved out of bounds ([#219](https://github.com/xability/maidr-ts/issues/219)) ([3ab065c](https://github.com/xability/maidr-ts/commit/3ab065c79ef62c3fa4d07161e8020d5da891a934))

## [2.5.2](https://github.com/xability/maidr-ts/compare/v2.5.1...v2.5.2) (2025-04-22)


### Bug Fixes

* set the caret to the first position in review mode ([#215](https://github.com/xability/maidr-ts/issues/215)) ([7390fbb](https://github.com/xability/maidr-ts/commit/7390fbb2b26da0098253999108fcd54a9279fed8))

## [2.5.1](https://github.com/xability/maidr-ts/compare/v2.5.0...v2.5.1) (2025-04-22)


### Bug Fixes

* remove unnecessary verb in heatmap terse mode [#213](https://github.com/xability/maidr-ts/issues/213) ([#214](https://github.com/xability/maidr-ts/issues/214)) ([e91f693](https://github.com/xability/maidr-ts/commit/e91f693b43ed7cab31a4437239f87aa644ceb04d))

# [2.5.0](https://github.com/xability/maidr-ts/compare/v2.4.7...v2.5.0) (2025-04-22)


### Features

* support highlight for boxplot ([#202](https://github.com/xability/maidr-ts/issues/202)) ([6d3eb7d](https://github.com/xability/maidr-ts/commit/6d3eb7d2e0c8390d300dc1578910b4dc1d522162))

## [2.4.7](https://github.com/xability/maidr-ts/compare/v2.4.6...v2.4.7) (2025-04-22)


### Bug Fixes

* lifecycle in multi figure ([#204](https://github.com/xability/maidr-ts/issues/204)) ([6244802](https://github.com/xability/maidr-ts/commit/6244802d500fd6067d4680efad3ba85a9aced479))

## [2.4.6](https://github.com/xability/maidr-ts/compare/v2.4.5...v2.4.6) (2025-04-17)


### Bug Fixes

* audio residue during autoplay ([#191](https://github.com/xability/maidr-ts/issues/191)) ([d96311a](https://github.com/xability/maidr-ts/commit/d96311a3f2633ced0bbb3e94719fa713866fff52))

## [2.4.5](https://github.com/xability/maidr-ts/compare/v2.4.4...v2.4.5) (2025-04-17)


### Bug Fixes

* keybindings and edge highlighting ([#190](https://github.com/xability/maidr-ts/issues/190)) ([2c829fc](https://github.com/xability/maidr-ts/commit/2c829fcc848dab610c4b2e98f0e9eed3236f14c5))
* keybindings and edge highlighting ([#190](https://github.com/xability/maidr-ts/issues/190)) ([#194](https://github.com/xability/maidr-ts/issues/194)) ([b4ded63](https://github.com/xability/maidr-ts/commit/b4ded630867312f9438eb1851219937a432a10d0))

## [2.4.4](https://github.com/xability/maidr-ts/compare/v2.4.3...v2.4.4) (2025-04-16)


### Bug Fixes

* gpt authorization and react rendering and focus ([#182](https://github.com/xability/maidr-ts/issues/182)) ([767d574](https://github.com/xability/maidr-ts/commit/767d574ec4ebc50c3653e212063a37d3b0d58d1b))

## [2.4.3](https://github.com/xability/maidr-ts/compare/v2.4.2...v2.4.3) (2025-04-15)


### Bug Fixes

* revert 'review react component ([#171](https://github.com/xability/maidr-ts/issues/171))' ([#177](https://github.com/xability/maidr-ts/issues/177)) ([15a9f7f](https://github.com/xability/maidr-ts/commit/15a9f7fd5b286415da1e4ba821145054bbfcac30))

## [2.4.2](https://github.com/xability/maidr-ts/compare/v2.4.1...v2.4.2) (2025-04-10)


### Bug Fixes

* show the keyboard shortcuts properly on toggle ([#172](https://github.com/xability/maidr-ts/issues/172)) ([13918b3](https://github.com/xability/maidr-ts/commit/13918b36b1ad1aa9d6e4806d29e5a15008081b2b))

## [2.4.1](https://github.com/xability/maidr-ts/compare/v2.4.0...v2.4.1) (2025-04-10)


### Bug Fixes

* update scatter plot row by row highlighting ([#168](https://github.com/xability/maidr-ts/issues/168)) ([3d39140](https://github.com/xability/maidr-ts/commit/3d39140fd920b799fe3147339b55555400e229ee))

# [2.4.0](https://github.com/xability/maidr-ts/compare/v2.3.1...v2.4.0) (2025-04-10)


### Features

* visual highlighting for scatterplot ([#158](https://github.com/xability/maidr-ts/issues/158)) ([59c13cc](https://github.com/xability/maidr-ts/commit/59c13cc0ebf82175d1d0fc86599c826ef643fe3a))

## [2.3.1](https://github.com/xability/maidr-ts/compare/v2.3.0...v2.3.1) (2025-04-08)


### Performance Improvements

* support mvvm architecture ([#167](https://github.com/xability/maidr-ts/issues/167)) ([ddcb1b2](https://github.com/xability/maidr-ts/commit/ddcb1b24d99f8570833d1eb6402f035d9cc2d18f))

# [2.3.0](https://github.com/xability/maidr-ts/compare/v2.2.0...v2.3.0) (2025-04-08)


### Features

* move text feature to react ([#163](https://github.com/xability/maidr-ts/issues/163)) ([a443bd5](https://github.com/xability/maidr-ts/commit/a443bd5c349f6e67e625ce668cf62436a8ab8c83))

# [2.2.0](https://github.com/xability/maidr-ts/compare/v2.1.0...v2.2.0) (2025-03-30)


### Features

* support line plot highlighting ([#159](https://github.com/xability/maidr-ts/issues/159)) ([454da00](https://github.com/xability/maidr-ts/commit/454da0076a318572b4bb63d6963979df90b59c9e))

# [2.1.0](https://github.com/xability/maidr-ts/compare/v2.0.1...v2.1.0) (2025-03-28)


### Features

* support highlighting for bar plot, histogram, and heatmap ([#157](https://github.com/xability/maidr-ts/issues/157)) ([50064bc](https://github.com/xability/maidr-ts/commit/50064bcaaac93d9bb5985adf10fdd1b40dcf7a65))

## [2.0.1](https://github.com/xability/maidr-ts/compare/v2.0.0...v2.0.1) (2025-03-24)


### Bug Fixes

* update audio to cycle combined mode in multi layer ([#156](https://github.com/xability/maidr-ts/issues/156)) ([9b9fa83](https://github.com/xability/maidr-ts/commit/9b9fa83b19bb58d68591a99db47b76c71817be70))

# [2.0.0](https://github.com/xability/maidr-ts/compare/v1.2.2...v2.0.0) (2025-03-18)


* feat!: release multi layer and subplots ([#155](https://github.com/xability/maidr-ts/issues/155)) ([f8fef21](https://github.com/xability/maidr-ts/commit/f8fef21da17091a692c4a3c24efa1892a117fc64))


### BREAKING CHANGES

* The MAIDR JSON has been modified to include layers and subplots

## [1.2.2](https://github.com/xability/maidr-ts/compare/v1.2.1...v1.2.2) (2025-03-18)


### Bug Fixes

* prevent mutating the maidr data to remove duplicate summary level ([#154](https://github.com/xability/maidr-ts/issues/154)) ([d187750](https://github.com/xability/maidr-ts/commit/d187750eaae8c0de14d044a8136f63e3215d8c4e))

## [1.2.1](https://github.com/xability/maidr-ts/compare/v1.2.0...v1.2.1) (2025-03-12)


### Bug Fixes

* add aria label for llm chat and settings ([#137](https://github.com/xability/maidr-ts/issues/137)) ([25020ec](https://github.com/xability/maidr-ts/commit/25020ecd8d087dbcdac47dcb33c5b9e3664baf5d))

# [1.2.0](https://github.com/xability/maidr-ts/compare/v1.1.2...v1.2.0) (2025-03-06)


### Features

* support jupyter notebook DOM handling ([#127](https://github.com/xability/maidr-ts/issues/127)) ([d10d2f4](https://github.com/xability/maidr-ts/commit/d10d2f4435d92b50b6cfbf0db77e1cdfb511fee7))

## [1.1.2](https://github.com/xability/maidr-ts/compare/v1.1.1...v1.1.2) (2025-03-04)


### Bug Fixes

* stop autoplay using arrow keys ([#129](https://github.com/xability/maidr-ts/issues/129)) ([29a1b3f](https://github.com/xability/maidr-ts/commit/29a1b3f3696796ec31b621777457167cae3253f4))

## [1.1.1](https://github.com/xability/maidr-ts/compare/v1.1.0...v1.1.1) (2025-03-04)


### Bug Fixes

* include dist files in package.json ([#128](https://github.com/xability/maidr-ts/issues/128)) ([0fab03c](https://github.com/xability/maidr-ts/commit/0fab03c03990b3ba0ab9195e8b3bbbfa68e9054c))

# [1.1.0](https://github.com/xability/maidr-ts/compare/v1.0.1...v1.1.0) (2025-03-04)


### Features

* show fill label on `f` key ([#125](https://github.com/xability/maidr-ts/issues/125)) ([5c69baa](https://github.com/xability/maidr-ts/commit/5c69baaee879b298b446b8869b1f760254a7c482))

## [1.0.1](https://github.com/xability/maidr-ts/compare/v1.0.0...v1.0.1) (2025-03-04)


### Bug Fixes

* initial movement and out of bounds settings for 2d plots ([#89](https://github.com/xability/maidr-ts/issues/89)) ([5cc3dbf](https://github.com/xability/maidr-ts/commit/5cc3dbf850ad3b7dc636af5f61ad1b73a4afd48c))

# 1.0.0 (2025-03-01)


### Bug Fixes

* add package-lock.json ([#120](https://github.com/xability/maidr-ts/issues/120)) ([89760d8](https://github.com/xability/maidr-ts/commit/89760d8c19998384eafb7cb1cf6d013d95a36dcd))
* **braille:** restrict the effect of selectionchange event ([#29](https://github.com/xability/maidr-ts/issues/29)) ([b7bfb35](https://github.com/xability/maidr-ts/commit/b7bfb3567ccf0e94909d68f6813c2798194b3647))
* commit message length in semantic release ([#121](https://github.com/xability/maidr-ts/issues/121)) ([3198065](https://github.com/xability/maidr-ts/commit/319806595ed0b5c3b2526b882781392c70edc1f8))
* move describe point to default scope ([#47](https://github.com/xability/maidr-ts/issues/47)) ([9b22902](https://github.com/xability/maidr-ts/commit/9b22902fe50c314ef7f359fdb31d520d69d092f6))
* prevent audio feedback on leftmost and rightmost bars (close [#14](https://github.com/xability/maidr-ts/issues/14)) ([bee2b5a](https://github.com/xability/maidr-ts/commit/bee2b5a0b76ce166ffcae8be7b2ce5c3b816375e))
* remove notification div on blur ([#94](https://github.com/xability/maidr-ts/issues/94)) ([363cd87](https://github.com/xability/maidr-ts/commit/363cd87c8ae5240b0e74a96ed5bcfa78f3ed13ef))
* reorganize HTML hierarchy ([#34](https://github.com/xability/maidr-ts/issues/34)) ([142be79](https://github.com/xability/maidr-ts/commit/142be7970bce2ffa373c7d529795fcd69d007377))
* retain notification container ([#96](https://github.com/xability/maidr-ts/issues/96)) ([49a08d0](https://github.com/xability/maidr-ts/commit/49a08d0208ab320e5972d3a13b7acb675dd29de8))
* start on first point after focus ([#85](https://github.com/xability/maidr-ts/issues/85)) ([35b2bd2](https://github.com/xability/maidr-ts/commit/35b2bd2006d8175b37678a777306610c4e73f7ea))


### Features

* add help menu in react ([#84](https://github.com/xability/maidr-ts/issues/84)) ([eae28a8](https://github.com/xability/maidr-ts/commit/eae28a84706bea5da00dfb564519a1260c7d79ef))
* add llm chat ([#97](https://github.com/xability/maidr-ts/issues/97)) ([fae85f7](https://github.com/xability/maidr-ts/commit/fae85f7671f57c5b0b512b20ab2e5cd1a95034ee))
* add maidr instruction when plot gets focused ([#79](https://github.com/xability/maidr-ts/issues/79)) ([3876225](https://github.com/xability/maidr-ts/commit/38762253bc67690f2f9f637fc1f11f02439edfec))
* add new architecture ([#3](https://github.com/xability/maidr-ts/issues/3)) ([c0c42b2](https://github.com/xability/maidr-ts/commit/c0c42b2177192679b4d7d07ed86d84c4478651ba))
* add scoping hotkeys ([#43](https://github.com/xability/maidr-ts/issues/43)) ([cde46b1](https://github.com/xability/maidr-ts/commit/cde46b15f3a046b413a0dbdd58a8e95162b55c88))
* add title, subtitle and caption to label scope ([#49](https://github.com/xability/maidr-ts/issues/49)) ([45f6cb4](https://github.com/xability/maidr-ts/commit/45f6cb42becd2f0b592a08bcd9b13e81fce1b296))
* integrate review mode with `r` key ([#36](https://github.com/xability/maidr-ts/issues/36)) ([6e279de](https://github.com/xability/maidr-ts/commit/6e279ded23dedf5b6085710952de417556cbe211))
* map braille display's input actions to plot ([#22](https://github.com/xability/maidr-ts/issues/22)) ([7010e92](https://github.com/xability/maidr-ts/commit/7010e9222820f48e3c92d453681da49ea93c819c))
* move to extreme points ([#54](https://github.com/xability/maidr-ts/issues/54)) ([52dc91f](https://github.com/xability/maidr-ts/commit/52dc91f9f3a357a6e6033ac1f40dcf23da21061e))
* support autoplay ([#44](https://github.com/xability/maidr-ts/issues/44)) ([eee0dd6](https://github.com/xability/maidr-ts/commit/eee0dd698c5783f87bdacf41dad1936511a0b70e))
* support boxplot without braille  ([#71](https://github.com/xability/maidr-ts/issues/71)) ([ea566fe](https://github.com/xability/maidr-ts/commit/ea566fe43abf98511e372d854d034db9464a530e))
* support heatmap ([#65](https://github.com/xability/maidr-ts/issues/65)) ([37f1f0f](https://github.com/xability/maidr-ts/commit/37f1f0f75efe0cca110e11fcc58b2e26d7ee5b40))
* support histogram ([#58](https://github.com/xability/maidr-ts/issues/58)) ([fc15163](https://github.com/xability/maidr-ts/commit/fc151637dde31b6c60de8e7c4b74e39a00096e2c))
* support maidr object handling with an attribute to svg or img tag ([#91](https://github.com/xability/maidr-ts/issues/91)) ([4399561](https://github.com/xability/maidr-ts/commit/43995612d3e172ea497795b2da7c098d8e0196c5))
* support scatter plot ([#86](https://github.com/xability/maidr-ts/issues/86)) ([a24468c](https://github.com/xability/maidr-ts/commit/a24468c520835fe1f539999fe09c342cecbe34dc))
* support segmented plots ([#70](https://github.com/xability/maidr-ts/issues/70)) ([fde4815](https://github.com/xability/maidr-ts/commit/fde4815592e493e5de6f6125655fc657b7c3dc87))
* update managers to observe the plot ([#24](https://github.com/xability/maidr-ts/issues/24)) ([06d808e](https://github.com/xability/maidr-ts/commit/06d808ef038f3c63745df6b86f12858049e52854))
