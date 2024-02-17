## [2.0.1](https://github.com/uiuc-ischool-accessible-computing-lab/maidr/compare/v2.0.0...v2.0.1) (2024-02-17)


### Bug Fixes

* **scatterplot:** support svg from matplotlib ([#406](https://github.com/uiuc-ischool-accessible-computing-lab/maidr/issues/406)) ([6069056](https://github.com/uiuc-ischool-accessible-computing-lab/maidr/commit/6069056552ddc5a7f1ffff4c8d2e5a0500430114)), closes [#400](https://github.com/uiuc-ischool-accessible-computing-lab/maidr/issues/400)

# [2.0.0](https://github.com/uiuc-ischool-accessible-computing-lab/maidr/compare/v1.5.0...v2.0.0) (2024-02-15)


### Bug Fixes

* add tabindex attribute to maidrElemn element ([#403](https://github.com/uiuc-ischool-accessible-computing-lab/maidr/issues/403)) ([f51b917](https://github.com/uiuc-ischool-accessible-computing-lab/maidr/commit/f51b9175dee386d82c33dea3b251e4278bc88724))


### Features

* Created ability to chat with multiple LLMs at once ([#402](https://github.com/uiuc-ischool-accessible-computing-lab/maidr/issues/402)) ([80aa119](https://github.com/uiuc-ischool-accessible-computing-lab/maidr/commit/80aa1193315430b2472ad210266b4360f7f3dc36)), closes [#388](https://github.com/uiuc-ischool-accessible-computing-lab/maidr/issues/388)


### BREAKING CHANGES

* Changed the way data was stored in the menu, first time
you run you'll need to update LLM settings

# [1.5.0](https://github.com/uiuc-ischool-accessible-computing-lab/maidr/compare/v1.4.1...v1.5.0) (2024-02-14)


### Features

* add user preferences to accompany initial prompt for LLM ([#401](https://github.com/uiuc-ischool-accessible-computing-lab/maidr/issues/401)) ([8783b82](https://github.com/uiuc-ischool-accessible-computing-lab/maidr/commit/8783b82b314529413ea75de745797c7cf4e1aa7a)), closes [#396](https://github.com/uiuc-ischool-accessible-computing-lab/maidr/issues/396)

## [1.4.1](https://github.com/uiuc-ischool-accessible-computing-lab/maidr/compare/v1.4.0...v1.4.1) (2024-02-08)


### Bug Fixes

* support lack of plot legend in verbose text output ([#395](https://github.com/uiuc-ischool-accessible-computing-lab/maidr/issues/395)) ([a8e92c5](https://github.com/uiuc-ischool-accessible-computing-lab/maidr/commit/a8e92c58a264636afe20fd57c7bed6741660f7db)), closes [#217](https://github.com/uiuc-ischool-accessible-computing-lab/maidr/issues/217)

# [1.4.0](https://github.com/uiuc-ischool-accessible-computing-lab/maidr/compare/v1.3.2...v1.4.0) (2024-02-07)


### Bug Fixes

* Gracefull failure now possible when main data (json schema) lacks elements or selector or both, on all chart types ([#375](https://github.com/uiuc-ischool-accessible-computing-lab/maidr/issues/375)) ([ea26e5b](https://github.com/uiuc-ischool-accessible-computing-lab/maidr/commit/ea26e5b3f224b3e63ae0cdb0cf1855510e10ad87))
* Replaced elements with selector in documentation and examples to conform to the latest maidr json schema spec ([#372](https://github.com/uiuc-ischool-accessible-computing-lab/maidr/issues/372)) ([8a39dd5](https://github.com/uiuc-ischool-accessible-computing-lab/maidr/commit/8a39dd5770cc522c446fa4715358952c61e7566a))


### Features

* add delete buttons for LLM auth keys ([#394](https://github.com/uiuc-ischool-accessible-computing-lab/maidr/issues/394)) ([deffa5a](https://github.com/uiuc-ischool-accessible-computing-lab/maidr/commit/deffa5a8bd8cc85555738f748fb462853de39821)), closes [#378](https://github.com/uiuc-ischool-accessible-computing-lab/maidr/issues/378)
* change LLM modal controls to toggle open/close for easier review ([#393](https://github.com/uiuc-ischool-accessible-computing-lab/maidr/issues/393)) ([63e52b4](https://github.com/uiuc-ischool-accessible-computing-lab/maidr/commit/63e52b4cbd5203a169b87c0bb47495dae0bfe484)), closes [#379](https://github.com/uiuc-ischool-accessible-computing-lab/maidr/issues/379)

## [1.3.2](https://github.com/uiuc-ischool-accessible-computing-lab/maidr/compare/v1.3.1...v1.3.2) (2024-02-02)


### Bug Fixes

* support histogram svg with path tag ([#383](https://github.com/uiuc-ischool-accessible-computing-lab/maidr/issues/383)) ([e47062e](https://github.com/uiuc-ischool-accessible-computing-lab/maidr/commit/e47062e838dc3641cfc6884a53fdeda16ffa5595)), closes [#380](https://github.com/uiuc-ischool-accessible-computing-lab/maidr/issues/380) [#382](https://github.com/uiuc-ischool-accessible-computing-lab/maidr/issues/382)

## [1.3.1](https://github.com/uiuc-ischool-accessible-computing-lab/maidr/compare/v1.3.0...v1.3.1) (2024-02-01)


### Bug Fixes

* change 'other' skill level field under LLM/AI in settings to be more intuitive ([#377](https://github.com/uiuc-ischool-accessible-computing-lab/maidr/issues/377)) ([11d4bab](https://github.com/uiuc-ischool-accessible-computing-lab/maidr/commit/11d4bab0e6553f4ba52c28fc4d5ea9a5682912f4))

# [1.3.0](https://github.com/uiuc-ischool-accessible-computing-lab/maidr/compare/v1.2.2...v1.3.0) (2024-01-25)


### Bug Fixes

* Added fill label in heatmap tutorial ([#362](https://github.com/uiuc-ischool-accessible-computing-lab/maidr/issues/362)) ([3509be0](https://github.com/uiuc-ischool-accessible-computing-lab/maidr/commit/3509be023f6b2f0a6d3ebe6923dbbb0ea7fd3914))
* Made heatmap x, y coordinate regex more robust ([#364](https://github.com/uiuc-ischool-accessible-computing-lab/maidr/issues/364)) ([4fe9e38](https://github.com/uiuc-ischool-accessible-computing-lab/maidr/commit/4fe9e385e5a0854854d729fa6cbd49da0b39bd72))


### Features

* Added Gemini as an option for users, including a menu setting to switch and set auth key ([#365](https://github.com/uiuc-ischool-accessible-computing-lab/maidr/issues/365)) ([cd5da87](https://github.com/uiuc-ischool-accessible-computing-lab/maidr/commit/cd5da87442a0eb4aa4889701ca1bf8e5b8f8d9f5)), closes [#341](https://github.com/uiuc-ischool-accessible-computing-lab/maidr/issues/341)

## [1.2.2](https://github.com/uiuc-ischool-accessible-computing-lab/maidr/compare/v1.2.1...v1.2.2) (2024-01-24)


### Bug Fixes

* **heatmap:** Supported highlighting for rect cell ([#361](https://github.com/uiuc-ischool-accessible-computing-lab/maidr/issues/361)) ([903ff9a](https://github.com/uiuc-ischool-accessible-computing-lab/maidr/commit/903ff9a8c76fa084400f00097a94d62cd6d8f5d7))

## [1.2.1](https://github.com/uiuc-ischool-accessible-computing-lab/maidr/compare/v1.2.0...v1.2.1) (2024-01-23)


### Bug Fixes

* **matplotlib:** Added support to lineplot svg with path tag ([491137a](https://github.com/uiuc-ischool-accessible-computing-lab/maidr/commit/491137a979b3c7735ccd80bdaf6fd8cb693c6865))

# [1.2.0](https://github.com/uiuc-ischool-accessible-computing-lab/maidr/compare/v1.1.0...v1.2.0) (2024-01-18)


### Bug Fixes

* Supported heatmap svg with path tag ([#343](https://github.com/uiuc-ischool-accessible-computing-lab/maidr/issues/343)) ([a052849](https://github.com/uiuc-ischool-accessible-computing-lab/maidr/commit/a052849025c7598e28b7bc1fdeb27f3b5d581d1e))


### Features

* Added 'other' field to level of skill for LLM interaction ([#344](https://github.com/uiuc-ischool-accessible-computing-lab/maidr/issues/344)) ([05cb48f](https://github.com/uiuc-ischool-accessible-computing-lab/maidr/commit/05cb48f60c85ee04c13005033a663ed7455e7946)), closes [#341](https://github.com/uiuc-ischool-accessible-computing-lab/maidr/issues/341)

# [1.1.0](https://github.com/uiuc-ischool-accessible-computing-lab/maidr/compare/v1.0.6...v1.1.0) (2024-01-09)

### Bug Fixes

* added json data to LLM first prompt ([#339](https://github.com/uiuc-ischool-accessible-computing-lab/maidr/issues/339)) ([176adc8](https://github.com/uiuc-ischool-accessible-computing-lab/maidr/commit/176adc8dfb2595a96b36a5ff0c4fe470c4773571)), closes [#334](https://github.com/uiuc-ischool-accessible-computing-lab/maidr/issues/334)
* LLM waiting beep always plays ([#338](https://github.com/uiuc-ischool-accessible-computing-lab/maidr/issues/338)) ([ee5491c](https://github.com/uiuc-ischool-accessible-computing-lab/maidr/commit/ee5491c1288e228a83f40326011ae315521c3624)), closes [#337](https://github.com/uiuc-ischool-accessible-computing-lab/maidr/issues/337)

### Features

* Integrated level of skill into initial LLM prompt, pulling from a user setting ([#340](https://github.com/uiuc-ischool-accessible-computing-lab/maidr/issues/340)) ([fc02b42](https://github.com/uiuc-ischool-accessible-computing-lab/maidr/commit/fc02b42390e35dcc33de61bae707c68959a8ca34))


# [1.0.6] - 2024-01-05

### Internal Chores

- Enforced Conventional Commits for commit messages (#327). This is a BREAKING CHANGE because any commit messages that do not follow the Conventional Commits format will not be accepted by the repository. Please see the [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/) website for more information.
- Added new sections and examples of how to use the Conventional Commits format to the CONTRIBUTING file (#327).

# [1.0.5] - 2024-01-05

### Added

- Added the ability to switch from assertive (default) to polite aria modes, in the help menu (#309).
- Added OpenAI GPT4-vision query system. Hit ? from the main chart to toggle on (#317).
- Added LLM suggestions system for users to be able to more easily click (#333).

### Chores

- Added instructions on how to take a screenshot in in GitHub bug report and pull request templates (#307).
- Commented out the instructions on GitHub templates so that users can keep it while adding new content (#308).
- Added lineplot, stacked bar, dodged bar, and normalized dodge bar info to the README (#310).
- Added Code of Conduct file in the project.

# [1.0.4] - 2023-11-30

### Added

- Added GitHub issue templates for bug report and feature request. [#297](https://github.com/uiuc-ischool-accessible-computing-lab/maidr/issues/297).
- Added some notes on manual testing.
- Added GitHub template for pull requests. [#298](https://github.com/uiuc-ischool-accessible-computing-lab/maidr/issues/298).

### Fixed

- Fixed broken link to the Acknowledgments section in README ([#300](https://github.com/uiuc-ischool-accessible-computing-lab/maidr/issues/300), thanks @sehilyi).
- Fixed typo in scatterplot.js. [#283](https://github.com/uiuc-ischool-accessible-computing-lab/maidr/issues/283).
- Fixed typo in task1_bar_plot.html, correct CSS file now called.
- Fixed initial position out of range. [#287](https://github.com/uiuc-ischool-accessible-computing-lab/maidr/issues/287).
- Fixed issue with sonification and highlight color in bar plots. [#299](https://github.com/uiuc-ischool-accessible-computing-lab/maidr/issues/299).

### Changed

- Updated documentation for all scripts.

# [1.0.0] - 2023-11-01

- Released in NPM.
