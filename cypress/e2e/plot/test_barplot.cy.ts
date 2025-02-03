import 'cypress-real-events/support';

import { Maidr } from "../../../src/model/grammar";
import { TestConstants } from "../../util/constant";

describe('Bar Plot', () => {
  let maidrData: Maidr;

  before(() => {
      // Visit the file and extract the maidr data before all tests
      cy.visit('examples/barplot.html');
      cy.window().then((window) => {
        maidrData = window.maidr;
    });
  });

  beforeEach(() => {
      // Visit the file before each test
      cy.visit('examples/barplot.html');
  })
  it('should load the barplot with maidr data', () => {
      cy.get(TestConstants.SVG + TestConstants.HASH +TestConstants.BAR_ID).should('exist');
  });

  it('should activate maidr on click', () => {
      cy.get(TestConstants.HASH + TestConstants.BAR_ID).click();
      cy.wait(TestConstants.ONE_MILLISECOND);
      cy.focused().should(TestConstants.HAVE_ATTR, TestConstants.HTML_ID, TestConstants.BAR_ID);
  });

  it('should display instruction text', () => {
      cy.get(TestConstants.HASH + TestConstants.BAR_ID).click();
      const maidr_instruction = cy.get(`#${TestConstants.MAIDR_NOTIFICATION_CONTAINER + TestConstants.BAR_ID} ${TestConstants.PARAGRAPH}`);
      maidr_instruction.invoke('text').then((text) => {
        const normalizedText = text.replace(/\s+/g, ' ').trim();
        expect(normalizedText).to.equal(TestConstants.INSTRUCTION_TEXT);
      });
  });

  it('should be able to move from left to right', () => {
      cy.get(TestConstants.HASH + TestConstants.BAR_ID).click();
      if (Array.isArray(maidrData.data)) {
        const numBars = maidrData.data.length;
        for (let i = 0; i < numBars; i++) {
          cy.realPress(TestConstants.RIGHT_ARROW_KEY);
        }
      }
  });

  it('should be able to move from right to left', () => {
      cy.get(TestConstants.HASH + TestConstants.BAR_ID).click();
      if (Array.isArray(maidrData.data)) {
        const numBars = maidrData.data.length;
        for (let i = 0; i < numBars; i++) {
          cy.realPress(TestConstants.RIGHT_ARROW_KEY);
        }
        for (let i = numBars - 1; i >= 0; i--) {
          cy.realPress(TestConstants.LEFT_ARROW_KEY);
          cy.wait(TestConstants.ONE_MILLISECOND);
        }
      }
  });

  it('toggle text mode', () => {
    cy.get(TestConstants.HASH + TestConstants.BAR_ID).click();
    cy.realPress(TestConstants.TEXT_KEY);
    cy.wait(TestConstants.ONE_MILLISECOND);
    cy.contains(TestConstants.TEXT_MODE_TERSE).should(TestConstants.SHOULD_EXIST);
    cy.realPress(TestConstants.TEXT_KEY);
    cy.wait(TestConstants.ONE_MILLISECOND);
    cy.contains(TestConstants.TEXT_MODE_OFF).should(TestConstants.SHOULD_EXIST);
    cy.realPress(TestConstants.TEXT_KEY);
    cy.wait(TestConstants.ONE_MILLISECOND);
    cy.contains(TestConstants.TEXT_MODE_VERBOSE).should(TestConstants.SHOULD_EXIST);
  });

  it('toggle braille mode', () => {
    cy.get(TestConstants.HASH + TestConstants.BAR_ID).click();
    cy.realPress(TestConstants.BRAILLE_KEY);
    cy.wait(TestConstants.ONE_MILLISECOND);
    cy.contains(TestConstants.BRAILLE_MODE_ON).should(TestConstants.SHOULD_EXIST);
    cy.realPress(TestConstants.BRAILLE_KEY);
    cy.wait(TestConstants.ONE_MILLISECOND);
    cy.contains(TestConstants.BRAILLE_MODE_OFF).should(TestConstants.SHOULD_EXIST);
  });

  it('toggle sonification', () => {
    cy.get(TestConstants.HASH + TestConstants.BAR_ID).click();
    cy.realPress(TestConstants.SOUND_KEY);
    cy.wait(TestConstants.ONE_MILLISECOND);
    cy.contains(TestConstants.SOUND_MODE_OFF).should(TestConstants.SHOULD_EXIST);
    cy.realPress(TestConstants.SOUND_KEY);
    cy.wait(TestConstants.ONE_MILLISECOND);
    cy.contains(TestConstants.SOUND_MODE_ON).should(TestConstants.SHOULD_EXIST);
  });

  it('should be able to increase speed', () => {
    cy.get(TestConstants.HASH + TestConstants.BAR_ID).click();
    cy.realPress(TestConstants.PERIOD_KEY);
    cy.wait(TestConstants.ONE_MILLISECOND);
    cy.contains(TestConstants.SPEED_UP).should(TestConstants.SHOULD_EXIST);
  });

  it('should be able to decrease speed', () => {
    cy.get(TestConstants.HASH + TestConstants.BAR_ID).click();
    cy.realPress(TestConstants.COMMA_KEY);
    cy.wait(TestConstants.ONE_MILLISECOND);
    cy.contains(TestConstants.SPEED_DOWN).should(TestConstants.SHOULD_EXIST);
  });

  it('should be able to reset speed', () => {
    cy.get(TestConstants.HASH + TestConstants.BAR_ID).click();
    cy.realPress(TestConstants.SLASH_KEY);
    cy.wait(TestConstants.ONE_MILLISECOND);
    cy.contains(TestConstants.SPEED_RESET).should(TestConstants.SHOULD_EXIST);
  });

  it('should play left extreme point', () => {
    cy.get(TestConstants.HASH + TestConstants.BAR_ID).click();
    cy.realPress([TestConstants.META_KEY, TestConstants.LEFT_ARROW_KEY]);
    // TODO: Add validation for extreme left point
  });

  it('should play right extreme point', () => {
    cy.get(TestConstants.HASH + TestConstants.BAR_ID).click();
    cy.realPress([TestConstants.META_KEY, TestConstants.RIGHT_ARROW_KEY]);
    // TODO: Add validation for extreme right point
  });

  it('should replay the same point', () => {
    cy.get(TestConstants.HASH + TestConstants.BAR_ID).click();
    cy.realPress([TestConstants.META_KEY, TestConstants.RIGHT_ARROW_KEY]);
    cy.wait(TestConstants.ONE_MILLISECOND);
    cy.get(`#${TestConstants.MAIDR_INFO_CONTAINER + TestConstants.BAR_ID} ${TestConstants.PARAGRAPH}`)
      .invoke(TestConstants.INVOKE_TEXT)
      .then((text) => {
          const pointData = text;
          cy.realPress(TestConstants.SPACE_KEY);
          cy.get(`#${TestConstants.MAIDR_INFO_CONTAINER + TestConstants.BAR_ID} ${TestConstants.PARAGRAPH}`)
            .invoke(TestConstants.INVOKE_TEXT) .then((text) => {
              expect(text).to.equal(pointData);
            })
      });
    // TODO: Add validation for replaying the same point
  });
  it('Braille Navigation - left to right', () => {
    cy.get(TestConstants.HASH + TestConstants.BAR_ID).click();
    if (Array.isArray(maidrData.data)) {
      const numBars = maidrData.data.length;
      cy.realPress(TestConstants.BRAILLE_KEY);
      cy.focused().should(TestConstants.HAVE_ID, TestConstants.BRAILLE_TEXTAREA + TestConstants.BAR_ID);
      for (let i = 0; i < numBars; i++) {
        cy.realPress(TestConstants.RIGHT_ARROW_KEY);
      }
    }
  });

  it('Braille Navigation - right to left', () => {
    cy.get(TestConstants.HASH + TestConstants.BAR_ID).click();
    if (Array.isArray(maidrData.data)) {
      const numBars = maidrData.data.length;
      cy.realPress(TestConstants.BRAILLE_KEY);
      cy.focused().should(TestConstants.HAVE_ID, TestConstants.BRAILLE_TEXTAREA + TestConstants.BAR_ID);
      for (let i = 0; i < numBars; i++) {
        cy.realPress(TestConstants.RIGHT_ARROW_KEY);
      }
      for (let i = numBars - 1; i >= 0; i--) {
        cy.realPress(TestConstants.LEFT_ARROW_KEY);
      }
    }
  });

  it('Autoplay - left to right', () => {
    cy.get(TestConstants.HASH + TestConstants.BAR_ID).click();
    if (Array.isArray(maidrData.data)) {
      const numBars = maidrData.data.length;
      cy.realPress([TestConstants.META_KEY, TestConstants.SHIFT_KEY,TestConstants.RIGHT_ARROW_KEY]);
      cy.wait(numBars * TestConstants.ONE_SECOND);
    }
  });

  it('Autoplay - right to left', () => {
    cy.get(TestConstants.HASH + TestConstants.BAR_ID).click();
    if (Array.isArray(maidrData.data)) {
      const numBars = maidrData.data.length;
      for (let i = 0; i < numBars; i++) {
        cy.realPress(TestConstants.RIGHT_ARROW_KEY);
      }
      cy.realPress([TestConstants.META_KEY, TestConstants.SHIFT_KEY,TestConstants.LEFT_ARROW_KEY]);
      cy.wait(numBars * TestConstants.ONE_SECOND);
    }
  });

});
